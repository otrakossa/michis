import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { supabase as svc } from "../src/supabase.js";
import { similitudTool } from "../src/agent/tools/similitud.js";

const EMAIL = "test-similitud@example.com";
let userId: string;
let caseA: string;

async function deleteUserByEmail(email: string) {
  const { data } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const u = data?.users?.find((x) => x.email === email);
  if (u) await svc.auth.admin.deleteUser(u.id);
}

beforeAll(async () => {
  await deleteUserByEmail(EMAIL);
  await svc.from("cases").delete().like("handle", "test-sim%");
  const { data, error } = await svc.auth.admin.createUser({
    email: EMAIL, password: "TestSim2026!", email_confirm: true,
  });
  if (error) throw error;
  userId = data.user.id;

  const { data: a } = await svc.from("cases").insert({
    platform: "twitter", handle: "test-sim-a", created_by: userId,
    notes: "vacunas covid microchips bill gates control mental 5g",
  }).select("id").single();
  caseA = a!.id;
  await svc.from("cases").insert({
    platform: "twitter", handle: "test-sim-b", created_by: userId,
    notes: "vacunas covid microchips bill gates control mental",
  });
  await svc.from("cases").insert({
    platform: "twitter", handle: "test-sim-c", created_by: userId,
    notes: "recetas de cocina vegetariana con quinoa",
  });
});

afterAll(async () => {
  await svc.from("cases").delete().like("handle", "test-sim%");
  await deleteUserByEmail(EMAIL);
});

describe("similitud_texto", () => {
  it("encuentra el caso con notas similares y excluye el propio", async () => {
    const tool = similitudTool(caseA);
    const result = (await tool.execute({
      texto: "vacunas covid microchips bill gates control mental 5g",
    })) as { case_id: string; handle: string; similarity: number }[];

    const handles = result.map((r) => r.handle);
    expect(handles).toContain("test-sim-b");
    expect(handles).not.toContain("test-sim-a"); // excluido (es el caso investigado)
    expect(handles).not.toContain("test-sim-c"); // no similar
  });
});
