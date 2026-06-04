# michis — Fase 1 / Sub-proyecto 1: Gestión de casos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alta/listado/detalle de casos con encolado controlado de investigación (RPC) y handler stub del worker que ejercita el pipeline completo.

**Architecture:** El navegador habla directo con Supabase (sesión + RLS de Fase 0). El encolado pasa por la RPC `enqueue_investigation` (SECURITY DEFINER) — única puerta a la tabla `jobs`, que sigue cerrada a clientes. El worker procesa el job `investigate` con un stub que deja la corrida en `needs_review`.

**Tech Stack:** Next.js 15 (App Router) + supabase-js, Postgres/Supabase gestionado (migración vía `npx supabase db push --db-url`), worker TS + Vitest (tests de integración contra el proyecto gestionado; el `.env` raíz se carga vía `worker/vitest.setup.ts`).

**Spec:** `docs/superpowers/specs/2026-06-04-fase1-gestion-casos-design.md`

**Contexto de entorno (LEER):** No hay Docker ni psql. La BD es Supabase GESTIONADO; las migraciones se aplican con `set -a; . ./.env; set +a` y `echo "y" | npx -y supabase@latest db push --db-url "$DATABASE_URL"`. Si `pnpm` no está en PATH: `~/.local/node-v22.15.1-linux-x64/bin/pnpm`. Identidad git: `git -c user.name="michis" -c user.email="kossa@nodolibre.org" commit ...`.

---

## File Structure

```
supabase/migrations/
  0007_cases_notes_unique_enqueue.sql   # notes + índice único + RPC
worker/src/
  investigate.ts                        # handler stub (se registra solo)
  handlers.ts                           # MODIFICAR: quitar handler 'noop'
  index.ts                              # MODIFICAR: import "./investigate.js"
worker/test/
  enqueue.test.ts                       # integración: RPC + índice único
  investigate.test.ts                   # integración: handler e2e con tick()
web/src/lib/
  handle.ts                             # normalización/validación (pura)
web/src/test/
  handle.test.ts
  casoNuevoForm.test.tsx                # component test de validación
web/src/components/
  InvestigateButton.tsx                 # client: llama la RPC
  DeleteCaseButton.tsx                  # client: borrar (solo admin lo ve)
web/src/app/(app)/
  layout.tsx                            # MODIFICAR: link "Casos" en el header
  casos/page.tsx                        # lista + filtro por estado
  casos/nuevo/page.tsx                  # formulario de alta
  casos/[id]/page.tsx                   # detalle + corridas
```

---

## Task 0: Rama de trabajo

- [ ] **Step 1:** `git checkout -b fase-1-gestion-casos`
- [ ] **Step 2:** Verificar: `git branch --show-current` → `fase-1-gestion-casos`

---

## Task 1: Normalización de handle (TDD, puro)

**Files:**
- Create: `web/src/lib/handle.ts`
- Test: `web/src/test/handle.test.ts`

- [ ] **Step 1: Escribir el test (falla primero)**

`web/src/test/handle.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { normalizeHandle, isValidHandle } from "../lib/handle";

describe("normalizeHandle", () => {
  it("quita @ inicial, espacios y pasa a minúsculas", () => {
    expect(normalizeHandle(" @Bot_X ")).toBe("bot_x");
  });
  it("quita múltiples @ iniciales", () => {
    expect(normalizeHandle("@@cuenta")).toBe("cuenta");
  });
  it("deja igual un handle ya normalizado", () => {
    expect(normalizeHandle("granja_123")).toBe("granja_123");
  });
});

describe("isValidHandle", () => {
  it("acepta letras, números, guion bajo y punto", () => {
    expect(isValidHandle("bot_x.2")).toBe(true);
  });
  it("rechaza vacío", () => {
    expect(isValidHandle("")).toBe(false);
  });
  it("rechaza espacios y acentos", () => {
    expect(isValidHandle("a b")).toBe(false);
    expect(isValidHandle("cuentaá")).toBe(false);
  });
  it("rechaza más de 30 caracteres", () => {
    expect(isValidHandle("a".repeat(31))).toBe(false);
  });
});
```

