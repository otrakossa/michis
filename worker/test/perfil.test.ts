import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabase as svc } from "../src/supabase.js";

const URL = process.env.SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const EMAIL = "test-perfil@example.com";
const PASS = "TestPerfil2026!";

let authed: SupabaseClient;
let userId: string;

async function deleteUserByEmail(email: string) {
  const { data } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const u = data?.users?.find((x) => x.email === email);
  if (u) await svc.auth.admin.deleteUser(u.id);
}

beforeAll(async () => {
  await deleteUserByEmail(EMAIL);
  const { data, error } = await svc.auth.admin.createUser({
    email: EMAIL, password: PASS, email_confirm: true,
    user_metadata: { display_name: "Nombre Original" },
  });
  if (error) throw error;
  userId = data.user.id;
  authed = createClient(URL, ANON);
  const { error: e2 } = await authed.auth.signInWithPassword({ email: EMAIL, password: PASS });
  if (e2) throw e2;
});

afterAll(async () => {
  await deleteUserByEmail(EMAIL);
});

describe("actualizar_perfil", () => {
  it("rechaza clientes sin sesión", async () => {
    const anon = createClient(URL, ANON);
    const { error } = await anon.rpc("actualizar_perfil", { p_display_name: "Hacker" });
    expect(error).not.toBeNull();
  });

  it("cambia el display_name propio (con trim)", async () => {
    const { error } = await authed.rpc("actualizar_perfil", { p_display_name: "  Kossa Nueva  " });
    expect(error).toBeNull();
    const { data } = await svc.from("profiles")
      .select("display_name, role").eq("id", userId).single();
    expect(data!.display_name).toBe("Kossa Nueva");
    expect(data!.role).toBe("activista"); // el rol sigue intacto
  });

  it("rechaza nombres inválidos (vacío y >60)", async () => {
    const { error: e1 } = await authed.rpc("actualizar_perfil", { p_display_name: "   " });
    expect(e1).not.toBeNull();
    const { error: e2 } = await authed.rpc("actualizar_perfil", { p_display_name: "x".repeat(61) });
    expect(e2).not.toBeNull();
  });

  it("el rol sigue siendo inalterable por el propio usuario (RLS)", async () => {
    const { error } = await authed.from("profiles")
      .update({ role: "admin" }).eq("id", userId);
    // Sin política de auto-update: o error o 0 filas — verificamos en BD.
    void error;
    const { data } = await svc.from("profiles").select("role").eq("id", userId).single();
    expect(data!.role).toBe("activista");
  });
});
