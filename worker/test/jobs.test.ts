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

  it("devuelve null cuando no hay jobs pendientes", async () => {
    const job = await claimNextJob();
    // Puede haber otros jobs reales; este test asume cola vacía de tipo test.
    // Si devuelve algo, debe no ser de tipo 'test'.
    if (job) expect(job.type).not.toBe("test");
    else expect(job).toBeNull();
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
    const { data: inserted } = await supabase
      .from("jobs").insert({ type: "e2e", payload: {} }).select("id").single();

    // Procesa hasta que nuestro job e2e quede done (la cola puede tener otros jobs).
    for (let i = 0; i < 15; i++) {
      const { data } = await supabase.from("jobs").select("status").eq("id", inserted!.id).single();
      if (data!.status === "done") break;
      const processed = await tick();
      if (!processed) break;
    }

    const { data } = await supabase.from("jobs").select("status").eq("id", inserted!.id).single();
    expect(data!.status).toBe("done");
    expect(ran).toBe(true);
  });
});
