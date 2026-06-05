import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabase as svc } from "../src/supabase.js";

const URL = process.env.SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const ACT_EMAIL = "test-exp-act@example.com";
const ADM_EMAIL = "test-exp-adm@example.com";
const PASS = "TestExp2026!";

let act: SupabaseClient;
let adm: SupabaseClient;
let actId: string;
let admId: string;
let caseId: string;
let dossierId: string;

async function deleteUserByEmail(email: string) {
  const { data } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const u = data?.users?.find((x) => x.email === email);
  if (u) await svc.auth.admin.deleteUser(u.id);
}

beforeAll(async () => {
  await svc.from("cases").delete().like("handle", "test-exp%");
  await deleteUserByEmail(ACT_EMAIL);
  await deleteUserByEmail(ADM_EMAIL);

  const a = await svc.auth.admin.createUser({ email: ACT_EMAIL, password: PASS, email_confirm: true });
  actId = a.data.user!.id;
  const b = await svc.auth.admin.createUser({ email: ADM_EMAIL, password: PASS, email_confirm: true });
  admId = b.data.user!.id;
  // promoción a admin por canal autorizado (service role)
  await svc.from("profiles").update({ role: "admin" }).eq("id", admId);

  act = createClient(URL, ANON);
  await act.auth.signInWithPassword({ email: ACT_EMAIL, password: PASS });
  adm = createClient(URL, ANON);
  await adm.auth.signInWithPassword({ email: ADM_EMAIL, password: PASS });

  const { data: c } = await svc.from("cases").insert({
    platform: "twitter", handle: "test-exp-1", created_by: actId, status: "needs_review",
  }).select("id").single();
  caseId = c!.id;

  const { data: d } = await svc.from("dossiers").insert({
    case_id: caseId, content: { resumen: "## borrador del agente", score: 80 },
  }).select("id").single();
  dossierId = d!.id;
});

afterAll(async () => {
  await svc.from("cases").delete().like("handle", "test-exp%");
  await deleteUserByEmail(ACT_EMAIL);
  await deleteUserByEmail(ADM_EMAIL);
});

describe("flujo de expedientes", () => {
  it("activista edita el contenido mientras está en draft (RLS)", async () => {
    const { error } = await act.from("dossiers")
      .update({ content: { resumen: "## editado por humana", score: 80 } })
      .eq("id", dossierId);
    expect(error).toBeNull();
    const { data } = await svc.from("dossiers").select("content").eq("id", dossierId).single();
    expect((data!.content as { resumen: string }).resumen).toBe("## editado por humana");
  });

  it("activista NO puede cambiar el status por UPDATE directo", async () => {
    const { error } = await act.from("dossiers")
      .update({ status: "listo_admin" })
      .eq("id", dossierId);
    expect(error).not.toBeNull(); // with check exige status = 'draft'
  });

  it("activista NO puede resolver (solo admin)", async () => {
    const { error } = await act.rpc("resolver_expediente", {
      p_dossier_id: dossierId, p_decision: "aprobar",
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/admin/i);
  });

  it("elevar_expediente: pasa a listo_admin y estampa quién/cuándo", async () => {
    const { error } = await act.rpc("elevar_expediente", { p_dossier_id: dossierId });
    expect(error).toBeNull();
    const { data } = await svc.from("dossiers")
      .select("status, submitted_by, submitted_at").eq("id", dossierId).single();
    expect(data!.status).toBe("listo_admin");
    expect(data!.submitted_by).toBe(actId);
    expect(data!.submitted_at).not.toBeNull();
  });

  it("ya elevado: no se puede editar contenido ni volver a elevar", async () => {
    await act.from("dossiers")
      .update({ content: { resumen: "hackeo", score: 1 } }).eq("id", dossierId);
    const { data } = await svc.from("dossiers").select("content").eq("id", dossierId).single();
    expect((data!.content as { resumen: string }).resumen).toBe("## editado por humana"); // intacto

    const { error } = await act.rpc("elevar_expediente", { p_dossier_id: dossierId });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/borrador/);
  });

  it("decisión inválida es rechazada", async () => {
    const { error } = await adm.rpc("resolver_expediente", {
      p_dossier_id: dossierId, p_decision: "quemar",
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/inválida/);
  });

  it("admin devuelve: vuelve a draft con contenido intacto", async () => {
    const { error } = await adm.rpc("resolver_expediente", {
      p_dossier_id: dossierId, p_decision: "devolver",
    });
    expect(error).toBeNull();
    const { data } = await svc.from("dossiers").select("status, content").eq("id", dossierId).single();
    expect(data!.status).toBe("draft");
    expect((data!.content as { resumen: string }).resumen).toBe("## editado por humana");
  });

  it("admin aprueba: dossier approved + approved_by + caso confirmado", async () => {
    await act.rpc("elevar_expediente", { p_dossier_id: dossierId });
    const { error } = await adm.rpc("resolver_expediente", {
      p_dossier_id: dossierId, p_decision: "aprobar",
    });
    expect(error).toBeNull();
    const { data: d } = await svc.from("dossiers")
      .select("status, approved_by").eq("id", dossierId).single();
    expect(d!.status).toBe("approved");
    expect(d!.approved_by).toBe(admId);
    const { data: c } = await svc.from("cases").select("status").eq("id", caseId).single();
    expect(c!.status).toBe("confirmado");
  });
});
