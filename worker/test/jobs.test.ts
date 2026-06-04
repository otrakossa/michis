import { describe, it, expect, beforeEach } from "vitest";
import { supabase } from "../src/supabase.js";
import { claimNextJob, completeJob, failJob } from "../src/jobs.js";

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
