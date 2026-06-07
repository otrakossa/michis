// michis — Edge Function "procesar-cola"
// Procesa la cola de jobs con el agente investigador, disparada por pg_cron.
// Port fiel de worker/src/{agent/*,investigate.ts} a Deno (la lógica canónica y
// sus tests viven en el worker; cambios de comportamiento se aplican en ambos).
import { createClient } from "npm:@supabase/supabase-js@2";

// ── Config ──────────────────────────────────────────────────────────────────
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";
const LLM_BASE_URL = Deno.env.get("LLM_BASE_URL") ?? null;
const LLM_API_KEY = Deno.env.get("LLM_API_KEY") ?? null;
const LLM_MODEL = Deno.env.get("LLM_MODEL") ?? "gemini-2.5-flash";
const MAX_ITERATIONS = Number(Deno.env.get("AGENT_MAX_ITERATIONS") ?? "8");
const BUDGET_USD = Number(Deno.env.get("AGENT_BUDGET_USD") ?? "0.5");
const INPUT_USD_PER_M = Number(Deno.env.get("LLM_INPUT_USD_PER_M") ?? "0");
const OUTPUT_USD_PER_M = Number(Deno.env.get("LLM_OUTPUT_USD_PER_M") ?? "0");
// Presupuesto de tiempo por invocación (las edge functions tienen tope de wall clock).
const TIME_BUDGET_MS = 100_000;

// ── Budget ──────────────────────────────────────────────────────────────────
class Budget {
  private spent = 0;
  private tokens = 0;
  constructor(
    private readonly limitUsd: number,
    private readonly inPerM = 3,
    private readonly outPerM = 15,
  ) {}
  add(i: number, o: number) {
    this.tokens += i + o;
    this.spent += (i * this.inPerM + o * this.outPerM) / 1_000_000;
  }
  get costUsd() { return this.spent; }
  get totalTokens() { return this.tokens; }
  get exceeded() { return this.spent >= this.limitUsd; }
}

// ── LLM (OpenAI-compat) ─────────────────────────────────────────────────────
interface LlmToolDef { name: string; description: string; input_schema: Record<string, unknown> }
interface LlmResponse {
  stopReason: string | null;
  text: string;
  toolUse: { id: string; name: string; input: Record<string, unknown> } | null;
  inputTokens: number;
  outputTokens: number;
  raw: unknown;
}
interface OaiToolCall { id: string; type: "function"; function: { name: string; arguments: string } }
interface OaiMessage { role: string; content: string | null; tool_calls?: OaiToolCall[]; tool_call_id?: string }
interface RawAssistant { __oai: true; message: OaiMessage }

function isRawAssistant(v: unknown): v is RawAssistant {
  return typeof v === "object" && v !== null && (v as RawAssistant).__oai === true;
}

function toOaiMessages(messages: unknown[]): OaiMessage[] {
  const out: OaiMessage[] = [];
  for (const m of messages as { role: string; content: unknown }[]) {
    if (m.role === "assistant") {
      if (isRawAssistant(m.content)) out.push(m.content.message);
      else out.push({ role: "assistant", content: String(m.content ?? "") });
      continue;
    }
    if (typeof m.content === "string") {
      out.push({ role: "user", content: m.content });
      continue;
    }
    const textos: string[] = [];
    for (const b of (m.content as { type: string; [k: string]: unknown }[]) ?? []) {
      if (b.type === "tool_result") {
        out.push({ role: "tool", tool_call_id: String(b.tool_use_id), content: String(b.content ?? "") });
      } else if (b.type === "text") textos.push(String(b.text));
    }
    if (textos.length > 0) out.push({ role: "user", content: textos.join("\n") });
  }
  return out;
}

