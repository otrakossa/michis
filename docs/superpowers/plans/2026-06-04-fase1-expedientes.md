# michis — Fase 1 / Sub-proyecto 3: Expedientes + doble gate humano — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dossier borrador auto-generado por el worker, editable por activistas, elevable al admin (RPC con sellos) y resoluble por el admin (aprobar → caso confirmado / devolver), con vista rica del veredicto y panel admin.

**Architecture:** Edición de contenido por UPDATE directo bajo RLS (solo `draft`); transiciones SOLO por RPCs SECURITY DEFINER (`elevar_expediente`, `resolver_expediente`) que estampan quién/cuándo. El worker upserta el dossier desde el veredicto sin pisar trabajo humano.

**Tech Stack:** Postgres (migraciones 0009 y 0010 — separadas por la restricción de enum de Postgres), worker TS, Next.js 15.

**Spec:** `docs/superpowers/specs/2026-06-04-fase1-expedientes-design.md`

**Entorno (LEER):** Supabase GESTIONADO, sin Docker/psql. Migraciones: `set -a; . ./.env; set +a` y `echo "y" | npx -y supabase@latest db push --db-url "$DATABASE_URL"`. pnpm en `~/.local/node-v22.15.1-linux-x64/bin/pnpm` si falta. Git: `git -c user.name="michis" -c user.email="kossa@nodolibre.org" commit ...`. Tests de integración en `worker/test/` (secuenciales, datos `test-*`, `.env` raíz auto-cargado). NO imprimir secretos.

---

## File Structure

```
supabase/migrations/
  0009_dossier_status_listo_admin.sql   # SOLO el valor de enum
  0010_expedientes_flujo.sql            # columnas + unique + RLS + 2 RPCs
worker/src/investigate.ts               # MODIFICAR: upsert del dossier
worker/test/
  expedientes.test.ts                   # integración RPCs + RLS
  dossierUpsert.test.ts                 # integración upsert del worker
web/src/components/
  VerdictView.tsx                       # vista rica del veredicto (pura)
  DossierPanel.tsx                      # editor + elevar (client)
  ResolveButtons.tsx                    # aprobar/devolver (client, admin)
web/src/app/(app)/
  layout.tsx                            # MODIFICAR: link Expedientes solo admin
  casos/[id]/page.tsx                   # MODIFICAR: VerdictView + DossierPanel
  expedientes/page.tsx                  # panel admin (server, valida rol)
web/src/test/verdictView.test.tsx
```

---

## Task 0: Rama

- [ ] `git checkout -b fase-1-expedientes` → verificar.

---

## Task 1: Migraciones 0009 + 0010 con tests de RPCs y RLS (TDD)

**Files:**
- Create: `supabase/migrations/0009_dossier_status_listo_admin.sql`, `supabase/migrations/0010_expedientes_flujo.sql`
- Test: `worker/test/expedientes.test.ts`

