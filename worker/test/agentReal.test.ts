import { describe, it, expect } from "vitest";
import { AnthropicLlm } from "../src/agent/llm.js";
import { runAgent } from "../src/agent/runtime.js";
import { buildSystemPrompt, buildUserMessage } from "../src/agent/prompt.js";
import { MockXClient } from "../src/agent/xclient.js";
import { perfilXTool } from "../src/agent/tools/perfilX.js";
import { finalizarTool } from "../src/agent/tools/finalizar.js";

// Smoke con la API real de Claude (~US$0.10). Corre SOLO con RUN_REAL_AGENT_TEST=1.
const enabled = process.env.RUN_REAL_AGENT_TEST === "1" && !!process.env.ANTHROPIC_API_KEY;

describe.skipIf(!enabled)("agente real (smoke)", () => {
  it("investiga en modo degradado y entrega un veredicto válido", async () => {
    const llm = new AnthropicLlm(process.env.ANTHROPIC_API_KEY!);
    const result = await runAgent(
      llm,
      buildSystemPrompt(),
      buildUserMessage({
        handle: "cuenta_bot_99887766",
        platform: "twitter",
        notes: "Publica el mismo texto que otras 5 cuentas, creada hace 2 semanas, 8000 tweets.",
      }),
      [perfilXTool(new MockXClient()), finalizarTool()],
      { maxIterations: 6, budgetUsd: 0.3 },
    );

    expect(result.veredicto.score).toBeGreaterThanOrEqual(0);
    expect(result.veredicto.score).toBeLessThanOrEqual(100);
    expect(["baja", "media", "alta"]).toContain(result.veredicto.confianza);
    expect(result.veredicto.modo_degradado).toBe(true);
    expect(result.veredicto.resumen.length).toBeGreaterThan(20);
    expect(result.costUsd).toBeLessThan(0.3);
  }, 120_000);
});
