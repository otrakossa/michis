import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabase as svc } from "../src/supabase.js";

const URL = process.env.SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const ADM = "test-compas-adm@example.com";
const ADM2 = "test-compas-adm2@example.com";
const ACT = "test-compas-act@example.com";
const PASS = "TestCompas2026!";

let adm: SupabaseClient;
let act: SupabaseClient;
let admId: string;
let adm2Id: string;
let actId: string;

async function delUser(email: string) {
  const { data } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const u = data?.users?.find((x) => x.email === email);
  if (u) await svc.auth.admin.deleteUser(u.id);
}
async function mkUser(email: string, role: "admin" | "activista") {
  const r = await svc.auth.admin.createUser({ email, password: PASS, email_confirm: true });
  const id = r.data.user!.id;
  await svc.from("profiles").update({ role }).eq("id", id);
  return id;
}

beforeAll(async () => {
  for (const e of [ADM, ADM2, ACT]) await delUser(e);
  admId = await mkUser(ADM, "admin");
  adm2Id = await mkUser(ADM2, "admin");
  actId = await mkUser(ACT, "activista");
  adm = createClient(URL, ANON);
  await adm.auth.signInWithPassword({ email: ADM, password: PASS });
  act = createClient(URL, ANON);
  await act.auth.signInWithPassword({ email: ACT, password: PASS });
});

afterAll(async () => {
  for (const e of [ADM, ADM2, ACT]) await delUser(e);
});

describe("admin_listar_compas", () => {
  it("un activista no está autorizado", async () => {
    const { error } = await act.rpc("admin_listar_compas");
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/no autorizado/i);
  });
  it("un admin ve a los compas con su estado", async () => {
    const { data, error } = await adm.rpc("admin_listar_compas");
    expect(error).toBeNull();
    const fila = (data as Array<{ id: string; estado: string; rol: string }>).find(
      (c) => c.id === actId,
    );
    expect(fila?.estado).toBe("activa");
    expect(fila?.rol).toBe("activista");
  });
});

describe("admin_cambiar_rol", () => {
  it("rechaza un rol inválido", async () => {
    const { error } = await adm.rpc("admin_cambiar_rol", { p_user_id: actId, p_rol: "jefe" });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/rol inválido/i);
  });
  it("promueve y luego degrada a un compa", async () => {
    await adm.rpc("admin_cambiar_rol", { p_user_id: actId, p_rol: "admin" });
    let r = await svc.from("profiles").select("role").eq("id", actId).single();
    expect(r.data!.role).toBe("admin");
    await adm.rpc("admin_cambiar_rol", { p_user_id: actId, p_rol: "activista" });
    r = await svc.from("profiles").select("role").eq("id", actId).single();
    expect(r.data!.role).toBe("activista");
  });
});

describe("is_admin() respeta active", () => {
  it("un admin desactivado deja de ser admin", async () => {
    await svc.from("profiles").update({ active: false }).eq("id", admId);
    const { error } = await adm.rpc("admin_listar_compas");
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/no autorizado/i);
    await svc.from("profiles").update({ active: true }).eq("id", admId);
  });
});

// NOTA: el guardarraíl "tiene que quedar al menos un admin" cuenta admins
// GLOBALMENTE. No se puede provocar su disparo en esta BD compartida sin
// desactivar a los admin reales (peligroso). Su disparo se verifica en el E2E
// manual (ver plan, Task 8). Aquí cubrimos el camino feliz: degradar un admin
// cuando hay otros admin activos funciona y NO toca el guard.
describe("admin_cambiar_rol sobre un admin (con otros admin presentes)", () => {
  it("degrada a un admin secundario sin bloquearse", async () => {
    const { error } = await adm.rpc("admin_cambiar_rol", { p_user_id: adm2Id, p_rol: "activista" });
    expect(error).toBeNull();
    const r = await svc.from("profiles").select("role").eq("id", adm2Id).single();
    expect(r.data!.role).toBe("activista");
  });
});