- [ ] **Step 1: Test PRIMERO** — `worker/test/expedientes.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabase as svc } from "../src/supabase.js";

const URL = process.env.SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const ACT_EMAIL = "test-exp-act@example.com";
const ADM_EMAIL = "test-exp-adm@example.com";
const PASS = "TestExp2026!";

let act: SupabaseClient;
let adm: SupabaseClient;
let actId: string;
let admId: string;
let caseId: string;
let dossierId: string;

async function deleteUserByEmail(email: string) {
  const { data } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const u = data?.users?.find((x) => x.email === email);
  if (u) await svc.auth.admin.deleteUser(u.id);
}

beforeAll(async () => {
  await svc.from("cases").delete().like("handle", "test-exp%");
  await deleteUserByEmail(ACT_EMAIL);
  await deleteUserByEmail(ADM_EMAIL);

  const a = await svc.auth.admin.createUser({ email: ACT_EMAIL, password: PASS, email_confirm: true });
  actId = a.data.user!.id;
  const b = await svc.auth.admin.createUser({ email: ADM_EMAIL, password: PASS, email_confirm: true });
  admId = b.data.user!.id;
  // promoción a admin por canal autorizado (service role)
  await svc.from("profiles").update({ role: "admin" }).eq("id", admId);

  act = createClient(URL, ANON);
  await act.auth.signInWithPassword({ email: ACT_EMAIL, password: PASS });
  adm = createClient(URL, ANON);
  await adm.auth.signInWithPassword({ email: ADM_EMAIL, password: PASS });

  const { data: c } = await svc.from("cases").insert({
    platform: "twitter", handle: "test-exp-1", created_by: actId, status: "needs_review",
  }).select("id").single();
  caseId = c!.id;

  const { data: d } = await svc.from("dossiers").insert({
    case_id: caseId, content: { resumen: "## borrador del agente", score: 80 },
  }).select("id").single();
  dossierId = d!.id;
});

afterAll(async () => {
  await svc.from("cases").delete().like("handle", "test-exp%");
  await deleteUserByEmail(ACT_EMAIL);
  await deleteUserByEmail(ADM_EMAIL);
});

describe("flujo de expedientes", () => {
  it("activista edita el contenido mientras está en draft (RLS)", async () => {
    const { error } = await act.from("dossiers")
      .update({ content: { resumen: "## editado por humana", score: 80 } })
      .eq("id", dossierId);
    expect(error).toBeNull();
    const { data } = await svc.from("dossiers").select("content").eq("id", dossierId).single();
    expect((data!.content as { resumen: string }).resumen).toBe("## editado por humana");
  });

  it("activista NO puede cambiar el status por UPDATE directo", async () => {
    const { error } = await act.from("dossiers")
      .update({ status: "listo_admin" })
      .eq("id", dossierId);
    expect(error).not.toBeNull(); // with check exige status = 'draft'
  });

  it("activista NO puede resolver (solo admin)", async () => {
    const { error } = await act.rpc("resolver_expediente", {
      p_dossier_id: dossierId, p_decision: "aprobar",
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/admin/i);
  });

  it("elevar_expediente: pasa a listo_admin y estampa quién/cuándo", async () => {
    const { error } = await act.rpc("elevar_expediente", { p_dossier_id: dossierId });
    expect(error).toBeNull();
    const { data } = await svc.from("dossiers")
      .select("status, submitted_by, submitted_at").eq("id", dossierId).single();
    expect(data!.status).toBe("listo_admin");
    expect(data!.submitted_by).toBe(actId);
    expect(data!.submitted_at).not.toBeNull();
  });

  it("ya elevado: no se puede editar contenido ni volver a elevar", async () => {
    await act.from("dossiers")
      .update({ content: { resumen: "hackeo", score: 1 } }).eq("id", dossierId);
    const { data } = await svc.from("dossiers").select("content").eq("id", dossierId).single();
    expect((data!.content as { resumen: string }).resumen).toBe("## editado por humana"); // intacto

    const { error } = await act.rpc("elevar_expediente", { p_dossier_id: dossierId });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/borrador/);
  });

  it("decisión inválida es rechazada", async () => {
    const { error } = await adm.rpc("resolver_expediente", {
      p_dossier_id: dossierId, p_decision: "quemar",
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/inválida/);
  });

  it("admin devuelve: vuelve a draft con contenido intacto", async () => {
    const { error } = await adm.rpc("resolver_expediente", {
      p_dossier_id: dossierId, p_decision: "devolver",
    });
    expect(error).toBeNull();
    const { data } = await svc.from("dossiers").select("status, content").eq("id", dossierId).single();
    expect(data!.status).toBe("draft");
    expect((data!.content as { resumen: string }).resumen).toBe("## editado por humana");
  });

  it("admin aprueba: dossier approved + approved_by + caso confirmado", async () => {
    await act.rpc("elevar_expediente", { p_dossier_id: dossierId });
    const { error } = await adm.rpc("resolver_expediente", {
      p_dossier_id: dossierId, p_decision: "aprobar",
    });
    expect(error).toBeNull();
    const { data: d } = await svc.from("dossiers")
      .select("status, approved_by").eq("id", dossierId).single();
    expect(d!.status).toBe("approved");
    expect(d!.approved_by).toBe(admId);
    const { data: c } = await svc.from("cases").select("status").eq("id", caseId).single();
    expect(c!.status).toBe("confirmado");
  });
});
```