- [ ] **Step 2:** Run: `pnpm --filter web test handle` → FAIL (módulo no existe).

- [ ] **Step 3: Implementar**

`web/src/lib/handle.ts`:
```typescript
// Normaliza un handle de red social: sin espacios, sin @ inicial, minúsculas.
export function normalizeHandle(raw: string): string {
  return raw.trim().replace(/^@+/, "").toLowerCase();
}

// Válido para twitter/tiktok: letras/números/_/. , 1-30 chars (ya normalizado).
export function isValidHandle(handle: string): boolean {
  return /^[a-z0-9_.]{1,30}$/.test(handle);
}
```

- [ ] **Step 4:** Run: `pnpm --filter web test handle` → PASS (7 tests).

- [ ] **Step 5: Commit**
```bash
git add web/src/lib/handle.ts web/src/test/handle.test.ts
git commit -m "feat(web): normalización y validación de handle"
```

---

## Task 2: Migración 0007 + tests de integración de la RPC (TDD)

**Files:**
- Create: `supabase/migrations/0007_cases_notes_unique_enqueue.sql`
- Test: `worker/test/enqueue.test.ts`

- [ ] **Step 1: Escribir el test PRIMERO**

`worker/test/enqueue.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabase as svc } from "../src/supabase.js";

const URL = process.env.SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const EMAIL = "test-enqueue@example.com";
const PASS = "TestEnqueue2026!";

let authed: SupabaseClient;
let userId: string;

async function deleteUserByEmail(email: string) {
  const { data } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const u = data?.users?.find((x) => x.email === email);
  if (u) await svc.auth.admin.deleteUser(u.id);
}

async function cleanTestData() {
  // borra casos de prueba (runs caen por cascade) y jobs investigate pendientes
  await svc.from("cases").delete().like("handle", "test-enq%");
  await svc.from("jobs").delete().eq("type", "investigate").eq("status", "pending");
}

beforeAll(async () => {
  await deleteUserByEmail(EMAIL);
  const { data, error } = await svc.auth.admin.createUser({
    email: EMAIL, password: PASS, email_confirm: true,
  });
  if (error) throw error;
  userId = data.user.id;
  authed = createClient(URL, ANON);
  const { error: e2 } = await authed.auth.signInWithPassword({ email: EMAIL, password: PASS });
  if (e2) throw e2;
});

afterAll(async () => {
  await cleanTestData();
  await deleteUserByEmail(EMAIL);
});

beforeEach(cleanTestData);

async function createCase(handle: string): Promise<string> {
  const { data, error } = await authed
    .from("cases")
    .insert({ platform: "twitter", handle, notes: "caso de prueba", created_by: userId })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

describe("enqueue_investigation", () => {
  it("rechaza clientes sin sesión (revocada para anon)", async () => {
    const anon = createClient(URL, ANON);
    const { error } = await anon.rpc("enqueue_investigation", {
      p_case_id: "00000000-0000-0000-0000-000000000000",
    });
    expect(error).not.toBeNull();
  });

  it("encola: crea run queued + job investigate + caso investigando", async () => {
    const caseId = await createCase("test-enq-ok");
    const { data: runId, error } = await authed.rpc("enqueue_investigation", {
      p_case_id: caseId,
    });
    expect(error).toBeNull();
    expect(runId).toBeTruthy();

    const { data: run } = await svc
      .from("investigation_runs").select("status").eq("id", runId).single();
    expect(run!.status).toBe("queued");

    const { data: job } = await svc
      .from("jobs").select("type,payload").contains("payload", { run_id: runId }).single();
    expect(job!.type).toBe("investigate");

    const { data: caso } = await svc
      .from("cases").select("status").eq("id", caseId).single();
    expect(caso!.status).toBe("investigando");
  });

  it("rechaza si ya hay una corrida en curso", async () => {
    const caseId = await createCase("test-enq-dup");
    await authed.rpc("enqueue_investigation", { p_case_id: caseId });
    const { error } = await authed.rpc("enqueue_investigation", { p_case_id: caseId });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/en curso/);
  });
});

describe("índice único de casos", () => {
  it("rechaza el mismo platform+handle (backstop de carreras)", async () => {
    await createCase("test-enq-uniq");
    const { error } = await authed
      .from("cases")
      .insert({ platform: "twitter", handle: "test-enq-uniq", created_by: userId });
    expect(error).not.toBeNull();
    expect(error!.code).toBe("23505");
  });
});
```

