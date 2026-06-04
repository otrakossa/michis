# michis — Fase 1 / Sub-proyecto 2: Agente investigador — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el stub `investigate` por el agente real: bucle Claude tool-use con 3 tools, guardarraíles (8 iteraciones / US$0.50), veredicto estructurado, auditoría por paso y modo degradado sin clave de X.

**Architecture:** `runtime.ts` recibe un `LlmClient` y tools inyectadas (Anthropic real en prod, fakes en tests → tests a $0). El veredicto sale por la tool `finalizar_investigacion`. `investigate.ts` orquesta runtime + persistencia (verdict, steps, evidence, case_links). Sin `ANTHROPIC_API_KEY` se degrada al stub.

**Tech Stack:** `@anthropic-ai/sdk` (modelo `claude-sonnet-4-6`, prompt caching), Postgres `pg_trgm` (migración 0008 vía `npx supabase db push --db-url`), Vitest.

**Spec:** `docs/superpowers/specs/2026-06-04-fase1-agente-investigador-design.md`

**Entorno (LEER):** Supabase GESTIONADO, sin Docker/psql. Migraciones: `set -a; . ./.env; set +a` y `echo "y" | npx -y supabase@latest db push --db-url "$DATABASE_URL"`. pnpm en `~/.local/node-v22.15.1-linux-x64/bin/pnpm` si falta en PATH. Git: `git -c user.name="michis" -c user.email="kossa@nodolibre.org" commit ...`. Tests de integración: secuenciales, datos `test-*`, `.env` raíz cargado por `worker/vitest.setup.ts`. NO imprimir secretos.

---

## File Structure

```
worker/src/agent/
  budget.ts            # contador tokens→USD
  llm.ts               # LlmClient + AnthropicLlm
  prompt.ts            # system prompt es-LA + mensaje inicial
  xclient.ts           # XClient + MockXClient
  runtime.ts           # el bucle
  tools/types.ts       # interfaz AgentTool
  tools/perfilX.ts     # tool perfil_x
  tools/similitud.ts   # tool similitud_texto
  tools/finalizar.ts   # tool finalizar_investigacion + tipo Veredicto
worker/src/investigate.ts   # MODIFICAR: orquestación real + stub fallback
worker/src/config.ts        # MODIFICAR: claves/límites opcionales del agente
worker/test/
  fakes.ts             # FakeLlm guionado
  budget.test.ts       # unit
  runtime.test.ts      # unit (FakeLlm)
  similitud.test.ts    # integración (BD)
  investigateAgent.test.ts  # integración handler con FakeLlm
  agentReal.test.ts    # smoke real, gated por RUN_REAL_AGENT_TEST
supabase/migrations/
  0008_pg_trgm_similar_cases.sql
```

---

## Task 0: Rama

- [ ] `git checkout -b fase-1-agente` → verificar con `git branch --show-current`.

---

## Task 1: Dependencia y config

**Files:** Modify: `worker/package.json` (vía pnpm add), `worker/src/config.ts`

- [ ] **Step 1:** `pnpm --filter worker add @anthropic-ai/sdk`
- [ ] **Step 2:** En `worker/src/config.ts`, añadir al objeto `config` (después de `pollIntervalMs`):
```typescript
  // Agente investigador (opcionales: sin ellos hay degradación elegante)
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? null,
  xBearerToken: process.env.X_BEARER_TOKEN ?? null,
  agentMaxIterations: Number(process.env.AGENT_MAX_ITERATIONS ?? "8"),
  agentBudgetUsd: Number(process.env.AGENT_BUDGET_USD ?? "0.5"),
```
- [ ] **Step 3:** `pnpm --filter worker build` → sin errores.
- [ ] **Step 4:** Commit:
```bash
git add worker/package.json worker/src/config.ts pnpm-lock.yaml
git commit -m "feat(worker): SDK de Anthropic y config del agente"
```

---

## Task 2: Budget (TDD unit)

**Files:** Create: `worker/src/agent/budget.ts` — Test: `worker/test/budget.test.ts`

