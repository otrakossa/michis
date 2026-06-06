import { describe, it, expect } from "vitest";
import { OpenAiCompatLlm } from "../src/agent/llmOpenAiCompat.js";

function fakeFetch(reply: unknown, capture: { url?: string; body?: any }) {
  return (async (url: any, init: any) => {
    capture.url = String(url);
    capture.body = JSON.parse(init.body);
    return {
      ok: true,
      status: 200,
      json: async () => reply,
      text: async () => JSON.stringify(reply),
    } as Response;
  }) as typeof fetch;
}

const TOOLS = [
  { name: "perfil_x", description: "perfil", input_schema: { type: "object", properties: {} } },
];

describe("OpenAiCompatLlm", () => {
  it("traduce la petición al formato OpenAI (system, tools, tool_choice forzado)", async () => {
    const cap: { url?: string; body?: any } = {};
    const llm = new OpenAiCompatLlm("https://api.ejemplo/v1", "k", "modelo-x", fakeFetch({
      choices: [{ message: { role: "assistant", content: "hola" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    }, cap));

    await llm.create({
      system: "eres analista",
      messages: [{ role: "user", content: "investiga" }],
      tools: TOOLS,
      forceTool: "perfil_x",
    });

    expect(cap.url).toBe("https://api.ejemplo/v1/chat/completions");
    expect(cap.body.model).toBe("modelo-x");
    expect(cap.body.messages[0]).toEqual({ role: "system", content: "eres analista" });
    expect(cap.body.messages[1]).toEqual({ role: "user", content: "investiga" });
    expect(cap.body.tools[0].type).toBe("function");
    expect(cap.body.tools[0].function.name).toBe("perfil_x");
    expect(cap.body.tool_choice.function.name).toBe("perfil_x");
  });

  it("parsea tool_calls, texto y usage de la respuesta", async () => {
    const cap: { url?: string; body?: any } = {};
    const llm = new OpenAiCompatLlm("https://api.ejemplo/v1", "k", "m", fakeFetch({
      choices: [{
        message: {
          role: "assistant", content: "miro el perfil",
          tool_calls: [{ id: "c1", type: "function", function: { name: "perfil_x", arguments: '{"handle":"bot"}' } }],
        },
        finish_reason: "tool_calls",
      }],
      usage: { prompt_tokens: 100, completion_tokens: 20 },
    }, cap));

    const resp = await llm.create({ system: "s", messages: [{ role: "user", content: "x" }], tools: TOOLS });
    expect(resp.toolUse).toEqual({ id: "c1", name: "perfil_x", input: { handle: "bot" } });
    expect(resp.text).toBe("miro el perfil");
    expect(resp.inputTokens).toBe(100);
    expect(resp.outputTokens).toBe(20);
  });

  it("reinyecta el turno assistant propio y convierte tool_result en mensaje tool", async () => {
    const cap: { url?: string; body?: any } = {};
    const reply = {
      choices: [{ message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
      usage: {},
    };
    const llm = new OpenAiCompatLlm("https://api.ejemplo/v1", "k", "m", fakeFetch(reply, cap));

    // primera llamada: obtener un raw propio
    const r1 = await llm.create({
      system: "s",
      messages: [{ role: "user", content: "investiga" }],
      tools: TOOLS,
    });

    // segunda llamada: historial estilo runtime (assistant raw + tool_result + texto)
    await llm.create({
      system: "s",
      messages: [
        { role: "user", content: "investiga" },
        { role: "assistant", content: r1.raw },
        {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "c1", content: '{"ok":true}', is_error: false },
            { type: "text", text: "continúa" },
          ],
        },
      ],
      tools: TOOLS,
    });

    const roles = cap.body.messages.map((m: { role: string }) => m.role);
    expect(roles).toEqual(["system", "user", "assistant", "tool", "user"]);
    const toolMsg = cap.body.messages[3];
    expect(toolMsg.tool_call_id).toBe("c1");
    expect(toolMsg.content).toBe('{"ok":true}');
  });

  it("lanza error legible si la API responde mal", async () => {
    const llm = new OpenAiCompatLlm("https://api.ejemplo/v1", "k", "m", (async () => ({
      ok: false, status: 401, text: async () => "bad key", json: async () => ({}),
    })) as unknown as typeof fetch);
    await expect(
      llm.create({ system: "s", messages: [{ role: "user", content: "x" }], tools: TOOLS }),
    ).rejects.toThrow(/401/);
  });
});