- [ ] **Step 2:** `pnpm --filter worker test expedientes` → FAIL (RPCs/columnas no existen; el primer test de edición puede pasar o fallar según la política — reporta qué falló).

- [ ] **Step 3: Migración 0009** — `supabase/migrations/0009_dossier_status_listo_admin.sql`:
```sql
-- Separada de 0010: Postgres no permite añadir un valor de enum y usarlo en la
-- misma transacción.
alter type public.dossier_status add value if not exists 'listo_admin';
```

- [ ] **Step 4: Migración 0010** — `supabase/migrations/0010_expedientes_flujo.sql`:
```sql
-- Sellos de elevación + un dossier por caso (Fase 1).
alter table public.dossiers
  add column submitted_by uuid references public.profiles(id),
  add column submitted_at timestamptz;

create unique index dossiers_case_key on public.dossiers (case_id);

-- Edición de contenido por activistas SOLO en borrador. El with check impide
-- mover el status por UPDATE directo: las transiciones van por RPC.
create policy dossiers_update_activista on public.dossiers for update
  using (public.can_see_case(case_id) and status = 'draft')
  with check (public.can_see_case(case_id) and status = 'draft');

-- Gate 1: el activista eleva el expediente al admin (estampa server-side).
create function public.elevar_expediente(p_dossier_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_case uuid;
  v_status public.dossier_status;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  select case_id, status into v_case, v_status
  from public.dossiers where id = p_dossier_id;
  if v_case is null or not public.can_see_case(v_case) then
    raise exception 'Expediente no visible';
  end if;
  if v_status <> 'draft' then
    raise exception 'El expediente no está en borrador';
  end if;
  update public.dossiers
  set status = 'listo_admin', submitted_by = auth.uid(), submitted_at = now()
  where id = p_dossier_id;
end;
$$;

revoke execute on function public.elevar_expediente(uuid) from public, anon;
grant execute on function public.elevar_expediente(uuid) to authenticated;

-- Gate 2: el admin aprueba (caso confirmado) o devuelve a borrador.
create function public.resolver_expediente(p_dossier_id uuid, p_decision text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_case uuid;
  v_status public.dossier_status;
begin
  if not public.is_admin() then
    raise exception 'Solo un admin puede resolver expedientes';
  end if;
  select case_id, status into v_case, v_status
  from public.dossiers where id = p_dossier_id;
  if v_case is null then
    raise exception 'Expediente inexistente';
  end if;
  if v_status <> 'listo_admin' then
    raise exception 'El expediente no está pendiente de admin';
  end if;
  if p_decision = 'aprobar' then
    update public.dossiers
    set status = 'approved', approved_by = auth.uid()
    where id = p_dossier_id;
    update public.cases set status = 'confirmado' where id = v_case;
  elsif p_decision = 'devolver' then
    update public.dossiers set status = 'draft' where id = p_dossier_id;
  else
    raise exception 'Decisión inválida: usar aprobar o devolver';
  end if;
end;
$$;

revoke execute on function public.resolver_expediente(uuid, text) from public, anon;
grant execute on function public.resolver_expediente(uuid, text) to authenticated;
```

- [ ] **Step 5: Aplicar:** `set -a; . ./.env; set +a` y `echo "y" | npx -y supabase@latest db push --db-url "$DATABASE_URL" 2>&1 | tail -5` → aplica 0009 y 0010. Si falla a mitad → BLOCKED con el error exacto.

- [ ] **Step 6:** `pnpm --filter worker test expedientes` → PASS (8 tests). Luego `pnpm --filter worker test` → sin regresiones.