- [ ] **Step 2:** Run: `pnpm --filter worker test enqueue` → FAIL (la RPC y el índice no existen; el test de "sin sesión" puede pasar — los demás deben fallar).

- [ ] **Step 3: Escribir la migración**

`supabase/migrations/0007_cases_notes_unique_enqueue.sql`:
```sql
-- Contexto inicial del activista ("por qué lo marco").
alter table public.cases add column notes text;

-- Anti-duplicados: la UI pre-chequea; este índice es el backstop contra carreras.
create unique index cases_platform_handle_key
  on public.cases (platform, lower(handle));

-- Única puerta de encolado (jobs sigue cerrada a clientes, ver 0005).
create function public.enqueue_investigation(p_case_id uuid)
returns uuid
language plpgsql
security definer set search_path = ''
as $$
declare
  v_run_id uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if not public.can_see_case(p_case_id) then
    raise exception 'Caso no visible';
  end if;
  if exists (
    select 1 from public.investigation_runs
    where case_id = p_case_id and status in ('queued', 'running')
  ) then
    raise exception 'Ya hay una investigación en curso';
  end if;

  insert into public.investigation_runs (case_id, status)
  values (p_case_id, 'queued')
  returning id into v_run_id;

  insert into public.jobs (type, payload)
  values ('investigate', jsonb_build_object('run_id', v_run_id, 'case_id', p_case_id));

  update public.cases set status = 'investigando' where id = p_case_id;

  return v_run_id;
end;
$$;

revoke execute on function public.enqueue_investigation(uuid) from public, anon;
grant execute on function public.enqueue_investigation(uuid) to authenticated;
```

- [ ] **Step 4: Aplicar la migración**
```bash
set -a; . ./.env; set +a
echo "y" | npx -y supabase@latest db push --db-url "$DATABASE_URL"
```
Expected: `Applying migration 0007_cases_notes_unique_enqueue.sql... Finished`.

- [ ] **Step 5:** Run: `pnpm --filter worker test enqueue` → PASS (4 tests).

- [ ] **Step 6: Commit**
```bash
git add supabase/migrations/0007_cases_notes_unique_enqueue.sql worker/test/enqueue.test.ts
git commit -m "feat(db): notes, índice único de casos y RPC enqueue_investigation"
```

---

## Task 3: Handler stub `investigate` del worker (TDD)

**Files:**
- Create: `worker/src/investigate.ts`
- Modify: `worker/src/handlers.ts` (quitar `noop`)
- Modify: `worker/src/index.ts` (importar investigate)
- Test: `worker/test/investigate.test.ts`

- [ ] **Step 1: Escribir el test PRIMERO**