async function llmCreate(params: {
  system: string; messages: unknown[]; tools: LlmToolDef[]; forceTool?: string;
}): Promise<LlmResponse> {
  const body = {
    model: LLM_MODEL,
    messages: [{ role: "system", content: params.system }, ...toOaiMessages(params.messages)],
    tools: params.tools.map((t) => ({
      type: "function", function: { name: t.name, description: t.description, parameters: t.input_schema },
    })),
    ...(params.forceTool ? { tool_choice: { type: "function", function: { name: params.forceTool } } } : {}),
  };
  const ESPERAS = [0, 2_000, 6_000];
  let res!: Response;
  for (let i = 0; i < ESPERAS.length; i++) {
    if (ESPERAS[i] > 0) await new Promise((r) => setTimeout(r, ESPERAS[i]));
    res = await fetch(`${LLM_BASE_URL!.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${LLM_API_KEY}` },
      body: JSON.stringify(body),
    });
    if (res.ok || (res.status !== 429 && res.status < 500)) break;
  }
  if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json() as {
    choices: { message: OaiMessage; finish_reason: string | null }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const msg = data.choices?.[0]?.message ?? { role: "assistant", content: "" };
  const call = msg.tool_calls?.[0] ?? null;
  let input: Record<string, unknown> = {};
  if (call) { try { input = JSON.parse(call.function.arguments || "{}"); } catch { input = {}; } }
  return {
    stopReason: data.choices?.[0]?.finish_reason ?? null,
    text: typeof msg.content === "string" ? msg.content : "",
    toolUse: call ? { id: call.id, name: call.function.name, input } : null,
    inputTokens: data.usage?.prompt_tokens ?? 0,
    outputTokens: data.usage?.completion_tokens ?? 0,
    raw: { __oai: true, message: msg } satisfies RawAssistant,
  };
}

// ── Prompt ──────────────────────────────────────────────────────────────────
function buildSystemPrompt(): string {
  return `Eres una analista experta en detección de cuentas sintéticas (bots) y operaciones de
influencia en redes sociales, trabajando para un colectivo de activistas de causas sociales.
El contexto principal es contenido en español latinoamericano.

Tu tarea: investigar la cuenta indicada y emitir un veredicto riguroso y DEFENDIBLE.

Señales típicas de cuenta sintética (no exhaustivas):
- Handle con sufijos numéricos aleatorios; cuenta reciente con actividad desmedida.
- Ratio seguidos/seguidores anómalo; actividad 24/7 o en ráfagas inhumanas.
- Texto idéntico o casi idéntico al de otras cuentas (copypasta → granja).
- Amplificación coordinada de narrativas; lenguaje genérico o traducido.

Herramientas disponibles:
- perfil_x: datos reales del perfil (si disponible:false, no hay API de X: trabaja en
  modo degradado con las notas del caso y la similitud interna, y decláralo).
- similitud_texto: busca casos del colectivo con texto similar (señal de granja).
- finalizar_investigacion: SIEMPRE termina llamando esta herramienta.

Reglas:
- El score del veredicto es un ENTERO de 0 a 100 (probabilidad porcentual de
  cuenta sintética). Nunca uses escala 0-5 ni 0-10.
- Cada señal con peso honesto (1-5). Si la evidencia es débil: score bajo y confianza baja.
- El resumen es un borrador de expediente en markdown: solo afirmaciones respaldadas por
  la evidencia que recolectaste en esta investigación. Un humano lo revisará y decidirá.`;
}

function buildUserMessage(caso: { handle: string; platform: string; notes: string | null }): string {
  return `Investiga la cuenta @${caso.handle} (plataforma: ${caso.platform}).
Notas del activista que la reportó: ${caso.notes ?? "(sin notas)"}`;
}

// ── Tools ───────────────────────────────────────────────────────────────────
interface AgentTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  execute(input: Record<string, unknown>): Promise<unknown>;
}

const FINALIZAR = "finalizar_investigacion";

interface Veredicto {
  score: number;
  confianza: "baja" | "media" | "alta";
  senales: { tipo: string; descripcion: string; peso: number }[];
  cuentas_vinculadas: { handle: string; relacion: string; razon: string }[];
  resumen: string;
  modo_degradado: boolean;
  parcial?: boolean;
}