- [ ] **Step 7: Commit:**
```bash
git add supabase/migrations/0009_dossier_status_listo_admin.sql supabase/migrations/0010_expedientes_flujo.sql worker/test/expedientes.test.ts
git commit -m "feat(db): flujo de expedientes (listo_admin, sellos, RPCs elevar/resolver)"
```

---

## Task 2: Worker — upsert del dossier (TDD)

**Files:**
- Modify: `worker/src/investigate.ts`
- Test: `worker/test/dossierUpsert.test.ts`

- [ ] **Step 1: Test PRIMERO** — `worker/test/dossierUpsert.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { supabase as svc } from "../src/supabase.js";
import { runInvestigation } from "../src/investigate.js";
import { FINALIZAR } from "../src/agent/tools/finalizar.js";
import { FakeLlm } from "./fakes.js";

const EMAIL = "test-dossier@example.com";
let userId: string;
let caseId: string;

async function deleteUserByEmail(email: string) {
  const { data } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const u = data?.users?.find((x) => x.email === email);
  if (u) await svc.auth.admin.deleteUser(u.id);
}

function llmWithResumen(resumen: string) {
  return new FakeLlm([
    {
      toolUse: {
        id: "1", name: FINALIZAR,
        input: {
          score: 60, confianza: "media", senales: [], cuentas_vinculadas: [],
          resumen, modo_degradado: true,
        },
      },
    },
  ]);
}

async function newRun(): Promise<string> {
  const { data } = await svc.from("investigation_runs")
    .insert({ case_id: caseId, status: "queued" }).select("id").single();
  return data!.id;
}

beforeAll(async () => {
  await deleteUserByEmail(EMAIL);
  await svc.from("cases").delete().like("handle", "test-dossier%");
  const { data } = await svc.auth.admin.createUser({
    email: EMAIL, password: "TestDos2026!", email_confirm: true,
  });
  userId = data.user!.id;
  const { data: c } = await svc.from("cases").insert({
    platform: "twitter", handle: "test-dossier-1", created_by: userId, status: "investigando",
  }).select("id").single();
  caseId = c!.id;
});

afterAll(async () => {
  await svc.from("cases").delete().like("handle", "test-dossier%");
  await deleteUserByEmail(EMAIL);
});

describe("upsert del dossier desde el veredicto", () => {
  it("crea el dossier draft al terminar la investigación", async () => {
    await runInvestigation({ run_id: await newRun(), case_id: caseId }, { llm: llmWithResumen("## v1") });
    const { data } = await svc.from("dossiers")
      .select("status, version, content").eq("case_id", caseId).single();
    expect(data!.status).toBe("draft");
    expect(data!.version).toBe(1);
    expect((data!.content as { resumen: string }).resumen).toBe("## v1");
  });

  it("re-investigación refresca el draft y sube la versión", async () => {
    await runInvestigation({ run_id: await newRun(), case_id: caseId }, { llm: llmWithResumen("## v2") });
    const { data } = await svc.from("dossiers")
      .select("version, content").eq("case_id", caseId).single();
    expect(data!.version).toBe(2);
    expect((data!.content as { resumen: string }).resumen).toBe("## v2");
  });

  it("NO pisa un dossier elevado (listo_admin)", async () => {
    await svc.from("dossiers").update({ status: "listo_admin" }).eq("case_id", caseId);
    await runInvestigation({ run_id: await newRun(), case_id: caseId }, { llm: llmWithResumen("## v3") });
    const { data } = await svc.from("dossiers")
      .select("status, version, content").eq("case_id", caseId).single();
    expect(data!.status).toBe("listo_admin");
    expect(data!.version).toBe(2); // intacto
    expect((data!.content as { resumen: string }).resumen).toBe("## v2");
  });
});
```

- [ ] **Step 2:** `pnpm --filter worker test dossierUpsert` → FAIL (no se crea dossier).