- [ ] **Step 1: Test primero** — `worker/test/budget.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { Budget } from "../src/agent/budget.js";

describe("Budget", () => {
  it("calcula USD según precios de sonnet (3/15 por millón)", () => {
    const b = new Budget(10);
    b.add(1_000_000, 0);
    expect(b.costUsd).toBeCloseTo(3);
    b.add(0, 1_000_000);
    expect(b.costUsd).toBeCloseTo(18);
  });

  it("acumula tokens y detecta el tope", () => {
    const b = new Budget(0.5);
    b.add(100_000, 10_000); // 0.30 + 0.15 = 0.45
    expect(b.totalTokens).toBe(110_000);
    expect(b.exceeded).toBe(false);
    b.add(20_000, 0); // +0.06 → 0.51
    expect(b.exceeded).toBe(true);
  });
});
```
- [ ] **Step 2:** `pnpm --filter worker test budget` → FAIL (módulo no existe).
- [ ] **Step 3: Implementar** — `worker/src/agent/budget.ts`:
```typescript
// Precios de claude-sonnet-4-6 en USD por millón de tokens.
const INPUT_USD_PER_M = 3;
const OUTPUT_USD_PER_M = 15;

export class Budget {
  private spent = 0;
  private tokens = 0;

  constructor(private readonly limitUsd: number) {}

  add(inputTokens: number, outputTokens: number): void {
    this.tokens += inputTokens + outputTokens;
    this.spent +=
      (inputTokens * INPUT_USD_PER_M + outputTokens * OUTPUT_USD_PER_M) / 1_000_000;
  }

  get costUsd(): number {
    return this.spent;
  }
  get totalTokens(): number {
    return this.tokens;
  }
  get exceeded(): boolean {
    return this.spent >= this.limitUsd;
  }
}
```
- [ ] **Step 4:** `pnpm --filter worker test budget` → PASS (2 tests).
- [ ] **Step 5:** Commit: `git add worker/src/agent/budget.ts worker/test/budget.test.ts && git commit -m "feat(worker): contador de presupuesto del agente"`

---

## Task 3: LlmClient + AnthropicLlm + FakeLlm

**Files:** Create: `worker/src/agent/llm.ts`, `worker/test/fakes.ts`

(`AnthropicLlm` es un wrapper fino sin lógica propia: se verifica por tipos/build; el bucle se testea con `FakeLlm`. El smoke real lo cubre la Task 8.)

- [ ] **Step 1:** `worker/src/agent/llm.ts`:
```typescript
import Anthropic from "@anthropic-ai/sdk";

export interface LlmToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface LlmResponse {
  stopReason: string | null;
  text: string; // razonamiento visible (bloques de texto concatenados)
  toolUse: { id: string; name: string; input: Record<string, unknown> } | null;
  inputTokens: number;
  outputTokens: number;
  raw: unknown; // bloques de contenido para reinyectar como turno assistant
}

export interface LlmCreateParams {
  system: string;
  messages: unknown[];
  tools: LlmToolDef[];
  forceTool?: string;
}

export interface LlmClient {
  create(params: LlmCreateParams): Promise<LlmResponse>;
}

export class AnthropicLlm implements LlmClient {
  private client: Anthropic;

  constructor(apiKey: string, private readonly model = "claude-sonnet-4-6") {
    this.client = new Anthropic({ apiKey });
  }

  async create({ system, messages, tools, forceTool }: LlmCreateParams): Promise<LlmResponse> {
    const resp = await this.client.messages.create({
      model: this.model,
      max_tokens: 2048,
      // Prompt caching: el system se paga una vez por ráfaga, no por vuelta.
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: messages as Anthropic.MessageParam[],
      tools: tools as unknown as Anthropic.Tool[],
      ...(forceTool ? { tool_choice: { type: "tool" as const, name: forceTool } } : {}),
    });
    const toolBlock = resp.content.find((b) => b.type === "tool_use");
    return {
      stopReason: resp.stop_reason,
      text: resp.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n"),
      toolUse: toolBlock
        ? {
            id: toolBlock.id,
            name: toolBlock.name,
            input: toolBlock.input as Record<string, unknown>,
          }
        : null,
      inputTokens: resp.usage.input_tokens,
      outputTokens: resp.usage.output_tokens,
      raw: resp.content,
    };
  }
}
```
- [ ] **Step 2:** `worker/test/fakes.ts`:
```typescript
import type { LlmClient, LlmCreateParams, LlmResponse } from "../src/agent/llm.js";

// LLM guionado: devuelve las respuestas del guion en orden (la última se repite).
export class FakeLlm implements LlmClient {
  private i = 0;
  readonly calls: LlmCreateParams[] = [];

  constructor(private readonly script: Partial<LlmResponse>[]) {}

  async create(params: LlmCreateParams): Promise<LlmResponse> {
    this.calls.push(params);
    const s = this.script[Math.min(this.i++, this.script.length - 1)];
    return {
      stopReason: "end_turn",
      text: "",
      toolUse: null,
      inputTokens: 100,
      outputTokens: 50,
      raw: [],
      ...s,
    };
  }
}
```
- [ ] **Step 3:** `pnpm --filter worker build` → sin errores. Si el SDK tipa distinto algún campo (p. ej. `cache_control` o `tool_choice`), ajusta el cast SIN cambiar el comportamiento y repórtalo.
- [ ] **Step 4:** Commit: `git add worker/src/agent/llm.ts worker/test/fakes.ts && git commit -m "feat(worker): cliente LLM (Anthropic) y FakeLlm de tests"`