function buildTools(caseId: string): AgentTool[] {
  return [
    {
      name: "perfil_x",
      description:
        "Obtiene el perfil público de una cuenta de X/Twitter. Si devuelve disponible:false " +
        "no hay acceso a la API de X y debes investigar en modo degradado (decláralo).",
      input_schema: { type: "object", properties: { handle: { type: "string" } }, required: ["handle"] },
      // Sin clave de X todavía: mock (mismo comportamiento que el worker).
      execute: async () => ({ disponible: false, motivo: "Sin clave de API de X configurada (modo degradado)" }),
    },
    {
      name: "similitud_texto",
      description:
        "Busca en la base de casos del colectivo otros casos con notas/contenido textual " +
        "similar. Similitud alta entre cuentas distintas sugiere copypasta o granja.",
      input_schema: { type: "object", properties: { texto: { type: "string" } }, required: ["texto"] },
      execute: async (input) => {
        const { data, error } = await supabase.rpc("find_similar_cases", {
          p_texto: String(input.texto), p_exclude_case: caseId,
        });
        if (error) throw new Error(error.message);
        return data ?? [];
      },
    },
    {
      name: FINALIZAR,
      description:
        "Termina la investigación entregando el veredicto final. DEBES llamarla cuando tengas " +
        "suficiente evidencia o cuando se te indique cerrar. Sé riguroso. IMPORTANTE: score es " +
        "un ENTERO de 0 a 100 (probabilidad porcentual). NUNCA escala 0-5 ni 0-10.",
      input_schema: {
        type: "object",
        properties: {
          score: { type: "number", minimum: 0, maximum: 100, description: "entero 0-100" },
          confianza: { enum: ["baja", "media", "alta"] },
          senales: {
            type: "array",
            items: {
              type: "object",
              properties: {
                tipo: { type: "string" }, descripcion: { type: "string" },
                peso: { type: "number", minimum: 1, maximum: 5 },
              },
              required: ["tipo", "descripcion", "peso"],
            },
          },
          cuentas_vinculadas: {
            type: "array",
            items: {
              type: "object",
              properties: {
                handle: { type: "string" },
                relacion: { enum: ["mismo_texto", "amplificacion_coordinada", "mismo_avatar"] },
                razon: { type: "string" },
              },
              required: ["handle", "relacion", "razon"],
            },
          },
          resumen: { type: "string" },
          modo_degradado: { type: "boolean" },
        },
        required: ["score", "confianza", "senales", "cuentas_vinculadas", "resumen", "modo_degradado"],
      },
      execute: async () => null,
    },
  ];
}

// ── Runtime del agente ──────────────────────────────────────────────────────
interface StepRecord { stepNo: number; toolName: string | null; input: unknown; output: unknown; reasoning: string }
interface AgentResult { veredicto: Veredicto; steps: StepRecord[]; iterations: number; tokens: number; costUsd: number }
type Msg = { role: "user" | "assistant"; content: unknown };

function pushUserText(messages: Msg[], text: string): void {
  const last = messages[messages.length - 1];
  if (last && last.role === "user") {
    const block = { type: "text", text };
    if (Array.isArray(last.content)) last.content.push(block);
    else last.content = [{ type: "text", text: String(last.content) }, block];
  } else {
    messages.push({ role: "user", content: text });
  }
}