- [ ] **Step 3: Implementar** — en `worker/src/investigate.ts`, dentro de `runInvestigation`, DESPUÉS del bloque que actualiza `cases` (score/confianza) y ANTES del bucle de `case_links`, insertar:
```typescript
  // Expediente: upsert del borrador desde el veredicto (no se pisa trabajo humano).
  const dossierContent = {
    resumen: v.resumen,
    score: v.score,
    confianza: v.confianza,
    senales: v.senales,
    modo_degradado: v.modo_degradado,
    parcial: v.parcial ?? false,
  };
  const { data: existingDossier } = await supabase
    .from("dossiers").select("id, status, version").eq("case_id", case_id).maybeSingle();
  if (!existingDossier) {
    check((await supabase.from("dossiers")
      .insert({ case_id, content: dossierContent })).error);
  } else if (existingDossier.status === "draft") {
    check((await supabase.from("dossiers")
      .update({ content: dossierContent, version: existingDossier.version + 1 })
      .eq("id", existingDossier.id)).error);
  }
  // listo_admin / approved: no tocar.
```

- [ ] **Step 4:** `pnpm --filter worker test dossierUpsert` → PASS (3 tests). `pnpm --filter worker test` → sin regresiones (nota: `investigateAgent.test.ts` crea un caso propio; el unique de dossiers por caso no le afecta). `pnpm --filter worker build` → OK.

- [ ] **Step 5: Commit:**
```bash
git add worker/src/investigate.ts worker/test/dossierUpsert.test.ts
git commit -m "feat(worker): upsert del dossier borrador desde el veredicto"
```

---

## Task 3: Web — VerdictView (TDD component) + integración

**Files:**
- Create: `web/src/components/VerdictView.tsx`
- Test: `web/src/test/verdictView.test.tsx`
- Modify: `web/src/app/(app)/casos/[id]/page.tsx`

- [ ] **Step 1: Test PRIMERO** — `web/src/test/verdictView.test.tsx`:
```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { VerdictView } from "../components/VerdictView";

describe("VerdictView", () => {
  it("muestra score, confianza y señales", () => {
    render(
      <VerdictView
        verdict={{
          score: 85, confianza: "alta",
          senales: [{ tipo: "actividad_24_7", descripcion: "postea sin dormir", peso: 4 }],
          cuentas_vinculadas: [{ handle: "otra", relacion: "mismo_texto", razon: "copypasta" }],
          modo_degradado: true,
        }}
      />,
    );
    expect(screen.getByText("85")).toBeDefined();
    expect(screen.getByText(/alta/)).toBeDefined();
    expect(screen.getByText(/postea sin dormir/)).toBeDefined();
    expect(screen.getByText(/@otra/)).toBeDefined();
    expect(screen.getByText(/modo degradado/i)).toBeDefined();
  });

  it("sin veredicto del agente muestra placeholder", () => {
    render(<VerdictView verdict={{ stub: true, summary: "Pendiente" }} />);
    expect(screen.getByText(/Sin veredicto del agente/)).toBeDefined();
  });
});
```

- [ ] **Step 2:** `pnpm --filter web test verdictView` → FAIL.

