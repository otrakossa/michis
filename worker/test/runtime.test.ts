import { describe, it, expect } from "vitest";
import { runAgent } from "../src/agent/runtime.js";
import { FINALIZAR, finalizarTool, type Veredicto } from "../src/agent/tools/finalizar.js";
import type { AgentTool } from "../src/agent/tools/types.js";
import { FakeLlm } from "./fakes.js";

const VERDICT: Veredicto = {
  score: 70, confianza: "media",
  senales: [{ tipo: "texto_duplicado", descripcion: "x", peso: 4 }],
  cuentas_vinculadas: [], resumen: "## informe", modo_degradado: true,
};

function dummyTool(name: string, result: unknown, fail = false): AgentTool {
  return {
    name, description: "dummy", input_schema: { type: "object", properties: {} },
    execute: async () => {
      if (fail) throw new Error("boom");
      return result;
    },
  };
}

const OPTS = { maxIterations: 8, budgetUsd: 0.5 };

describe("runAgent", () => {
  it("ejecuta tools en orden y cierra con el veredicto", async () => {
    const llm = new FakeLlm([
      { toolUse: { id: "1", name: "perfil_x", input: { handle: "bot" } }, text: "miro el perfil" },
      { toolUse: { id: "2", name: FINALIZAR, input: VERDICT as unknown as Record<string, unknown> } },
    ]);
    const result = await runAgent(llm, "sys", "investiga", [dummyTool("perfil_x", { disponible: false }), finalizarTool()], OPTS);

    expect(result.veredicto.score).toBe(70);
    expect(result.veredicto.parcial).toBeUndefined();
    expect(result.iterations).toBe(2);
    expect(result.steps.length).toBe(2);
    expect(result.steps[0].toolName).toBe("perfil_x");
    expect(result.steps[0].reasoning).toBe("miro el perfil");
    expect(result.costUsd).toBeGreaterThan(0);
  });

  it("corta por iteraciones y fuerza un veredicto parcial", async () => {
    const llm = new FakeLlm([
      // nunca finaliza por sí solo…
      { toolUse: { id: "1", name: "perfil_x", input: {} } },
      { toolUse: { id: "1", name: "perfil_x", input: {} } },
      { toolUse: { id: "1", name: "perfil_x", input: {} } },
      // …la 4ª respuesta es la del cierre forzado (la FakeLlm repite la última)
      { toolUse: { id: "9", name: FINALIZAR, input: VERDICT as unknown as Record<string, unknown> } },
    ]);
    const result = await runAgent(llm, "sys", "investiga", [dummyTool("perfil_x", {}), finalizarTool()], { maxIterations: 3, budgetUsd: 99 });

    expect(result.veredicto.parcial).toBe(true);
    expect(result.iterations).toBe(4); // 3 vueltas + cierre forzado
    const lastCall = llm.calls[llm.calls.length - 1];
    expect(lastCall.forceTool).toBe(FINALIZAR);
  });

  it("corta por presupuesto", async () => {
    const llm = new FakeLlm([
      { toolUse: { id: "1", name: "perfil_x", input: {} }, inputTokens: 200_000, outputTokens: 0 }, // 0.60 USD > 0.5
      { toolUse: { id: "9", name: FINALIZAR, input: VERDICT as unknown as Record<string, unknown> } },
    ]);
    const result = await runAgent(llm, "sys", "investiga", [dummyTool("perfil_x", {}), finalizarTool()], OPTS);
    expect(result.veredicto.parcial).toBe(true);
    expect(result.iterations).toBe(2);
  });

  it("devuelve el error de una tool al agente y continúa", async () => {
    const llm = new FakeLlm([
      { toolUse: { id: "1", name: "perfil_x", input: {} } },
      { toolUse: { id: "2", name: FINALIZAR, input: VERDICT as unknown as Record<string, unknown> } },
    ]);
    const result = await runAgent(llm, "sys", "investiga", [dummyTool("perfil_x", null, true), finalizarTool()], OPTS);
    expect(String(result.steps[0].output)).toMatch(/boom/);
    expect(result.veredicto.score).toBe(70); // siguió y cerró bien
  });
});