---

## Task 4: XClient, tipos de tool, perfil_x y finalizar

**Files:** Create: `worker/src/agent/xclient.ts`, `worker/src/agent/tools/types.ts`, `worker/src/agent/tools/perfilX.ts`, `worker/src/agent/tools/finalizar.ts`

- [ ] **Step 1:** `worker/src/agent/tools/types.ts`:
```typescript
export interface AgentTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  execute(input: Record<string, unknown>): Promise<unknown>;
}
```
- [ ] **Step 2:** `worker/src/agent/xclient.ts`:
```typescript
export interface XProfile {
  disponible: boolean;
  motivo?: string;
  perfil?: {
    handle: string;
    creado: string;
    seguidores: number;
    siguiendo: number;
    tweets_total: number;
    descripcion: string;
    ultimos_tweets: { texto: string; fecha: string }[];
  };
}

export interface XClient {
  getProfile(handle: string): Promise<XProfile>;
}

// Hasta tener clave de la API de X: el agente investiga en modo degradado.
export class MockXClient implements XClient {
  async getProfile(): Promise<XProfile> {
    return {
      disponible: false,
      motivo: "Sin clave de API de X configurada (modo degradado)",
    };
  }
}
```
- [ ] **Step 3:** `worker/src/agent/tools/perfilX.ts`:
```typescript
import type { AgentTool } from "./types.js";
import type { XClient } from "../xclient.js";

export function perfilXTool(x: XClient): AgentTool {
  return {
    name: "perfil_x",
    description:
      "Obtiene el perfil público de una cuenta de X/Twitter: fecha de creación, métricas, " +
      "últimos tweets y horarios. Si devuelve disponible:false no hay acceso a la API de X " +
      "y debes investigar en modo degradado (decláralo en el veredicto).",
    input_schema: {
      type: "object",
      properties: { handle: { type: "string", description: "handle sin @" } },
      required: ["handle"],
    },
    execute: async (input) => x.getProfile(String(input.handle)),
  };
}
```
- [ ] **Step 4:** `worker/src/agent/tools/finalizar.ts`:
```typescript
import type { AgentTool } from "./types.js";

export const FINALIZAR = "finalizar_investigacion";

export interface Veredicto {
  score: number;
  confianza: "baja" | "media" | "alta";
  senales: { tipo: string; descripcion: string; peso: number }[];
  cuentas_vinculadas: {
    handle: string;
    relacion: "mismo_texto" | "amplificacion_coordinada" | "mismo_avatar";
    razon: string;
  }[];
  resumen: string;
  modo_degradado: boolean;
}

export function finalizarTool(): AgentTool {
  return {
    name: FINALIZAR,
    description:
      "Termina la investigación entregando el veredicto final. DEBES llamarla cuando tengas " +
      "suficiente evidencia o cuando se te indique cerrar. Sé riguroso: señales con peso " +
      "honesto; si la evidencia es débil, score bajo y confianza baja.",
    input_schema: {
      type: "object",
      properties: {
        score: { type: "number", minimum: 0, maximum: 100 },
        confianza: { enum: ["baja", "media", "alta"] },
        senales: {
          type: "array",
          items: {
            type: "object",
            properties: {
              tipo: { type: "string" },
              descripcion: { type: "string" },
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
        resumen: { type: "string", description: "borrador de expediente en markdown" },
        modo_degradado: { type: "boolean" },
      },
      required: ["score", "confianza", "senales", "cuentas_vinculadas", "resumen", "modo_degradado"],
    },
    // Nunca se ejecuta: el runtime intercepta esta tool y cierra el bucle.
    execute: async () => null,
  };
}
```
- [ ] **Step 5:** `pnpm --filter worker build` → sin errores.
- [ ] **Step 6:** Commit:
```bash
git add worker/src/agent/xclient.ts worker/src/agent/tools/
git commit -m "feat(worker): XClient mock y tools perfil_x / finalizar_investigacion"
```