`worker/test/investigate.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { supabase as svc } from "../src/supabase.js";
import { tick } from "../src/loop.js";
import "../src/investigate.js"; // registra el handler

const EMAIL = "test-investigate@example.com";
let userId: string;
let caseId: string;
let runId: string;

async function deleteUserByEmail(email: string) {
  const { data } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const u = data?.users?.find((x) => x.email === email);
  if (u) await svc.auth.admin.deleteUser(u.id);
}

beforeAll(async () => {
  await deleteUserByEmail(EMAIL);
  await svc.from("cases").delete().like("handle", "test-inv%");
  const { data, error } = await svc.auth.admin.createUser({
    email: EMAIL, password: "TestInv2026!", email_confirm: true,
  });
  if (error) throw error;
  userId = data.user.id;

  const { data: c } = await svc
    .from("cases")
    .insert({ platform: "twitter", handle: "test-inv-1", created_by: userId, status: "investigando" })
    .select("id").single();
  caseId = c!.id;

  const { data: r } = await svc
    .from("investigation_runs").insert({ case_id: caseId, status: "queued" })
    .select("id").single();
  runId = r!.id;

  await svc.from("jobs").insert({
    type: "investigate",
    payload: { run_id: runId, case_id: caseId },
  });
});

afterAll(async () => {
  await svc.from("cases").delete().like("handle", "test-inv%");
  await deleteUserByEmail(EMAIL);
});

describe("handler investigate (stub)", () => {
  it("procesa el job: run needs_review + step de auditoría + caso needs_review", async () => {
    // la cola puede tener otros jobs: tickear hasta que el nuestro termine
    for (let i = 0; i < 15; i++) {
      const { data } = await svc
        .from("investigation_runs").select("status").eq("id", runId).single();
      if (data!.status === "needs_review") break;
      const processed = await tick();
      if (!processed) break;
    }

    const { data: run } = await svc
      .from("investigation_runs")
      .select("status, verdict, started_at, finished_at")
      .eq("id", runId).single();
    expect(run!.status).toBe("needs_review");
    expect((run!.verdict as { stub: boolean }).stub).toBe(true);
    expect(run!.started_at).not.toBeNull();
    expect(run!.finished_at).not.toBeNull();

    const { data: steps } = await svc
      .from("agent_steps").select("tool_name, reasoning").eq("run_id", runId);
    expect(steps!.length).toBe(1);
    expect(steps![0].tool_name).toBe("stub");

    const { data: caso } = await svc
      .from("cases").select("status").eq("id", caseId).single();
    expect(caso!.status).toBe("needs_review");
  });
});
```

- [ ] **Step 2:** Run: `pnpm --filter worker test investigate` → FAIL (`../src/investigate.js` no existe).

- [ ] **Step 3: Implementar el handler**

`worker/src/investigate.ts`:
```typescript
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
```

- [ ] **Step 4: Quitar `noop` de `worker/src/handlers.ts`**

Eliminar estas líneas del final de `handlers.ts` (el resto queda igual):
```typescript
// Handler de prueba de Fase 0: solo registra que se ejecutó. Se quitará en Fase 1.
registerHandler("noop", async () => {
  console.log("[worker] job noop procesado");
});
```

- [ ] **Step 5: Registrar en el entrypoint — `worker/src/index.ts`**

Cambiar la línea `import "./handlers.js"; // registra los handlers` por:
```typescript
import "./investigate.js"; // registra el handler investigate
```

- [ ] **Step 6:** Run: `pnpm --filter worker test` → PASS (todos: handlers, jobs, enqueue, investigate). `pnpm --filter worker build` → sin errores.

- [ ] **Step 7: Commit**
```bash
git add worker/src/investigate.ts worker/src/handlers.ts worker/src/index.ts worker/test/investigate.test.ts
git commit -m "feat(worker): handler stub investigate; retira noop"
```

---

## Task 4: Página de lista `/casos` + navegación

**Files:**
- Create: `web/src/app/(app)/casos/page.tsx`
- Modify: `web/src/app/(app)/layout.tsx` (link en header)

- [ ] **Step 1: Crear `web/src/app/(app)/casos/page.tsx`**
```tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

const ESTADOS = ["nuevo", "investigando", "needs_review", "confirmado", "descartado"] as const;

export default async function CasosPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const { estado } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("cases")
    .select("id, handle, platform, status, created_at")
    .order("created_at", { ascending: false });
  if (estado && (ESTADOS as readonly string[]).includes(estado)) {
    query = query.eq("status", estado);
  }
  const { data: casos } = await query;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Casos</h1>
        <Link href="/casos/nuevo" className="rounded bg-emerald-600 px-3 py-2 text-sm font-medium">
          + Nuevo caso
        </Link>
      </div>

      <nav className="flex flex-wrap gap-2 text-sm">
        <Link href="/casos" className={!estado ? "text-emerald-400" : "text-neutral-400"}>
          todos
        </Link>
        {ESTADOS.map((e) => (
          <Link
            key={e}
            href={`/casos?estado=${e}`}
            className={estado === e ? "text-emerald-400" : "text-neutral-400"}
          >
            {e}
          </Link>
        ))}
      </nav>

      <ul className="flex flex-col gap-2">
        {(casos ?? []).map((c) => (
          <li key={c.id}>
            <Link
              href={`/casos/${c.id}`}
              className="flex items-center justify-between rounded border border-neutral-800 p-3 hover:border-neutral-600"
            >
              <span className="font-mono">@{c.handle}</span>
              <span className="text-sm text-neutral-400">
                {c.platform} · {c.status}
              </span>
            </Link>
          </li>
        ))}
        {(casos ?? []).length === 0 && (
          <li className="text-neutral-500">No hay casos{estado ? ` en estado "${estado}"` : ""}.</li>
        )}
      </ul>
    </section>
  );
}
```

