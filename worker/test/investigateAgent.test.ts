import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { supabase as svc } from "../src/supabase.js";
import { runInvestigation } from "../src/investigate.js";
import { FINALIZAR } from "../src/agent/tools/finalizar.js";
import { FakeLlm } from "./fakes.js";

const EMAIL = "test-agent@example.com";
let userId: string;
let caseId: string;
let linkedCaseId: string;
let runId: string;

async function deleteUserByEmail(email: string) {
  const { data } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const u = data?.users?.find((x) => x.email === email);
  if (u) await svc.auth.admin.deleteUser(u.id);
}

beforeAll(async () => {
  await deleteUserByEmail(EMAIL);
  await svc.from("cases").delete().like("handle", "test-agent%");
  const { data, error } = await svc.auth.admin.createUser({
    email: EMAIL, password: "TestAgent2026!", email_confirm: true,
  });
  if (error) throw error;
  userId = data.user.id;

  const { data: c } = await svc.from("cases").insert({
    platform: "twitter", handle: "test-agent-main", created_by: userId,
    status: "investigando", notes: "sospechosa",
  }).select("id").single();
  caseId = c!.id;

  const { data: l } = await svc.from("cases").insert({
    platform: "twitter", handle: "test-agent-linked", created_by: userId,
  }).select("id").single();
  linkedCaseId = l!.id;

  const { data: r } = await svc.from("investigation_runs")
    .insert({ case_id: caseId, status: "queued" }).select("id").single();
  runId = r!.id;
});

afterAll(async () => {
  await svc.from("cases").delete().like("handle", "test-agent%");
  await deleteUserByEmail(EMAIL);
});

describe("runInvestigation con agente (FakeLlm)", () => {
  it("persiste veredicto, steps, score del caso y case_links", async () => {
    const llm = new FakeLlm([
      { toolUse: { id: "1", name: "perfil_x", input: { handle: "test-agent-main" } }, text: "reviso perfil" },
      {
        toolUse: {
          id: "2", name: FINALIZAR,
          input: {
            score: 85, confianza: "alta",
            senales: [{ tipo: "texto_duplicado", descripcion: "copypasta", peso: 5 }],
            cuentas_vinculadas: [
              { handle: "test-agent-linked", relacion: "mismo_texto", razon: "mismo texto" },
              { handle: "no-existe-en-bd", relacion: "mismo_avatar", razon: "avatar" },
            ],
            resumen: "## Expediente de prueba", modo_degradado: true,
          },
        },
      },
    ]);

    await runInvestigation({ run_id: runId, case_id: caseId }, { llm });

    const { data: run } = await svc.from("investigation_runs")
      .select("status, verdict, iterations, tokens_used, cost").eq("id", runId).single();
    expect(run!.status).toBe("needs_review");
    const v = run!.verdict as { score: number; summary: string; resumen: string };
    expect(v.score).toBe(85);
    expect(v.summary).toBe("## Expediente de prueba"); // alias para la UI
    expect(run!.iterations).toBe(2);
    expect(run!.tokens_used).toBeGreaterThan(0);

    const { data: steps } = await svc.from("agent_steps")
      .select("step_no, tool_name").eq("run_id", runId).order("step_no");
    expect(steps!.length).toBe(2);
    expect(steps![0].tool_name).toBe("perfil_x");
    expect(steps![1].tool_name).toBe(FINALIZAR);

    const { data: caso } = await svc.from("cases")
      .select("status, risk_score, confidence").eq("id", caseId).single();
    expect(caso!.status).toBe("needs_review");
    expect(caso!.risk_score).toBe(85);
    expect(Number(caso!.confidence)).toBeCloseTo(0.9);

    const { data: links } = await svc.from("case_links")
      .select("target_case, relation_type, discovered_by").eq("source_case", caseId);
    expect(links!.length).toBe(1); // solo la vinculada que existe como caso
    expect(links![0].target_case).toBe(linkedCaseId);
    expect(links![0].relation_type).toBe("mismo_texto");
    expect(links![0].discovered_by).toBe("agente");
  });
});