---

## Task 5: Migración 0008 + tool similitud (TDD integración)

**Files:** Create: `supabase/migrations/0008_pg_trgm_similar_cases.sql`, `worker/src/agent/tools/similitud.ts` — Test: `worker/test/similitud.test.ts`

- [ ] **Step 1: Test primero** — `worker/test/similitud.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { supabase as svc } from "../src/supabase.js";
import { similitudTool } from "../src/agent/tools/similitud.js";

const EMAIL = "test-similitud@example.com";
let userId: string;
let caseA: string;

async function deleteUserByEmail(email: string) {
  const { data } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const u = data?.users?.find((x) => x.email === email);
  if (u) await svc.auth.admin.deleteUser(u.id);
}

beforeAll(async () => {
  await deleteUserByEmail(EMAIL);
  await svc.from("cases").delete().like("handle", "test-sim%");
  const { data, error } = await svc.auth.admin.createUser({
    email: EMAIL, password: "TestSim2026!", email_confirm: true,
  });
  if (error) throw error;
  userId = data.user.id;

  const { data: a } = await svc.from("cases").insert({
    platform: "twitter", handle: "test-sim-a", created_by: userId,
    notes: "vacunas covid microchips bill gates control mental 5g",
  }).select("id").single();
  caseA = a!.id;
  await svc.from("cases").insert({
    platform: "twitter", handle: "test-sim-b", created_by: userId,
    notes: "vacunas covid microchips bill gates control mental",
  });
  await svc.from("cases").insert({
    platform: "twitter", handle: "test-sim-c", created_by: userId,
    notes: "recetas de cocina vegetariana con quinoa",
  });
});

afterAll(async () => {
  await svc.from("cases").delete().like("handle", "test-sim%");
  await deleteUserByEmail(EMAIL);
});

describe("similitud_texto", () => {
  it("encuentra el caso con notas similares y excluye el propio", async () => {
    const tool = similitudTool(caseA);
    const result = (await tool.execute({
      texto: "vacunas covid microchips bill gates control mental 5g",
    })) as { case_id: string; handle: string; similarity: number }[];

    const handles = result.map((r) => r.handle);
    expect(handles).toContain("test-sim-b");
    expect(handles).not.toContain("test-sim-a"); // excluido (es el caso investigado)
    expect(handles).not.toContain("test-sim-c"); // no similar
  });
});
```
- [ ] **Step 2:** `pnpm --filter worker test similitud` → FAIL (módulo/función no existen).
- [ ] **Step 3: Migración** — `supabase/migrations/0008_pg_trgm_similar_cases.sql`:
```sql
-- Similitud de texto entre casos (señal de copypasta/granja).
create extension if not exists pg_trgm with schema extensions;

create function public.find_similar_cases(p_texto text, p_exclude_case uuid)
returns table (case_id uuid, handle text, similarity real)
language sql
stable
as $$
  select c.id, c.handle,
         extensions.similarity(coalesce(c.notes, ''), p_texto) as similarity
  from public.cases c
  where c.id <> p_exclude_case
    and extensions.similarity(coalesce(c.notes, ''), p_texto) > 0.1
  order by similarity desc
  limit 5;
$$;

-- La llama solo el worker (service role); no se expone a clientes.
revoke execute on function public.find_similar_cases(text, uuid) from public, anon, authenticated;
grant execute on function public.find_similar_cases(text, uuid) to service_role;
```
- [ ] **Step 4: Tool** — `worker/src/agent/tools/similitud.ts`:
```typescript
import type { AgentTool } from "./types.js";
import { supabase } from "../../supabase.js";

export function similitudTool(excludeCaseId: string): AgentTool {
  return {
    name: "similitud_texto",
    description:
      "Busca en la base de casos del colectivo otros casos con notas/contenido textual " +
      "similar al texto dado. Una similitud alta entre cuentas distintas sugiere " +
      "copypasta o granja de bots.",
    input_schema: {
      type: "object",
      properties: { texto: { type: "string" } },
      required: ["texto"],
    },
    execute: async (input) => {
      const { data, error } = await supabase.rpc("find_similar_cases", {
        p_texto: String(input.texto),
        p_exclude_case: excludeCaseId,
      });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  };
}
```
- [ ] **Step 5: Aplicar migración:** `set -a; . ./.env; set +a` y `echo "y" | npx -y supabase@latest db push --db-url "$DATABASE_URL" 2>&1 | tail -4`. Si falla a mitad → BLOCKED con el error exacto.
- [ ] **Step 6:** `pnpm --filter worker test similitud` → PASS. Luego `pnpm --filter worker test` → todos verdes.
- [ ] **Step 7:** Commit:
```bash
git add supabase/migrations/0008_pg_trgm_similar_cases.sql worker/src/agent/tools/similitud.ts worker/test/similitud.test.ts
git commit -m "feat(db,worker): pg_trgm + find_similar_cases y tool similitud_texto"
```

