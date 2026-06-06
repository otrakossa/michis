import type { LlmClient, LlmCreateParams, LlmResponse, LlmToolDef } from "./llm.js";

// Implementación de LlmClient para cualquier API compatible con OpenAI
// (Gemini compat, Ollama, Groq, DeepSeek, Mistral, OpenRouter, OpenAI...).
// El runtime construye el historial en formato estilo-Anthropic; esta clase
// lo traduce al formato OpenAI en cada llamada.

interface OaiToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface OaiMessage {
  role: string;
  content: string | null;
  tool_calls?: OaiToolCall[];
  tool_call_id?: string;
}

// Marca para reconocer nuestro propio `raw` al reinyectar turnos assistant.
interface RawAssistant {
  __oai: true;
  message: OaiMessage;
}

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
    // Lista de bloques estilo Anthropic: tool_result -> mensaje "tool";
    // text -> mensaje "user".
    const textos: string[] = [];
    for (const b of (m.content as { type: string; [k: string]: unknown }[]) ?? []) {
      if (b.type === "tool_result") {
        out.push({
          role: "tool",
          tool_call_id: String(b.tool_use_id),
          content: String(b.content ?? ""),
        });
      } else if (b.type === "text") {
        textos.push(String(b.text));
      }
    }
    if (textos.length > 0) out.push({ role: "user", content: textos.join("\n") });
  }
  return out;
}

function toOaiTools(tools: LlmToolDef[]) {
  return tools.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }));
}

export class OpenAiCompatLlm implements LlmClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
    private readonly doFetch: typeof fetch = fetch,
  ) {}

  async create({ system, messages, tools, forceTool }: LlmCreateParams): Promise<LlmResponse> {
    const body = {
      model: this.model,
      messages: [{ role: "system", content: system }, ...toOaiMessages(messages)],
      tools: toOaiTools(tools),
      ...(forceTool
        ? { tool_choice: { type: "function", function: { name: forceTool } } }
        : {}),
    };
    // Saturación/límites transitorios (429/5xx) son comunes en tiers gratis:
    // reintentar con backoff antes de rendirse.
    const ESPERAS_MS = [0, 2_000, 6_000];
    let res!: Response;
    for (let intento = 0; intento < ESPERAS_MS.length; intento++) {
      if (ESPERAS_MS[intento] > 0) {
        await new Promise((r) => setTimeout(r, ESPERAS_MS[intento]));
      }
      res = await this.doFetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
      });
      if (res.ok || (res.status !== 429 && res.status < 500)) break;
    }
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      throw new Error(`LLM ${res.status}: ${detail}`);
    }
    const data = (await res.json()) as {
      choices: { message: OaiMessage; finish_reason: string | null }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const msg = data.choices?.[0]?.message ?? { role: "assistant", content: "" };
    const call = msg.tool_calls?.[0] ?? null;
    let input: Record<string, unknown> = {};
    if (call) {
      try {
        input = JSON.parse(call.function.arguments || "{}");
      } catch {
        input = {};
      }
    }
    return {
      stopReason: data.choices?.[0]?.finish_reason ?? null,
      text: typeof msg.content === "string" ? msg.content : "",
      toolUse: call ? { id: call.id, name: call.function.name, input } : null,
      inputTokens: data.usage?.prompt_tokens ?? 0,
      outputTokens: data.usage?.completion_tokens ?? 0,
      raw: { __oai: true, message: msg } satisfies RawAssistant,
    };
  }
}
