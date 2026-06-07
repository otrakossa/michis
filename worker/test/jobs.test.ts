import { describe, it, expect, beforeEach } from "vitest";
import { supabase } from "../src/supabase.js";
import { claimNextJob, completeJob, failJob } from "../src/jobs.js";
import { tick } from "../src/loop.js";
import { registerHandler } from "../src/handlers.js";

describe("cola de jobs", () => {
  beforeEach(async () => {
    // Limpia jobs de prueba previos
    await supabase.from("jobs").delete().eq("type", "test");
  });

  it("devuelve null exacto con la cola TOTALMENTE vacía (bug de producción)", async () => {
    // Con la cola vacía, PostgREST serializa el NULL compuesto de claim_job
    // como objeto con campos null; claimNextJob debe tratarlo como null.
    // BD compartida: NO se borran jobs reales — se POSPONEN (run_after futuro,
    // claim_job no los ve) y se restauran al final.
    const { data: pendientes } = await supabase
      .from("jobs").select("id").eq("status", "pending");
    const ids = (pendientes ?? []).map((j) => j.id);
    const futuro = new Date(Date.now() + 3600_000).toISOString();
    if (ids.length > 0) {
      await supabase.from("jobs").update({ run_after: futuro }).in("id", ids);
    }
    try {
      const job = await claimNextJob();
      expect(job).toBeNull();
    } finally {
      if (ids.length > 0) {
        await supabase.from("jobs")
          .update({ run_after: new Date().toISOString() }).in("id", ids);
      }
    }
  });

  it("reclama un job pendiente y lo marca como done al completar", async () => {
    await supabase.from("jobs").insert({ type: "test", payload: {} });

    const job = await claimNextJob();
    expect(job).not.toBeNull();
    expect(job!.status).toBe("running");

    await completeJob(job!.id);
    const { data } = await supabase.from("jobs").select("status").eq("id", job!.id).single();
    expect(data!.status).toBe("done");
  });

  it("marca failed con mensaje de error", async () => {
    await supabase.from("jobs").insert({ type: "test", payload: {} });
    const job = await claimNextJob();
    await failJob(job!.id, "boom");
    const { data } = await supabase.from("jobs").select("status,last_error").eq("id", job!.id).single();
    expect(data!.status).toBe("failed");
    expect(data!.last_error).toBe("boom");
  });
});

describe("tick", () => {
  beforeEach(async () => {
    await supabase.from("jobs").delete().eq("type", "e2e");
  });

  it("procesa un job con handler registrado y lo deja done", async () => {
    let ran = false;
    registerHandler("e2e", async () => { ran = true; });

    // BD compartida: tick() reclamaría jobs REALES (sin handler aquí → los
    // marcaría failed). Posponer los pendientes ajenos y restaurarlos al final.
    const { data: pendientes } = await supabase
      .from("jobs").select("id").eq("status", "pending");
    const ajenos = (pendientes ?? []).map((j) => j.id);
    const futuro = new Date(Date.now() + 3600_000).toISOString();
    if (ajenos.length > 0) {
      await supabase.from("jobs").update({ run_after: futuro }).in("id", ajenos);
    }

    try {
      const { data: inserted } = await supabase
        .from("jobs").insert({ type: "e2e", payload: {} }).select("id").single();

      for (let i = 0; i < 15; i++) {
        const { data } = await supabase.from("jobs").select("status").eq("id", inserted!.id).single();
        if (data!.status === "done") break;
        const processed = await tick();
        if (!processed) break;
      }

      const { data } = await supabase.from("jobs").select("status").eq("id", inserted!.id).single();
      expect(data!.status).toBe("done");
      expect(ran).toBe(true);
    } finally {
      if (ajenos.length > 0) {
        await supabase.from("jobs")
          .update({ run_after: new Date().toISOString() }).in("id", ajenos);
      }
    }
  });
});
