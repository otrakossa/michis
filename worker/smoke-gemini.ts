// Smoke en vivo del agente con Gemini (OpenAI-compat, tier gratis).
// Uso: set -a; . ../.env; set +a; pnpm exec tsx smoke-gemini.ts
import { OpenAiCompatLlm } from "./src/agent/llmOpenAiCompat.js";
import { runAgent } from "./src/agent/runtime.js";
import { buildSystemPrompt, buildUserMessage } from "./src/agent/prompt.js";
import { MockXClient } from "./src/agent/xclient.js";
import { perfilXTool } from "./src/agent/tools/perfilX.js";
import { finalizarTool } from "./src/agent/tools/finalizar.js";

const llm = new OpenAiCompatLlm(
  process.env.LLM_BASE_URL!,
  process.env.LLM_API_KEY!,
  process.env.LLM_MODEL ?? "gemini-2.5-flash",
);

const result = await runAgent(
  llm,
  buildSystemPrompt(),
  buildUserMessage({
    handle: "patria_digna_88341",
    platform: "twitter",
    notes:
      "Publica exactamente el mismo texto que otras 4 cuentas con minutos de diferencia. " +
      "Creada hace 3 semanas, ya tiene 12.000 tweets, casi todos retweets de la misma narrativa.",
  }),
  [perfilXTool(new MockXClient()), finalizarTool()],
  { maxIterations: 6, budgetUsd: 1, inputUsdPerM: 0, outputUsdPerM: 0 },
);

console.log("=== VEREDICTO DE GEMINI ===");
console.log("score:", result.veredicto.score, "| confianza:", result.veredicto.confianza);
console.log("modo_degradado:", result.veredicto.modo_degradado, "| parcial:", result.veredicto.parcial ?? false);
console.log("señales:", result.veredicto.senales.map((s) => `${s.tipo}(${s.peso})`).join(", "));
console.log("iteraciones:", result.iterations, "| tokens:", result.tokens);
console.log("--- resumen (primeras líneas) ---");
console.log(result.veredicto.resumen.split("\n").slice(0, 6).join("\n"));