async function runAgent(system: string, userMessage: string, tools: AgentTool[]): Promise<AgentResult> {
  const budget = new Budget(BUDGET_USD, INPUT_USD_PER_M, OUTPUT_USD_PER_M);
  const steps: StepRecord[] = [];
  const toolDefs = tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema }));
  const byName = new Map(tools.map((t) => [t.name, t]));
  const messages: Msg[] = [{ role: "user", content: userMessage }];
  let iter = 0;

  while (iter < MAX_ITERATIONS && !budget.exceeded) {
    iter++;
    const resp = await llmCreate({ system, messages, tools: toolDefs });
    budget.add(resp.inputTokens, resp.outputTokens);
    if (resp.toolUse) {
      const { id, name, input } = resp.toolUse;
      if (name === FINALIZAR) {
        steps.push({ stepNo: iter, toolName: name, input, output: null, reasoning: resp.text });
        return { veredicto: input as unknown as Veredicto, steps, iterations: iter, tokens: budget.totalTokens, costUsd: budget.costUsd };
      }
      const tool = byName.get(name);
      let output: unknown;
      let isError = false;
      try {
        if (!tool) { output = `Herramienta desconocida: ${name}`; isError = true; }
        else output = await tool.execute(input);
      } catch (err) {
        output = `Error: ${err instanceof Error ? err.message : String(err)}`;
        isError = true;
      }
      steps.push({ stepNo: iter, toolName: name, input, output, reasoning: resp.text });
      messages.push({ role: "assistant", content: resp.raw });
      messages.push({
        role: "user",
        content: [{ type: "tool_result", tool_use_id: id, content: JSON.stringify(output), is_error: isError }],
      });
    } else {
      steps.push({ stepNo: iter, toolName: null, input: null, output: null, reasoning: resp.text });
      messages.push({ role: "assistant", content: resp.raw });
      pushUserText(messages, "Continúa la investigación. Cuando tengas suficiente evidencia, llama a finalizar_investigacion.");
    }
  }

  iter++;
  pushUserText(messages, "Se alcanzó el límite de la investigación. Entrega tu veredicto AHORA llamando a finalizar_investigacion con la evidencia disponible.");
  const resp = await llmCreate({ system, messages, tools: toolDefs, forceTool: FINALIZAR });
  budget.add(resp.inputTokens, resp.outputTokens);
  const input = (resp.toolUse?.input ?? {
    score: 0, confianza: "baja", senales: [], cuentas_vinculadas: [],
    resumen: "Investigación inconclusa: el agente no entregó veredicto.", modo_degradado: true,
  }) as unknown as Veredicto;
  steps.push({ stepNo: iter, toolName: FINALIZAR, input, output: null, reasoning: resp.text });
  return { veredicto: { ...input, parcial: true }, steps, iterations: iter, tokens: budget.totalTokens, costUsd: budget.costUsd };
}

// ── Persistencia (idéntica al worker) ───────────────────────────────────────
function check(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}
const CONFIANZA_NUM: Record<string, number> = { baja: 0.3, media: 0.6, alta: 0.9 };

