import type { LlmClient } from "./llm.js";
import type { AgentTool } from "./tools/types.js";
import { FINALIZAR, type Veredicto } from "./tools/finalizar.js";
import { Budget } from "./budget.js";

export interface StepRecord {
  stepNo: number;
  toolName: string | null;
  input: unknown;
  output: unknown;
  reasoning: string;
}

export interface AgentResult {
  veredicto: Veredicto & { parcial?: boolean };
  steps: StepRecord[];
  iterations: number;
  tokens: number;
  costUsd: number;
}

export interface AgentOptions {
  maxIterations: number;
  budgetUsd: number;
}

type Msg = { role: "user" | "assistant"; content: unknown };

// La API exige roles alternados: si el último turno ya es user, anexa el texto ahí.
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

export async function runAgent(
  llm: LlmClient,
  system: string,
  userMessage: string,
  tools: AgentTool[],
  opts: AgentOptions,
): Promise<AgentResult> {
  const budget = new Budget(opts.budgetUsd);
  const steps: StepRecord[] = [];
  const toolDefs = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema,
  }));
  const byName = new Map(tools.map((t) => [t.name, t]));
  const messages: Msg[] = [{ role: "user", content: userMessage }];
  let iter = 0;

  while (iter < opts.maxIterations && !budget.exceeded) {
    iter++;
    const resp = await llm.create({ system, messages, tools: toolDefs });
    budget.add(resp.inputTokens, resp.outputTokens);

    if (resp.toolUse) {
      const { id, name, input } = resp.toolUse;

      if (name === FINALIZAR) {
        steps.push({ stepNo: iter, toolName: name, input, output: null, reasoning: resp.text });
        return {
          veredicto: input as unknown as Veredicto,
          steps,
          iterations: iter,
          tokens: budget.totalTokens,
          costUsd: budget.costUsd,
        };
      }

      const tool = byName.get(name);
      let output: unknown;
      let isError = false;
      try {
        if (!tool) {
          output = `Herramienta desconocida: ${name}`;
          isError = true;
        } else {
          output = await tool.execute(input);
        }
      } catch (err) {
        output = `Error: ${err instanceof Error ? err.message : String(err)}`;
        isError = true;
      }
      steps.push({ stepNo: iter, toolName: name, input, output, reasoning: resp.text });
      messages.push({ role: "assistant", content: resp.raw });
      messages.push({
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: id, content: JSON.stringify(output), is_error: isError },
        ],
      });
    } else {
      steps.push({ stepNo: iter, toolName: null, input: null, output: null, reasoning: resp.text });
      messages.push({ role: "assistant", content: resp.raw });
      pushUserText(
        messages,
        "Continúa la investigación. Cuando tengas suficiente evidencia, llama a finalizar_investigacion.",
      );
    }
  }

  // Cierre forzado por iteraciones o presupuesto → veredicto parcial.
  iter++;
  pushUserText(
    messages,
    "Se alcanzó el límite de la investigación. Entrega tu veredicto AHORA llamando a finalizar_investigacion con la evidencia disponible.",
  );
  const resp = await llm.create({ system, messages, tools: toolDefs, forceTool: FINALIZAR });
  budget.add(resp.inputTokens, resp.outputTokens);
  const input = (resp.toolUse?.input ?? {
    score: 0,
    confianza: "baja",
    senales: [],
    cuentas_vinculadas: [],
    resumen: "Investigación inconclusa: el agente no entregó veredicto.",
    modo_degradado: true,
  }) as unknown as Veredicto;
  steps.push({ stepNo: iter, toolName: FINALIZAR, input, output: null, reasoning: resp.text });
  return {
    veredicto: { ...input, parcial: true },
    steps,
    iterations: iter,
    tokens: budget.totalTokens,
    costUsd: budget.costUsd,
  };
}
