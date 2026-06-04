import { supabase } from "./supabase.js";
import { registerHandler } from "./handlers.js";

interface InvestigatePayload {
  run_id: string;
  case_id: string;
}

function check(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

// Stub del Sub-proyecto 1: ejercita el pipeline completo (RPC -> cola -> handler
// -> run/steps -> UI). El agente real (Sub-proyecto 2) reemplaza SOLO las tripas.
export async function investigate(payload: Record<string, unknown>): Promise<void> {
  const { run_id, case_id } = payload as unknown as InvestigatePayload;
  if (!run_id || !case_id) throw new Error("payload de investigate inválido");

  check((await supabase.from("investigation_runs")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", run_id)).error);

  check((await supabase.from("agent_steps").insert({
    run_id,
    step_no: 1,
    tool_name: "stub",
    reasoning: "Agente no implementado aún (llega en Sub-proyecto 2)",
  })).error);

  check((await supabase.from("investigation_runs").update({
    status: "needs_review",
    finished_at: new Date().toISOString(),
    verdict: { stub: true, summary: "Pendiente del agente investigador" },
  }).eq("id", run_id)).error);

  check((await supabase.from("cases")
    .update({ status: "needs_review" })
    .eq("id", case_id)).error);
}

registerHandler("investigate", investigate);