- [ ] **Step 2: Añadir link "Casos" al header de `web/src/app/(app)/layout.tsx`**

En el `<header>`, cambiar:
```tsx
        <span className="font-semibold">michis</span>
```
por:
```tsx
        <nav className="flex items-center gap-4">
          <span className="font-semibold">michis</span>
          <a href="/casos" className="text-sm text-neutral-300 hover:text-white">Casos</a>
        </nav>
```

- [ ] **Step 3:** Run: `pnpm --filter web exec tsc --noEmit` → sin errores.

- [ ] **Step 4: Commit**
```bash
git add "web/src/app/(app)/casos/page.tsx" "web/src/app/(app)/layout.tsx"
git commit -m "feat(web): lista de casos con filtro por estado y navegación"
```

---

## Task 5: Formulario de alta `/casos/nuevo` (con test de validación primero)

**Files:**
- Create: `web/src/app/(app)/casos/nuevo/page.tsx`
- Test: `web/src/test/casoNuevoForm.test.tsx`

- [ ] **Step 1: Escribir el component test PRIMERO**

`web/src/test/casoNuevoForm.test.tsx`:
```tsx
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// El form solo toca supabase DESPUÉS de validar; para el caso inválido basta un mock vacío.
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import CasoNuevoPage from "../app/(app)/casos/nuevo/page";

describe("formulario de nuevo caso", () => {
  it("muestra error de validación con handle inválido y no envía", async () => {
    render(<CasoNuevoPage />);
    fireEvent.change(screen.getByPlaceholderText("@handle"), {
      target: { value: "handle con espacios" },
    });
    fireEvent.click(screen.getByText("Crear caso"));
    await waitFor(() => {
      expect(screen.getByText(/Handle inválido/)).toBeDefined();
    });
  });
});
```

- [ ] **Step 2:** Run: `pnpm --filter web test casoNuevo` → FAIL (la página no existe).

- [ ] **Step 3: Implementar `web/src/app/(app)/casos/nuevo/page.tsx`**
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { normalizeHandle, isValidHandle } from "@/lib/handle";

