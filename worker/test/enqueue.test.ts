import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabase as svc } from "../src/supabase.js";

const URL = process.env.SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const EMAIL = "test-enqueue@example.com";
const PASS = "TestEnqueue2026!";

let authed: SupabaseClient;
let userId: string;

async function deleteUserByEmail(email: string) {
  const { data } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const u = data?.users?.find((x) => x.email === email);
  if (u) await svc.auth.admin.deleteUser(u.id);
}

async function cleanTestData() {
  // BD compartida: borrar SOLO los jobs de los casos de prueba (jamás los
  // reales — ya nos comimos un job de producción por un delete amplio).
  const { data: testCases } = await svc
    .from("cases").select("id").like("handle", "test-enq%");
  const testIds = new Set((testCases ?? []).map((c) => c.id));
  if (testIds.size > 0) {
    const { data: jobs } = await svc
      .from("jobs").select("id, payload").eq("type", "investigate").eq("status", "pending");
    const aBorrar = (jobs ?? [])
      .filter((j) => testIds.has((j.payload as { case_id?: string })?.case_id ?? ""))
      .map((j) => j.id);
    if (aBorrar.length > 0) await svc.from("jobs").delete().in("id", aBorrar);
  }
  // casos de prueba (runs caen por cascade)
  await svc.from("cases").delete().like("handle", "test-enq%");
}

beforeAll(async () => {
  await deleteUserByEmail(EMAIL);
  const { data, error } = await svc.auth.admin.createUser({
    email: EMAIL, password: PASS, email_confirm: true,
  });
  if (error) throw error;
  userId = data.user.id;
  authed = createClient(URL, ANON);
  const { error: e2 } = await authed.auth.signInWithPassword({ email: EMAIL, password: PASS });
  if (e2) throw e2;
});

afterAll(async () => {
  await cleanTestData();
  await deleteUserByEmail(EMAIL);
});

beforeEach(cleanTestData);

async function createCase(handle: string): Promise<string> {
  const { data, error } = await authed
    .from("cases")
    .insert({ platform: "twitter", handle, notes: "caso de prueba", created_by: userId })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

describe("enqueue_investigation", () => {
  it("rechaza clientes sin sesión (revocada para anon)", async () => {
    const anon = createClient(URL, ANON);
    const { error } = await anon.rpc("enqueue_investigation", {
      p_case_id: "00000000-0000-0000-0000-000000000000",
    });
    expect(error).not.toBeNull();
  });

  it("encola: crea run queued + job investigate + caso investigando", async () => {
    const caseId = await createCase("test-enq-ok");
    const { data: runId, error } = await authed.rpc("enqueue_investigation", {
      p_case_id: caseId,
    });
    expect(error).toBeNull();
    expect(runId).toBeTruthy();

    const { data: run } = await svc
      .from("investigation_runs").select("status").eq("id", runId).single();
    expect(run!.status).toBe("queued");

    const { data: job } = await svc
      .from("jobs").select("type,payload").contains("payload", { run_id: runId }).single();
    expect(job!.type).toBe("investigate");

    const { data: caso } = await svc
      .from("cases").select("status").eq("id", caseId).single();
    expect(caso!.status).toBe("investigando");
  });

  it("rechaza si ya hay una corrida en curso", async () => {
    const caseId = await createCase("test-enq-dup");
    await authed.rpc("enqueue_investigation", { p_case_id: caseId });
    const { error } = await authed.rpc("enqueue_investigation", { p_case_id: caseId });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/en curso/);
  });
});

describe("índice único de casos", () => {
  it("rechaza el mismo platform+handle (backstop de carreras)", async () => {
    await createCase("test-enq-uniq");
    const { error } = await authed
      .from("cases")
      .insert({ platform: "twitter", handle: "test-enq-uniq", created_by: userId });
    expect(error).not.toBeNull();
    expect(error!.code).toBe("23505");
  });
});