async function runInvestigation(payload: Record<string, unknown>): Promise<void> {
  const run_id = String(payload.run_id ?? "");
  const case_id = String(payload.case_id ?? "");
  if (!run_id || !case_id) throw new Error("payload de investigate inválido");

  check((await supabase.from("investigation_runs")
    .update({ status: "running", started_at: new Date().toISOString() }).eq("id", run_id)).error);

  if (!LLM_API_KEY || !LLM_BASE_URL) {
    // Sin proveedor LLM configurado: stub (degradación elegante).
    check((await supabase.from("agent_steps").insert({
      run_id, step_no: 1, tool_name: "stub",
      reasoning: "Sin proveedor LLM configurado: veredicto pendiente del agente",
    })).error);
    check((await supabase.from("investigation_runs").update({
      status: "needs_review", finished_at: new Date().toISOString(),
      verdict: { stub: true, summary: "Pendiente del agente investigador" },
    }).eq("id", run_id)).error);
    check((await supabase.from("cases").update({ status: "needs_review" }).eq("id", case_id)).error);
    return;
  }

  const { data: caso, error: caseErr } = await supabase
    .from("cases").select("handle, platform, notes").eq("id", case_id).single();
  check(caseErr);

  let result: AgentResult;
  try {
    result = await runAgent(buildSystemPrompt(), buildUserMessage(caso!), buildTools(case_id));
  } catch (err) {
    await supabase.from("investigation_runs")
      .update({ status: "failed", finished_at: new Date().toISOString() }).eq("id", run_id);
    await supabase.from("cases").update({ status: "nuevo" }).eq("id", case_id);
    throw err;
  }

  check((await supabase.from("agent_steps").insert(
    result.steps.map((s) => ({
      run_id, step_no: s.stepNo, tool_name: s.toolName,
      input: s.input ?? null, output: s.output ?? null, reasoning: s.reasoning,
    })),
  )).error);

  const perfiles = result.steps.filter(
    (s) => s.toolName === "perfil_x" && (s.output as { disponible?: boolean })?.disponible,
  );
  if (perfiles.length > 0) {
    check((await supabase.from("evidence_items").insert(
      perfiles.map((s) => ({ case_id, run_id, type: "perfil_x", source: "tool", payload: s.output })),
    )).error);
  }

  const v = result.veredicto;
  check((await supabase.from("investigation_runs").update({
    status: "needs_review", finished_at: new Date().toISOString(),
    verdict: { ...v, summary: v.resumen },
    iterations: result.iterations, tokens_used: result.tokens, cost: result.costUsd,
  }).eq("id", run_id)).error);

  check((await supabase.from("cases").update({
    status: "needs_review",
    risk_score: Math.max(0, Math.min(100, Math.round(v.score))),
    confidence: CONFIANZA_NUM[v.confianza] ?? 0.3,
  }).eq("id", case_id)).error);

  for (const cv of v.cuentas_vinculadas ?? []) {
    const { data: target } = await supabase
      .from("cases").select("id").eq("platform", caso!.platform)
      .eq("handle", cv.handle.toLowerCase().replace(/^@+/, "")).maybeSingle();
    if (target && target.id !== case_id) {
      await supabase.from("case_links").insert({
        source_case: case_id, target_case: target.id,
        relation_type: cv.relacion, weight: 0.6, discovered_by: "agente",
      });
    }
  }

  // Expediente: upsert sin pisar trabajo humano.
  const dossierContent = {
    resumen: v.resumen, score: v.score, confianza: v.confianza,
    senales: v.senales, modo_degradado: v.modo_degradado, parcial: v.parcial ?? false,
  };
  const { data: existing } = await supabase
    .from("dossiers").select("id, status, version").eq("case_id", case_id).maybeSingle();
  if (!existing) {
    check((await supabase.from("dossiers").insert({ case_id, content: dossierContent })).error);
  } else if (existing.status === "draft") {
    check((await supabase.from("dossiers")
      .update({ content: dossierContent, version: existing.version + 1 }).eq("id", existing.id)).error);
  }
}

// ── Cola ────────────────────────────────────────────────────────────────────
interface Job { id: string; type: string; payload: Record<string, unknown> }

async function claimNextJob(): Promise<Job | null> {
  const { data, error } = await supabase.rpc("claim_job");
  if (error) throw error;
  const job = data as Job | null;
  if (!job || !job.id) return null;
  return job;
}

async function tick(): Promise<boolean> {
  const job = await claimNextJob();
  if (!job) return false;
  try {
    if (job.type !== "investigate") {
      await supabase.from("jobs").update({ status: "failed", last_error: `Tipo de job sin handler: ${job.type}` }).eq("id", job.id);
      return true;
    }
    await runInvestigation(job.payload);
    await supabase.from("jobs").update({ status: "done" }).eq("id", job.id);
  } catch (err) {
    await supabase.from("jobs").update({
      status: "failed",
      last_error: err instanceof Error ? err.message : String(err),
    }).eq("id", job.id);
  }
  return true;
}

// ── HTTP handler ────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (!CRON_SECRET || req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response(JSON.stringify({ error: "no autorizado" }), { status: 401 });
  }
  const inicio = Date.now();
  let procesados = 0;
  while (Date.now() - inicio < TIME_BUDGET_MS) {
    const hubo = await tick();
    if (!hubo) break;
    procesados++;
  }
  return new Response(JSON.stringify({ procesados, ms: Date.now() - inicio }), {
    headers: { "content-type": "application/json" },
  });
});