export default function CasoNuevoPage() {
  const router = useRouter();
  const [platform, setPlatform] = useState<"twitter" | "tiktok">("twitter");
  const [handle, setHandle] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [dupId, setDupId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDupId(null);

    const h = normalizeHandle(handle);
    if (!isValidHandle(h)) {
      setError("Handle inválido: usa letras, números, _ o . (máx 30).");
      return;
    }

    setSending(true);
    const supabase = createClient();

    // Pre-chequeo de duplicado (al enviar): aviso amable con link.
    const { data: existing } = await supabase
      .from("cases").select("id").eq("platform", platform).eq("handle", h).maybeSingle();
    if (existing) {
      setDupId(existing.id);
      setSending(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    const { data, error: insErr } = await supabase
      .from("cases")
      .insert({ platform, handle: h, notes: notes || null, created_by: user!.id })
      .select("id")
      .single();

    if (insErr) {
      // 23505 = índice único (carrera): otro lo creó entre el pre-chequeo y el insert.
      if (insErr.code === "23505") {
        const { data: again } = await supabase
          .from("cases").select("id").eq("platform", platform).eq("handle", h).maybeSingle();
        if (again) setDupId(again.id);
        else setError("Ya existe un caso para esa cuenta (no visible para ti).");
      } else {
        setError(insErr.message);
      }
      setSending(false);
      return;
    }

    router.push(`/casos/${data.id}`);
  }

  return (
    <section className="mx-auto flex max-w-md flex-col gap-4">
      <h1 className="text-xl font-semibold">Nuevo caso</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value as "twitter" | "tiktok")}
          className="rounded bg-neutral-900 p-2"
        >
          <option value="twitter">X / Twitter</option>
          <option value="tiktok">TikTok</option>
        </select>
        <input
          placeholder="@handle"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          className="rounded bg-neutral-900 p-2 font-mono"
        />
        <textarea
          placeholder="Notas: ¿por qué te parece sospechosa esta cuenta?"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          className="rounded bg-neutral-900 p-2"
        />
        <button
          type="submit"
          disabled={sending}
          className="rounded bg-emerald-600 p-2 font-medium disabled:opacity-50"
        >
          Crear caso
        </button>
        {error && <p className="text-sm text-red-400">{error}</p>}
        {dupId && (
          <p className="text-sm text-amber-400">
            Ya existe un caso para esa cuenta.{" "}
            <a href={`/casos/${dupId}`} className="underline">Ver caso existente →</a>
          </p>
        )}
      </form>
    </section>
  );
}
```

- [ ] **Step 4:** Run: `pnpm --filter web test` → PASS (handle + roleGate + casoNuevo). `pnpm --filter web exec tsc --noEmit` → sin errores.

- [ ] **Step 5: Commit**
```bash
git add "web/src/app/(app)/casos/nuevo/page.tsx" web/src/test/casoNuevoForm.test.tsx
git commit -m "feat(web): alta de caso con normalización y aviso de duplicado"
```

---

## Task 6: Detalle `/casos/[id]` + botones Investigar / Eliminar

**Files:**
- Create: `web/src/components/InvestigateButton.tsx`
- Create: `web/src/components/DeleteCaseButton.tsx`
- Create: `web/src/app/(app)/casos/[id]/page.tsx`

- [ ] **Step 1: Crear `web/src/components/InvestigateButton.tsx`**
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function InvestigateButton({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("enqueue_investigation", { p_case_id: caseId });
    if (error) {
      setMsg(
        error.message.includes("en curso")
          ? "Ya hay una investigación en curso para este caso."
          : error.message,
      );
    } else {
      setMsg("Investigación encolada ✓");
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={onClick}
        disabled={busy}
        className="rounded bg-emerald-600 px-3 py-2 text-sm font-medium disabled:opacity-50"
      >
        ▶ Investigar
      </button>
      {msg && <span className="text-sm text-neutral-400">{msg}</span>}
    </div>
  );
}
```

- [ ] **Step 2: Crear `web/src/components/DeleteCaseButton.tsx`**
```tsx
"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function DeleteCaseButton({ caseId }: { caseId: string }) {
  const router = useRouter();

  async function onClick() {
    if (!confirm("¿Eliminar este caso y todo su historial? No se puede deshacer.")) return;
    const supabase = createClient();
    const { error } = await supabase.from("cases").delete().eq("id", caseId);
    if (error) {
      alert(`No se pudo eliminar: ${error.message}`);
      return;
    }
    router.push("/casos");
  }

  return (
    <button onClick={onClick} className="rounded border border-red-900 px-3 py-2 text-sm text-red-400">
      Eliminar caso
    </button>
  );
}
```