- [ ] **Step 3: Implementar** — `web/src/components/VerdictView.tsx`:
```tsx
export interface VerdictData {
  score?: number;
  confianza?: string;
  senales?: { tipo: string; descripcion: string; peso: number }[];
  cuentas_vinculadas?: { handle: string; relacion: string; razon: string }[];
  modo_degradado?: boolean;
  parcial?: boolean;
  stub?: boolean;
  summary?: string;
}

export function VerdictView({ verdict }: { verdict: VerdictData }) {
  if (verdict.stub || verdict.score == null) {
    return <p className="text-neutral-500">Sin veredicto del agente todavía.</p>;
  }
  const color =
    verdict.score > 70 ? "text-red-400" : verdict.score >= 40 ? "text-amber-400" : "text-emerald-400";

  return (
    <div className="flex flex-col gap-3 rounded border border-neutral-800 p-4">
      <div className="flex items-center gap-4">
        <span className={`text-4xl font-bold ${color}`}>{verdict.score}</span>
        <div className="text-sm text-neutral-400">
          <p>probabilidad de cuenta sintética</p>
          <p>confianza: {verdict.confianza}</p>
        </div>
        <div className="ml-auto flex gap-2 text-xs">
          {verdict.modo_degradado && (
            <span className="rounded bg-amber-950 px-2 py-1 text-amber-400">modo degradado</span>
          )}
          {verdict.parcial && (
            <span className="rounded bg-red-950 px-2 py-1 text-red-400">parcial</span>
          )}
        </div>
      </div>

      {(verdict.senales ?? []).length > 0 && (
        <table className="text-sm">
          <thead>
            <tr className="text-left text-neutral-500">
              <th className="pr-4">Señal</th><th className="pr-4">Descripción</th><th>Peso</th>
            </tr>
          </thead>
          <tbody>
            {verdict.senales!.map((s, i) => (
              <tr key={i} className="border-t border-neutral-800">
                <td className="pr-4 font-mono">{s.tipo}</td>
                <td className="pr-4 text-neutral-300">{s.descripcion}</td>
                <td>{s.peso}/5</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {(verdict.cuentas_vinculadas ?? []).length > 0 && (
        <div className="text-sm">
          <h3 className="mb-1 text-neutral-500">Cuentas posiblemente vinculadas</h3>
          <ul className="flex flex-col gap-1">
            {verdict.cuentas_vinculadas!.map((c, i) => (
              <li key={i}>
                <span className="font-mono">@{c.handle}</span>
                <span className="text-neutral-400"> · {c.relacion} · {c.razon}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Integrar al detalle** — en `web/src/app/(app)/casos/[id]/page.tsx`:
  1. Añadir import: `import { VerdictView, type VerdictData } from "@/components/VerdictView";`
  2. Después del bloque `<InvestigateButton ... />` y ANTES del bloque "Investigaciones", insertar:
```tsx
      {runs && runs.length > 0 && runs[0].verdict != null && (
        <div>
          <h2 className="mb-2 text-sm font-medium text-neutral-400">Veredicto del agente</h2>
          <VerdictView verdict={runs[0].verdict as VerdictData} />
        </div>
      )}
