import { supabase } from "./supabase.js";
import { registerHandler } from "./handlers.js";
import { config } from "./config.js";
import { AnthropicLlm, type LlmClient } from "./agent/llm.js";
import { OpenAiCompatLlm } from "./agent/llmOpenAiCompat.js";
import { MockXClient } from "./agent/xclient.js";
import { runAgent } from "./agent/runtime.js";
import { buildSystemPrompt, buildUserMessage } from "./agent/prompt.js";
import { perfilXTool } from "./agent/tools/perfilX.js";
import { similitudTool } from "./agent/tools/similitud.js";
import { finalizarTool } from "./agent/tools/finalizar.js";

interface InvestigatePayload {
  run_id: string;
  case_id: string;
}

export interface InvestigateDeps {
  llm: LlmClient | null; // null → sin clave: comportamiento stub
}

function defaultDeps(): InvestigateDeps {
  // Prioridad: Claude (Anthropic) → proveedor compatible-OpenAI (Gemini compat,
  // Ollama, Groq…) → null (stub, degradación elegante).
  if (config.anthropicApiKey) {
    return { llm: new AnthropicLlm(config.anthropicApiKey) };
  }
  if (config.llmApiKey && config.llmBaseUrl) {
    return { llm: new OpenAiCompatLlm(config.llmBaseUrl, config.llmApiKey, config.llmModel) };
  }
  return { llm: null };
}

function check(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

const CONFIANZA_NUM = { baja: 0.3, media: 0.6, alta: 0.9 } as const;

export async function runInvestigation(
  payload: Record<string, unknown>,
  deps: InvestigateDeps = defaultDeps(),
): Promise<void> {
  const { run_id, case_id } = payload as unknown as InvestigatePayload;
  if (!run_id || !case_id) throw new Error("payload de investigate inválido");

  check((await supabase.from("investigation_runs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", run_id)).error);

  // Sin ANTHROPIC_API_KEY: degradación elegante al stub (deploy nunca roto).
  if (!deps.llm) {
    check((await supabase.from("agent_steps").insert({
      run_id, step_no: 1, tool_name: "stub",
      reasoning: "Sin ANTHROPIC_API_KEY: veredicto pendiente del agente",
    })).error);
    check((await supabase.from("investigation_runs").update({
      status: "needs_review",
      finished_at: new Date().toISOString(),
      verdict: { stub: true, summary: "Pendiente del agente investigador" },
    }).eq("id", run_id)).error);
    check((await supabase.from("cases")
      .update({ status: "needs_review" }).eq("id", case_id)).error);
    return;
  }

  const { data: caso, error: caseErr } = await supabase
    .from("cases").select("handle, platform, notes").eq("id", case_id).single();
  check(caseErr);

  const tools = [perfilXTool(new MockXClient()), similitudTool(case_id), finalizarTool()];
  const result = await runAgent(
    deps.llm,
    buildSystemPrompt(),
    buildUserMessage(caso!),
    tools,
    {
      maxIterations: config.agentMaxIterations,
      budgetUsd: config.agentBudgetUsd,
      inputUsdPerM: config.llmInputUsdPerM,
      outputUsdPerM: config.llmOutputUsdPerM,
    },
  );

  // Auditoría: un agent_step por vuelta.
  check((await supabase.from("agent_steps").insert(
    result.steps.map((s) => ({
      run_id,
      step_no: s.stepNo,
      tool_name: s.toolName,
      input: s.input ?? null,
      output: s.output ?? null,
      reasoning: s.reasoning,
    })),
  )).error);

  // Evidencia: lo que devolvió perfil_x con datos reales.
  const perfiles = result.steps.filter(
    (s) => s.toolName === "perfil_x" && (s.output as { disponible?: boolean })?.disponible,
  );
  if (perfiles.length > 0) {
    check((await supabase.from("evidence_items").insert(
      perfiles.map((s) => ({
        case_id, run_id, type: "perfil_x", source: "tool", payload: s.output,
      })),
    )).error);
  }

  const v = result.veredicto;

  // Veredicto + métricas en la corrida (summary = alias para la UI de Sub-1).
  check((await supabase.from("investigation_runs").update({
    status: "needs_review",
    finished_at: new Date().toISOString(),
    verdict: { ...v, summary: v.resumen },
    iterations: result.iterations,
    tokens_used: result.tokens,
    cost: result.costUsd,
  }).eq("id", run_id)).error);

  // Score/confianza en el caso.
  check((await supabase.from("cases").update({
    status: "needs_review",
    risk_score: Math.max(0, Math.min(100, Math.round(v.score))),
    confidence: CONFIANZA_NUM[v.confianza] ?? 0.3,
  }).eq("id", case_id)).error);

  // Expediente: upsert del borrador desde el veredicto (no se pisa trabajo humano).
  const dossierContent = {
    resumen: v.resumen,
    score: v.score,
    confianza: v.confianza,
    senales: v.senales,
    modo_degradado: v.modo_degradado,
    parcial: v.parcial ?? false,
  };
  const { data: existingDossier } = await supabase
    .from("dossiers").select("id, status, version").eq("case_id", case_id).maybeSingle();
  if (!existingDossier) {
    check((await supabase.from("dossiers")
      .insert({ case_id, content: dossierContent })).error);
  } else if (existingDossier.status === "draft") {
    check((await supabase.from("dossiers")
      .update({ content: dossierContent, version: existingDossier.version + 1 })
      .eq("id", existingDossier.id)).error);
  }
  // listo_admin / approved: no tocar.

  // Aristas del grafo: solo vinculadas que ya existen como caso (sin recursión en Fase 1).
  for (const cv of v.cuentas_vinculadas ?? []) {
    const { data: target } = await supabase
      .from("cases").select("id").eq("platform", caso!.platform)
      .eq("handle", cv.handle.toLowerCase().replace(/^@+/, "")).maybeSingle();
    if (target && target.id !== case_id) {
      // Ignora duplicados u otros fallos de inserción de aristas (no es fatal).
      await supabase.from("case_links").insert({
        source_case: case_id,
        target_case: target.id,
        relation_type: cv.relacion,
        weight: 0.6,
        discovered_by: "agente",
      });
    }
  }
}

registerHandler("investigate", (p) => runInvestigation(p));