---

## Task 6: Prompt + Runtime (TDD unit con FakeLlm)

**Files:** Create: `worker/src/agent/prompt.ts`, `worker/src/agent/runtime.ts` — Test: `worker/test/runtime.test.ts`

- [ ] **Step 1: Test primero** — `worker/test/runtime.test.ts`:
```typescript
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
```
- [ ] **Step 2:** `pnpm --filter worker test runtime` → FAIL (runtime no existe).
- [ ] **Step 3: Prompt** — `worker/src/agent/prompt.ts`:
```typescript
export function buildSystemPrompt(): string {
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
- Cada señal con peso honesto (1-5). Si la evidencia es débil: score bajo y confianza baja.
- El resumen es un borrador de expediente en markdown: solo afirmaciones respaldadas por
  la evidencia que recolectaste en esta investigación. Un humano lo revisará y decidirá.`;
}

export function buildUserMessage(caso: {
  handle: string;
  platform: string;
  notes: string | null;
}): string {
  return `Investiga la cuenta @${caso.handle} (plataforma: ${caso.platform}).
Notas del activista que la reportó: ${caso.notes ?? "(sin notas)"}`;
}
```
- [ ] **Step 4: Runtime** — `worker/src/agent/runtime.ts`:
```typescript
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
```
- [ ] **Step 5:** `pnpm --filter worker test runtime` → PASS (4 tests). `pnpm --filter worker build` → OK.
- [ ] **Step 6:** Commit:
```bash
git add worker/src/agent/prompt.ts worker/src/agent/runtime.ts worker/test/runtime.test.ts
git commit -m "feat(worker): runtime del agente con guardarraíles y prompt es-LA"
```

---

## Task 7: investigate.ts real (TDD integración con FakeLlm)

**Files:** Modify: `worker/src/investigate.ts` — Test: `worker/test/investigateAgent.test.ts`

- [ ] **Step 1: Test primero** — `worker/test/investigateAgent.test.ts`:
```typescript
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
```
- [ ] **Step 2:** `pnpm --filter worker test investigateAgent` → FAIL (`runInvestigation` no existe / firma distinta).
- [ ] **Step 3: Reescribir `worker/src/investigate.ts` COMPLETO:**
```typescript
import { supabase } from "./supabase.js";
import { registerHandler } from "./handlers.js";
import { config } from "./config.js";
import { AnthropicLlm, type LlmClient } from "./agent/llm.js";
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
  return {
    llm: config.anthropicApiKey ? new AnthropicLlm(config.anthropicApiKey) : null,
  };
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
    { maxIterations: config.agentMaxIterations, budgetUsd: config.agentBudgetUsd },
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
```
- [ ] **Step 4:** `pnpm --filter worker test investigateAgent` → PASS.
- [ ] **Step 5: El viejo test del stub** (`worker/test/investigate.test.ts`) verifica el camino sin clave. Ajustarlo: donde insertaba el job y procesaba con `tick()`, sigue válido **solo si** el entorno de test no tiene `ANTHROPIC_API_KEY`. Para hacerlo determinista, al inicio del archivo (tras los imports) añadir:
```typescript
// Este archivo prueba el camino SIN clave (stub). El camino con agente está en investigateAgent.test.ts.
```
y en el `beforeAll`, primera línea:
```typescript
delete process.env.ANTHROPIC_API_KEY;
```
PROBLEMA: `config.ts` ya capturó el valor al importarse. Solución correcta: en `investigate.test.ts` NO usar `tick()` con el handler registrado por defecto; cambiar el test para llamar directamente `runInvestigation({ run_id: runId, case_id: caseId }, { llm: null })` (importándola), eliminando la inserción del job y el bucle de ticks. Las aserciones quedan IGUALES (run needs_review, verdict stub, 1 step, caso needs_review) salvo que `tool_name` del step ahora es `"stub"` (igual que antes). Hacer ese cambio.
- [ ] **Step 6:** `pnpm --filter worker test` → TODOS verdes. `pnpm --filter worker build` → OK.
- [ ] **Step 7:** Commit:
```bash
git add worker/src/investigate.ts worker/test/investigateAgent.test.ts worker/test/investigate.test.ts
git commit -m "feat(worker): agente investigador real con persistencia completa y fallback stub"
```

---

## Task 8: Smoke real opcional + verificación integral

**Files:** Create: `worker/test/agentReal.test.ts`

- [ ] **Step 1:** `worker/test/agentReal.test.ts`:
```typescript
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
```
- [ ] **Step 2:** `pnpm --filter worker test agentReal` → el describe queda **skipped** (sin la env). Esperado: `Test Files 1 skipped`.
- [ ] **Step 3: Verificación integral:** `pnpm -r test` → todo verde (web 10; worker: budget 2, runtime 4, similitud 1, investigateAgent 1, investigate 1, enqueue 4, jobs 4, handlers 2; agentReal skipped). `pnpm --filter worker build && pnpm --filter web build` → OK.
- [ ] **Step 4:** Commit:
```bash
git add worker/test/agentReal.test.ts
git commit -m "test(worker): smoke opcional del agente real (gated por env)"
```

---

## Self-Review (cobertura del spec)

- Módulos del spec §2 → Tasks 2-6 (budget, llm, prompt, xclient, runtime, tools) ✅
- Tools §3 (perfil_x, similitud_texto + migración 0008 con grants, finalizar) → Tasks 4, 5 ✅
- Veredicto §4 (schema, alias summary, persistencia: verdict/score/confianza/case_links/evidence) → Tasks 4, 7 ✅
- Bucle §5 (8 iter, presupuesto, cierre forzado con tool_choice, roles alternados) → Task 6 ✅
- Guardarraíles/errores §6 (tool error → agente; sin ANTHROPIC_API_KEY → stub; sin X → mock; prompt caching; config) → Tasks 1, 3, 6, 7 ✅
  - *Nota:* el reintento con backoff ante fallo de la API de Claude queda cubierto por el manejo de error existente del `tick()` (failJob) — el retry fino se añadirá si el smoke real muestra necesidad (YAGNI consciente, documentado).
- Testing §7 (FakeLlm, cortes, similitud integración, handler integración, smoke gated) → Tasks 2, 5, 6, 7, 8 ✅
- Tipos consistentes: `Veredicto`/`FINALIZAR` definidos una vez en `finalizar.ts` e importados en runtime/investigate/tests; `LlmClient` única interfaz; payload `{run_id, case_id}` invariante ✅
