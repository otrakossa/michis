import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabase as svc } from "../src/supabase.js";

const URL = process.env.SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const ACT_EMAIL = "test-camp-act@example.com";
const ADM_EMAIL = "test-camp-adm@example.com";
const PASS = "TestCamp2026!";

let act: SupabaseClient;
let adm: SupabaseClient;
let actId: string;
let admId: string;
let confirmedCaseId: string;
let newCaseId: string;
let campaignId: string;

async function deleteUserByEmail(email: string) {
  const { data } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const u = data?.users?.find((x) => x.email === email);
  if (u) await svc.auth.admin.deleteUser(u.id);
}

beforeAll(async () => {
  await svc.from("cases").delete().like("handle", "test-camp%");
  await deleteUserByEmail(ACT_EMAIL);
  await deleteUserByEmail(ADM_EMAIL);

  const a = await svc.auth.admin.createUser({ email: ACT_EMAIL, password: PASS, email_confirm: true });
  actId = a.data.user!.id;
  const b = await svc.auth.admin.createUser({ email: ADM_EMAIL, password: PASS, email_confirm: true });
  admId = b.data.user!.id;
  await svc.from("profiles").update({ role: "admin" }).eq("id", admId);

  act = createClient(URL, ANON);
  await act.auth.signInWithPassword({ email: ACT_EMAIL, password: PASS });
  adm = createClient(URL, ANON);
  await adm.auth.signInWithPassword({ email: ADM_EMAIL, password: PASS });

  const { data: c1 } = await svc.from("cases").insert({
    platform: "twitter", handle: "test-camp-1", created_by: actId, status: "confirmado",
  }).select("id").single();
  confirmedCaseId = c1!.id;
  const { data: c2 } = await svc.from("cases").insert({
    platform: "twitter", handle: "test-camp-2", created_by: actId, status: "nuevo",
  }).select("id").single();
  newCaseId = c2!.id;
});

afterAll(async () => {
  await svc.from("cases").delete().like("handle", "test-camp%");
  await deleteUserByEmail(ACT_EMAIL);
  await deleteUserByEmail(ADM_EMAIL);
});

describe("activar_campania", () => {
  it("activista no puede activar", async () => {
    const { error } = await act.rpc("activar_campania", {
      p_case_id: confirmedCaseId, p_instructions: "x", p_report_url: "https://x.com",
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/admin/i);
  });

  it("rechaza caso no confirmado", async () => {
    const { error } = await adm.rpc("activar_campania", {
      p_case_id: newCaseId, p_instructions: "x", p_report_url: "https://x.com",
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/confirmado/);
  });

  it("admin activa sobre caso confirmado", async () => {
    const { data, error } = await adm.rpc("activar_campania", {
      p_case_id: confirmedCaseId,
      p_instructions: "Reportar como spam coordinado",
      p_report_url: "https://help.x.com/forms",
    });
    expect(error).toBeNull();
    campaignId = data as string;
    const { data: camp } = await svc.from("denuncia_campaigns")
      .select("status, instructions, report_links, started_by").eq("id", campaignId).single();
    expect(camp!.status).toBe("active");
    expect(camp!.started_by).toBe(admId);
    expect((camp!.report_links as { url: string }).url).toBe("https://help.x.com/forms");
  });

  it("rechaza una segunda campaña activa para el mismo caso", async () => {
    const { error } = await adm.rpc("activar_campania", {
      p_case_id: confirmedCaseId, p_instructions: "y", p_report_url: "https://x.com",
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/Ya hay una campaña activa/);
  });
});

describe("participación y progreso", () => {
  it("progreso inicial: 0 reportes, total >= 2", async () => {
    const { data, error } = await act.rpc("progreso_campania", { p_campaign_id: campaignId });
    expect(error).toBeNull();
    const row = Array.isArray(data) ? data[0] : data;
    expect(row.reportes).toBe(0);
    expect(row.total).toBeGreaterThanOrEqual(2);
  });

  it("activista marca 'ya reporté'", async () => {
    const { error } = await act.from("denuncia_actions")
      .insert({ campaign_id: campaignId, user_id: actId });
    expect(error).toBeNull();
  });

  it("duplicado rechazado (única participación por persona)", async () => {
    const { error } = await act.from("denuncia_actions")
      .insert({ campaign_id: campaignId, user_id: actId });
    expect(error).not.toBeNull();
    expect(error!.code).toBe("23505");
  });

  it("el progreso refleja el reporte", async () => {
    const { data } = await act.rpc("progreso_campania", { p_campaign_id: campaignId });
    const row = Array.isArray(data) ? data[0] : data;
    expect(row.reportes).toBe(1);
  });
});

describe("cerrar_campania", () => {
  it("activista no puede cerrar", async () => {
    const { error } = await act.rpc("cerrar_campania", {
      p_campaign_id: campaignId, p_resultado: "x",
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/admin/i);
  });

  it("admin cierra con resultado", async () => {
    const { error } = await adm.rpc("cerrar_campania", {
      p_campaign_id: campaignId, p_resultado: "cuenta suspendida",
    });
    expect(error).toBeNull();
    const { data } = await svc.from("denuncia_campaigns")
      .select("status, resultado").eq("id", campaignId).single();
    expect(data!.status).toBe("closed");
    expect(data!.resultado).toBe("cuenta suspendida");
  });

  it("no se puede reportar en una campaña cerrada (RLS)", async () => {
    const { error } = await adm.from("denuncia_actions")
      .insert({ campaign_id: campaignId, user_id: admId });
    expect(error).not.toBeNull(); // with check exige campaña active
  });

  it("cerrar una campaña no activa es rechazado", async () => {
    const { error } = await adm.rpc("cerrar_campania", {
      p_campaign_id: campaignId, p_resultado: "y",
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/activa/);
  });
});

describe("validación de URL de reporte (anti-XSS)", () => {
  it("rechaza URLs que no sean http(s)", async () => {
    const { error } = await adm.rpc("activar_campania", {
      p_case_id: confirmedCaseId,
      p_instructions: "x",
      p_report_url: "javascript:alert(1)",
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/http/);
  });
});