```

- [ ] **Step 5:** `pnpm --filter web test` → todos verdes. `pnpm --filter web exec tsc --noEmit` → OK.

- [ ] **Step 6: Commit:**
```bash
git add web/src/components/VerdictView.tsx web/src/test/verdictView.test.tsx "web/src/app/(app)/casos/[id]/page.tsx"
git commit -m "feat(web): vista rica del veredicto en el detalle del caso"
```

---

## Task 4: Web — DossierPanel (editor + elevar)

**Files:**
- Create: `web/src/components/DossierPanel.tsx`
- Modify: `web/src/app/(app)/casos/[id]/page.tsx`

- [ ] **Step 1: Crear `web/src/components/DossierPanel.tsx`**:
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export interface DossierData {
  id: string;
  status: "draft" | "listo_admin" | "approved";
  version: number;
  content: { resumen?: string } & Record<string, unknown>;
  submitted_at: string | null;
}

const STATUS_LABEL: Record<DossierData["status"], string> = {
  draft: "borrador",
  listo_admin: "pendiente de admin",
  approved: "aprobado",
};

export function DossierPanel({ dossier }: { dossier: DossierData }) {
  const router = useRouter();
  const [resumen, setResumen] = useState(dossier.content.resumen ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const editable = dossier.status === "draft";

  async function guardar() {
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("dossiers")
      .update({ content: { ...dossier.content, resumen } })
      .eq("id", dossier.id);
    setMsg(error ? error.message : "Guardado ✓");
    setBusy(false);
  }

  async function elevar() {
    if (!confirm("¿Elevar este expediente al admin? Dejará de ser editable.")) return;
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("elevar_expediente", { p_dossier_id: dossier.id });
    if (error) {
      setMsg(error.message);
    } else {
      setMsg("Elevado al admin ✓");
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-3 rounded border border-neutral-800 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-neutral-400">
          Expediente · v{dossier.version}
        </h2>
        <span className="rounded bg-neutral-900 px-2 py-1 text-xs text-neutral-300">
          {STATUS_LABEL[dossier.status]}
        </span>
      </div>

      {editable ? (
        <>
          <textarea
            value={resumen}
            onChange={(e) => setResumen(e.target.value)}
            rows={10}
            className="rounded bg-neutral-900 p-2 font-mono text-sm"
          />
          <div className="flex items-center gap-3">
            <button onClick={guardar} disabled={busy}
              className="rounded border border-neutral-700 px-3 py-2 text-sm disabled:opacity-50">
              Guardar
            </button>
            <button onClick={elevar} disabled={busy}
              className="rounded bg-emerald-600 px-3 py-2 text-sm font-medium disabled:opacity-50">
              Elevar al admin
            </button>
            {msg && <span className="text-sm text-neutral-400">{msg}</span>}
          </div>
        </>
      ) : (
        <pre className="whitespace-pre-wrap rounded bg-neutral-900 p-3 font-mono text-sm">
          {dossier.content.resumen ?? ""}
        </pre>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Integrar al detalle** — en `web/src/app/(app)/casos/[id]/page.tsx`:
  1. Import: `import { DossierPanel, type DossierData } from "@/components/DossierPanel";`
  2. Tras la consulta de `runs`, añadir:
```tsx
  const { data: dossier } = await supabase
    .from("dossiers")
    .select("id, status, version, content, submitted_at")
    .eq("case_id", id)
    .maybeSingle();
```
  3. Después del bloque del veredicto (Task 3) insertar:
```tsx
      {dossier && <DossierPanel dossier={dossier as DossierData} />}
```

- [ ] **Step 3:** `pnpm --filter web exec tsc --noEmit` → OK. `pnpm --filter web test` → verdes.

- [ ] **Step 4: Commit:**
```bash
git add web/src/components/DossierPanel.tsx "web/src/app/(app)/casos/[id]/page.tsx"
git commit -m "feat(web): panel de expediente editable con elevación al admin"
```

---

## Task 5: Web — panel admin /expedientes + nav condicional

**Files:**
- Create: `web/src/components/ResolveButtons.tsx`, `web/src/app/(app)/expedientes/page.tsx`
- Modify: `web/src/app/(app)/layout.tsx`

- [ ] **Step 1: `web/src/components/ResolveButtons.tsx`**:
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function ResolveButtons({ dossierId }: { dossierId: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function resolver(decision: "aprobar" | "devolver") {
    if (decision === "aprobar" && !confirm("¿Aprobar este expediente? El caso quedará confirmado.")) return;
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { error } = await supabase.rpc("resolver_expediente", {
      p_dossier_id: dossierId, p_decision: decision,
    });
    if (error) setMsg(error.message);
    else router.refresh();
    setBusy(false);
  }

  return (
    <div className="flex items-center gap-2">
      <button onClick={() => resolver("aprobar")} disabled={busy}
        className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium disabled:opacity-50">
        Aprobar
      </button>
      <button onClick={() => resolver("devolver")} disabled={busy}
        className="rounded border border-amber-800 px-3 py-1.5 text-sm text-amber-400 disabled:opacity-50">
        Devolver
      </button>
      {msg && <span className="text-xs text-red-400">{msg}</span>}
    </div>
  );
}
```