- [ ] **Step 3: Crear `web/src/app/(app)/casos/[id]/page.tsx`**
```tsx
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RoleGate, type Role } from "@/components/RoleGate";
import { InvestigateButton } from "@/components/InvestigateButton";
import { DeleteCaseButton } from "@/components/DeleteCaseButton";

export default async function CasoDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: caso } = await supabase
    .from("cases")
    .select("id, handle, platform, status, notes, created_at, created_by")
    .eq("id", id)
    .maybeSingle();
  if (!caso) notFound();

  const { data: runs } = await supabase
    .from("investigation_runs")
    .select("id, status, verdict, created_at, finished_at")
    .eq("case_id", id)
    .order("created_at", { ascending: false });

  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user!.id).single();
  const role: Role = (profile?.role as Role) ?? "activista";

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-xl font-semibold">@{caso.handle}</h1>
          <p className="text-sm text-neutral-400">
            {caso.platform} · estado: {caso.status} ·{" "}
            {new Date(caso.created_at).toLocaleDateString("es")}
          </p>
        </div>
        <RoleGate role={role} allow={["admin"]}>
          <DeleteCaseButton caseId={caso.id} />
        </RoleGate>
      </div>

      {caso.notes && (
        <div className="rounded border border-neutral-800 p-3">
          <h2 className="mb-1 text-sm font-medium text-neutral-400">Notas</h2>
          <p className="whitespace-pre-wrap">{caso.notes}</p>
        </div>
      )}

      <InvestigateButton caseId={caso.id} />

      <div>
        <h2 className="mb-2 text-sm font-medium text-neutral-400">Investigaciones</h2>
        <ul className="flex flex-col gap-2">
          {(runs ?? []).map((r) => (
            <li key={r.id} className="rounded border border-neutral-800 p-3 text-sm">
              <span className="font-medium">{r.status}</span>
              <span className="text-neutral-400">
                {" "}· {new Date(r.created_at).toLocaleString("es")}
              </span>
              {r.verdict != null && (
                <p className="mt-1 text-neutral-400">
                  {(r.verdict as { summary?: string }).summary ?? ""}
                </p>
              )}
            </li>
          ))}
          {(runs ?? []).length === 0 && (
            <li className="text-neutral-500">Sin investigaciones todavía.</li>
          )}
        </ul>
      </div>
    </section>
  );
}
```

- [ ] **Step 4:** Run: `pnpm --filter web exec tsc --noEmit` → sin errores. `pnpm --filter web build` → exitoso.

- [ ] **Step 5: Commit**
```bash
git add web/src/components/InvestigateButton.tsx web/src/components/DeleteCaseButton.tsx "web/src/app/(app)/casos/[id]/page.tsx"
git commit -m "feat(web): detalle de caso con investigar (RPC) y eliminar solo-admin"
```

---

## Task 7: Verificación integral del sub-proyecto

- [ ] **Step 1:** `pnpm -r test` → TODOS verdes (worker: handlers+jobs+enqueue+investigate; web: handle+roleGate+casoNuevo).
- [ ] **Step 2:** `pnpm --filter worker build && pnpm --filter web build` → ambos OK.
- [ ] **Step 3: Smoke test e2e manual** (lo ejecuta el humano o el controlador):
  1. `set -a; . ./.env; set +a; pnpm --filter worker dev` (terminal 1) y `pnpm --filter web dev` (terminal 2).
  2. Login como `admin-demo@example.com` → `/casos` → "+ Nuevo caso" → crear `@cuenta_sospechosa`.
  3. Intentar crear de nuevo el mismo handle → debe aparecer "Ya existe un caso → Ver caso existente".
  4. En el detalle: **▶ Investigar** → "Investigación encolada ✓" → en segundos el worker procesa → recargar → corrida `needs_review` con "Pendiente del agente investigador" y caso `needs_review`.
- [ ] **Step 4: Commit final**
```bash
git add -A
git commit -m "chore: cierre sub-proyecto gestión de casos"
```

---

## Self-Review (cobertura del spec)

- Pantallas `/casos`, `/casos/nuevo`, `/casos/[id]` → Tasks 4, 5, 6 ✅
- Normalización + validación de handle → Task 1 ✅
- Duplicados: pre-chequeo al enviar + índice único backstop + aviso con link (incl. carrera 23505 y caso no visible) → Tasks 2, 5 ✅
- Migración 0007 (notes, índice, RPC con 3 validaciones y permisos) → Task 2 ✅
- Handler stub (run running→needs_review, step auditoría, verdict stub, caso needs_review, retiro de noop) → Task 3 ✅
- Manejo de errores (mensajes RPC traducidos, failJob existente) → Tasks 3, 6 ✅
- Testing por tabla del spec → Tasks 1, 2, 3, 5 ✅
- Tipos consistentes: `Role` de RoleGate reutilizado; payload `{run_id, case_id}` igual en RPC, handler y tests ✅
- Fuera de alcance respetado (sin realtime, sin edición, sin tags/asignación) ✅
