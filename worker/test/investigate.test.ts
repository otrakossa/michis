import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { supabase as svc } from "../src/supabase.js";
import { tick } from "../src/loop.js";
import "../src/investigate.js"; // registra el handler

const EMAIL = "test-investigate@example.com";
let userId: string;
let caseId: string;
let runId: string;

async function deleteUserByEmail(email: string) {
  const { data } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const u = data?.users?.find((x) => x.email === email);
  if (u) await svc.auth.admin.deleteUser(u.id);
}

beforeAll(async () => {
  await deleteUserByEmail(EMAIL);
  await svc.from("cases").delete().like("handle", "test-inv%");
  const { data, error } = await svc.auth.admin.createUser({
    email: EMAIL, password: "TestInv2026!", email_confirm: true,
  });
  if (error) throw error;
  userId = data.user.id;

  const { data: c } = await svc
    .from("cases")
    .insert({ platform: "twitter", handle: "test-inv-1", created_by: userId, status: "investigando" })
    .select("id").single();
  caseId = c!.id;

  const { data: r } = await svc
    .from("investigation_runs").insert({ case_id: caseId, status: "queued" })
    .select("id").single();
  runId = r!.id;

  await svc.from("jobs").insert({
    type: "investigate",
    payload: { run_id: runId, case_id: caseId },
  });
});

afterAll(async () => {
  await svc.from("cases").delete().like("handle", "test-inv%");
  await deleteUserByEmail(EMAIL);
});

describe("handler investigate (stub)", () => {
  it("procesa el job: run needs_review + step de auditoría + caso needs_review", async () => {
    // la cola puede tener otros jobs: tickear hasta que el nuestro termine
    for (let i = 0; i < 15; i++) {
      const { data } = await svc
        .from("investigation_runs").select("status").eq("id", runId).single();
      if (data!.status === "needs_review") break;
      const processed = await tick();
      if (!processed) break;
    }

    const { data: run } = await svc
      .from("investigation_runs")
      .select("status, verdict, started_at, finished_at")
      .eq("id", runId).single();
    expect(run!.status).toBe("needs_review");
    expect((run!.verdict as { stub: boolean }).stub).toBe(true);
    expect(run!.started_at).not.toBeNull();
    expect(run!.finished_at).not.toBeNull();

    const { data: steps } = await svc
      .from("agent_steps").select("tool_name, reasoning").eq("run_id", runId);
    expect(steps!.length).toBe(1);
    expect(steps![0].tool_name).toBe("stub");

    const { data: caso } = await svc
      .from("cases").select("status").eq("id", caseId).single();
    expect(caso!.status).toBe("needs_review");
  });
});