- [ ] **Step 2: `web/src/app/(app)/expedientes/page.tsx`** (server, valida rol en el SERVIDOR):
```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ResolveButtons } from "@/components/ResolveButtons";

export default async function ExpedientesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") redirect("/");

  const { data: dossiers } = await supabase
    .from("dossiers")
    .select("id, content, submitted_at, case:cases(id, handle, platform, risk_score)")
    .eq("status", "listo_admin")
    .order("submitted_at", { ascending: true });

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Expedientes pendientes</h1>
      <ul className="flex flex-col gap-3">
        {(dossiers ?? []).map((d) => {
          const caso = d.case as unknown as {
            id: string; handle: string; platform: string; risk_score: number | null;
          };
          return (
            <li key={d.id} className="flex items-center justify-between gap-4 rounded border border-neutral-800 p-3">
              <div className="text-sm">
                <Link href={`/casos/${caso.id}`} className="font-mono underline">
                  @{caso.handle}
                </Link>
                <span className="text-neutral-400">
                  {" "}· {caso.platform} · score {caso.risk_score ?? "?"} · elevado{" "}
                  {d.submitted_at ? new Date(d.submitted_at).toLocaleString("es") : ""}
                </span>
              </div>
              <ResolveButtons dossierId={d.id} />
            </li>
          );
        })}
        {(dossiers ?? []).length === 0 && (
          <li className="text-neutral-500">No hay expedientes pendientes de revisión.</li>
        )}
      </ul>
    </section>
  );
}
```

- [ ] **Step 3: Nav condicional** — en `web/src/app/(app)/layout.tsx`, dentro del `<nav>` existente, después del link "Casos", añadir:
```tsx
          {role === "admin" && (
            <a href="/expedientes" className="text-sm text-neutral-300 hover:text-white">Expedientes</a>
          )}
```
(`role` ya está calculado en ese layout.)

- [ ] **Step 4:** `pnpm --filter web exec tsc --noEmit` → OK. `pnpm --filter web build` → exitoso. Si el join `case:cases(...)` produce un tipo array en vez de objeto, mantener el cast `as unknown as` ya previsto.

- [ ] **Step 5: Commit:**
```bash
git add web/src/components/ResolveButtons.tsx "web/src/app/(app)/expedientes/page.tsx" "web/src/app/(app)/layout.tsx"
git commit -m "feat(web): panel admin de expedientes con aprobar/devolver y nav por rol"
```

---

## Task 6: Verificación integral

- [ ] **Step 1:** `pnpm -r test` → TODOS verdes (worker: budget 2, runtime 4, similitud 1, investigate 1, investigateAgent 1, dossierUpsert 3, expedientes 8, enqueue 4, jobs 4, handlers 2 = 30 + agentReal skipped; web: 12).
- [ ] **Step 2:** `pnpm --filter worker build && pnpm --filter web build` → OK.
- [ ] **Step 3:** Smoke manual (humano/controlador): caso → investigar → veredicto visible → expediente editable → elevar → como admin: /expedientes → aprobar → caso `confirmado`.
- [ ] **Step 4:** Commit final si quedó algo: `git add -A && git commit -m "chore: cierre sub-proyecto expedientes"`

---

## Self-Review (cobertura del spec)

- Flujo de estados §2 (draft → listo_admin → approved/devolver; caso confirmado) → Tasks 1, 5 ✅
- Migraciones separadas 0009/0010 §3 (enum aparte; columnas, unique por caso, política de edición, RPCs con sellos y grants) → Task 1 ✅
- Upsert del worker §4 (crea / refresca+version / respeta listo_admin-approved) → Task 2 ✅
- UI §5: VerdictView (score+color, señales, vinculadas, badges) → Task 3; DossierPanel (editar draft, elevar, solo lectura después) → Task 4; /expedientes con validación de rol EN SERVIDOR + nav admin → Task 5 ✅
- Testing §6: RPCs/RLS (8 tests, dos usuarios), upsert (3), componente (2) → Tasks 1, 2, 3 ✅
- Tipos consistentes: `DossierData.status` usa los 3 estados del enum; `VerdictData` compatible con el verdict del runtime (incl. `stub`/`summary` del fallback) ✅
- Nota consciente: `submitted_by` se muestra como fecha de elevación en el panel admin (sin nombre del activista — requiere join extra a profiles; YAGNI, anotado para iteración futura).
