# michis — Fase 1 / Sub-proyecto 4: Denuncia coordinada — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Campañas de denuncia sobre casos confirmados: activación por admin (RPC), participación "ya reporté" de un toque, progreso por sondeo (5 s) sin exponer identidades, y cierre con resultado.

**Architecture:** Tres RPCs SECURITY DEFINER (`activar_campania`, `cerrar_campania`, `progreso_campania`) + endurecimiento del RLS de `denuncia_actions` (solo campañas activas). UI: `/campanias`, `/campanias/[id]`, badge en nav, activación desde el detalle del caso. Sin push web (siguiente iteración).

**Tech Stack:** Postgres (migración 0011), Next.js 15, Vitest.

**Spec:** `docs/superpowers/specs/2026-06-05-fase1-denuncia-coordinada-design.md`

**Entorno (LEER):** Supabase GESTIONADO, sin Docker/psql. Migraciones: `set -a; . ./.env; set +a` y `echo "y" | npx -y supabase@latest db push --db-url "$DATABASE_URL"`. pnpm en `~/.local/node-v22.15.1-linux-x64/bin/pnpm` si falta. Git: `git -c user.name="michis" -c user.email="kossa@nodolibre.org" commit ...`. Tests de integración en `worker/test/` (secuenciales, datos `test-*`). NO imprimir secretos.

---

## File Structure

```
supabase/migrations/0011_campanias.sql
worker/test/campanias.test.ts            # integración RPCs + RLS
web/src/components/
  CampaignProgress.tsx                   # barra + sondeo 5s (client)
  YaReporteButton.tsx                    # marcar participación (client)
  CerrarCampaniaButton.tsx               # admin (client)
  ActivateCampaignButton.tsx             # admin, en detalle del caso (client)
web/src/app/(app)/
  layout.tsx                             # MODIFICAR: link Campañas + badge
  campanias/page.tsx                     # lista activas/cerradas
  campanias/[id]/page.tsx                # detalle de campaña
  casos/[id]/page.tsx                    # MODIFICAR: bloque de campaña
web/src/test/campaignProgress.test.tsx
```

---

## Task 0: Rama

- [ ] `git checkout -b fase-1-campanias` → verificar.

---

## Task 1: Migración 0011 + tests de RPCs y RLS (TDD)

**Files:**
- Create: `supabase/migrations/0011_campanias.sql`
- Test: `worker/test/campanias.test.ts`

- [ ] **Step 1: Test PRIMERO** — `worker/test/campanias.test.ts`:
```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabase as svc } from "../src/supabase.js";

const URL = process.env.SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const ACT_EMAIL = "test-camp-act@example.com";
const ADM_EMAIL = "test-camp-adm@example.com";
const PASS = "TestCamp2026!";

let act: SupabaseClient;
let adm: SupabaseClient;
let actId: string;
let admId: string;
let confirmedCaseId: string;
let newCaseId: string;
let campaignId: string;

async function deleteUserByEmail(email: string) {
  const { data } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const u = data?.users?.find((x) => x.email === email);
  if (u) await svc.auth.admin.deleteUser(u.id);
}

beforeAll(async () => {
  await svc.from("cases").delete().like("handle", "test-camp%");
  await deleteUserByEmail(ACT_EMAIL);
  await deleteUserByEmail(ADM_EMAIL);

  const a = await svc.auth.admin.createUser({ email: ACT_EMAIL, password: PASS, email_confirm: true });
  actId = a.data.user!.id;
  const b = await svc.auth.admin.createUser({ email: ADM_EMAIL, password: PASS, email_confirm: true });
  admId = b.data.user!.id;
  await svc.from("profiles").update({ role: "admin" }).eq("id", admId);

  act = createClient(URL, ANON);
  await act.auth.signInWithPassword({ email: ACT_EMAIL, password: PASS });
  adm = createClient(URL, ANON);
  await adm.auth.signInWithPassword({ email: ADM_EMAIL, password: PASS });

  const { data: c1 } = await svc.from("cases").insert({
    platform: "twitter", handle: "test-camp-1", created_by: actId, status: "confirmado",
  }).select("id").single();
  confirmedCaseId = c1!.id;
  const { data: c2 } = await svc.from("cases").insert({
    platform: "twitter", handle: "test-camp-2", created_by: actId, status: "nuevo",
  }).select("id").single();
  newCaseId = c2!.id;
});

afterAll(async () => {
  await svc.from("cases").delete().like("handle", "test-camp%");
  await deleteUserByEmail(ACT_EMAIL);
  await deleteUserByEmail(ADM_EMAIL);
});

describe("activar_campania", () => {
  it("activista no puede activar", async () => {
    const { error } = await act.rpc("activar_campania", {
      p_case_id: confirmedCaseId, p_instructions: "x", p_report_url: "https://x.com",
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/admin/i);
  });

  it("rechaza caso no confirmado", async () => {
    const { error } = await adm.rpc("activar_campania", {
      p_case_id: newCaseId, p_instructions: "x", p_report_url: "https://x.com",
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/confirmado/);
  });

  it("admin activa sobre caso confirmado", async () => {
    const { data, error } = await adm.rpc("activar_campania", {
      p_case_id: confirmedCaseId,
      p_instructions: "Reportar como spam coordinado",
      p_report_url: "https://help.x.com/forms",
    });
    expect(error).toBeNull();
    campaignId = data as string;
    const { data: camp } = await svc.from("denuncia_campaigns")
      .select("status, instructions, report_links, started_by").eq("id", campaignId).single();
    expect(camp!.status).toBe("active");
    expect(camp!.started_by).toBe(admId);
    expect((camp!.report_links as { url: string }).url).toBe("https://help.x.com/forms");
  });

  it("rechaza una segunda campaña activa para el mismo caso", async () => {
    const { error } = await adm.rpc("activar_campania", {
      p_case_id: confirmedCaseId, p_instructions: "y", p_report_url: "https://x.com",
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/Ya hay una campaña activa/);
  });
});

describe("participación y progreso", () => {
  it("progreso inicial: 0 reportes, total >= 2", async () => {
    const { data, error } = await act.rpc("progreso_campania", { p_campaign_id: campaignId });
    expect(error).toBeNull();
    const row = Array.isArray(data) ? data[0] : data;
    expect(row.reportes).toBe(0);
    expect(row.total).toBeGreaterThanOrEqual(2);
  });

  it("activista marca 'ya reporté'", async () => {
    const { error } = await act.from("denuncia_actions")
      .insert({ campaign_id: campaignId, user_id: actId });
    expect(error).toBeNull();
  });

  it("duplicado rechazado (única participación por persona)", async () => {
    const { error } = await act.from("denuncia_actions")
      .insert({ campaign_id: campaignId, user_id: actId });
    expect(error).not.toBeNull();
    expect(error!.code).toBe("23505");
  });

  it("el progreso refleja el reporte", async () => {
    const { data } = await act.rpc("progreso_campania", { p_campaign_id: campaignId });
    const row = Array.isArray(data) ? data[0] : data;
    expect(row.reportes).toBe(1);
  });
});

describe("cerrar_campania", () => {
  it("activista no puede cerrar", async () => {
    const { error } = await act.rpc("cerrar_campania", {
      p_campaign_id: campaignId, p_resultado: "x",
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/admin/i);
  });

  it("admin cierra con resultado", async () => {
    const { error } = await adm.rpc("cerrar_campania", {
      p_campaign_id: campaignId, p_resultado: "cuenta suspendida",
    });
    expect(error).toBeNull();
    const { data } = await svc.from("denuncia_campaigns")
      .select("status, resultado").eq("id", campaignId).single();
    expect(data!.status).toBe("closed");
    expect(data!.resultado).toBe("cuenta suspendida");
  });

  it("no se puede reportar en una campaña cerrada (RLS)", async () => {
    const { error } = await adm.from("denuncia_actions")
      .insert({ campaign_id: campaignId, user_id: admId });
    expect(error).not.toBeNull(); // with check exige campaña active
  });

  it("cerrar una campaña no activa es rechazado", async () => {
    const { error } = await adm.rpc("cerrar_campania", {
      p_campaign_id: campaignId, p_resultado: "y",
    });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/activa/);
  });
});
```

- [ ] **Step 2:** `pnpm --filter worker test campanias` → FAIL (RPCs no existen; reporta qué falló).

- [ ] **Step 3: Migración** — `supabase/migrations/0011_campanias.sql`:
```sql
-- Resultado del cierre ("cuenta suspendida", "sin respuesta", etc.)
alter table public.denuncia_campaigns add column resultado text;

-- Una sola campaña activa por caso.
create unique index denuncia_campaigns_active_key
  on public.denuncia_campaigns (case_id) where status = 'active';

-- Activación: solo admin, solo casos confirmados.
create function public.activar_campania(p_case_id uuid, p_instructions text, p_report_url text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_status public.case_status;
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Solo un admin puede activar campañas';
  end if;
  select status into v_status from public.cases where id = p_case_id;
  if v_status is null then
    raise exception 'Caso inexistente';
  end if;
  if v_status <> 'confirmado' then
    raise exception 'El caso debe estar confirmado';
  end if;
  begin
    insert into public.denuncia_campaigns (case_id, status, instructions, report_links, started_by)
    values (p_case_id, 'active', p_instructions,
            jsonb_build_object('url', p_report_url), auth.uid())
    returning id into v_id;
  exception when unique_violation then
    raise exception 'Ya hay una campaña activa para este caso';
  end;
  return v_id;
end;
$$;

revoke execute on function public.activar_campania(uuid, text, text) from public, anon;
grant execute on function public.activar_campania(uuid, text, text) to authenticated;

-- Cierre: solo admin, solo campañas activas.
create function public.cerrar_campania(p_campaign_id uuid, p_resultado text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_status public.campaign_status;
begin
  if not public.is_admin() then
    raise exception 'Solo un admin puede cerrar campañas';
  end if;
  select status into v_status from public.denuncia_campaigns where id = p_campaign_id;
  if v_status is null then
    raise exception 'Campaña inexistente';
  end if;
  if v_status <> 'active' then
    raise exception 'La campaña no está activa';
  end if;
  update public.denuncia_campaigns
  set status = 'closed', resultado = p_resultado
  where id = p_campaign_id;
end;
$$;

revoke execute on function public.cerrar_campania(uuid, text) from public, anon;
grant execute on function public.cerrar_campania(uuid, text) to authenticated;

-- Progreso agregado SIN exponer identidades (el RLS impide a un activista ver
-- acciones ajenas o enumerar perfiles; esta RPC devuelve solo conteos).
create function public.progreso_campania(p_campaign_id uuid)
returns table (reportes int, total int)
language sql stable security definer set search_path = ''
as $$
  select
    (select count(*)::int from public.denuncia_actions where campaign_id = p_campaign_id),
    (select count(*)::int from public.profiles where active = true);
$$;

revoke execute on function public.progreso_campania(uuid) from public, anon;
grant execute on function public.progreso_campania(uuid) to authenticated;

-- Endurecimiento: solo se participa en campañas ACTIVAS.
drop policy if exists actions_insert on public.denuncia_actions;
create policy actions_insert on public.denuncia_actions for insert
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.denuncia_campaigns c
      where c.id = campaign_id and c.status = 'active'
    )
  );
```

- [ ] **Step 4: Aplicar:** `set -a; . ./.env; set +a` y `echo "y" | npx -y supabase@latest db push --db-url "$DATABASE_URL" 2>&1 | tail -4`. Si falla a mitad → BLOCKED con el error exacto.

- [ ] **Step 5:** `pnpm --filter worker test campanias` → PASS (11 tests). `pnpm --filter worker test` → sin regresiones.

- [ ] **Step 6: Commit:**
```bash
git add supabase/migrations/0011_campanias.sql worker/test/campanias.test.ts
git commit -m "feat(db): campañas de denuncia (activar/cerrar/progreso, RLS endurecido)"
```

---

## Task 2: Web — componentes de campaña (TDD en CampaignProgress)

**Files:**
- Create: `web/src/components/CampaignProgress.tsx`, `web/src/components/YaReporteButton.tsx`, `web/src/components/CerrarCampaniaButton.tsx`, `web/src/components/ActivateCampaignButton.tsx`
- Test: `web/src/test/campaignProgress.test.tsx`

- [ ] **Step 1: Test PRIMERO** — `web/src/test/campaignProgress.test.tsx`:
```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    rpc: async () => ({ data: [{ reportes: 3, total: 10 }] }),
    auth: { getUser: async () => ({ data: { user: null } }) },
  }),
}));

import { CampaignProgress } from "../components/CampaignProgress";

describe("CampaignProgress", () => {
  it("muestra el conteo X / Y", async () => {
    render(<CampaignProgress campaignId="c1" active={false} />);
    await waitFor(() => {
      expect(screen.getByText(/3 \/ 10 ya reportaron/)).toBeDefined();
    });
  });
});
```

- [ ] **Step 2:** `pnpm --filter web test campaignProgress` → FAIL.

- [ ] **Step 3: `web/src/components/CampaignProgress.tsx`**:
```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function CampaignProgress({ campaignId, active }: { campaignId: string; active: boolean }) {
  const [data, setData] = useState<{ reportes: number; total: number } | null>(null);
  const [mine, setMine] = useState(false);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: rows } = await supabase.rpc("progreso_campania", { p_campaign_id: campaignId });
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (row) setData({ reportes: row.reportes, total: row.total });
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: own } = await supabase
        .from("denuncia_actions")
        .select("id").eq("campaign_id", campaignId).eq("user_id", user.id).maybeSingle();
      setMine(!!own);
    }
  }, [campaignId]);

  useEffect(() => {
    load();
    if (!active) return;
    const t = setInterval(load, 5000); // sondeo ligero mientras está abierta
    return () => clearInterval(t);
  }, [load, active]);

  if (!data) return <p className="text-sm text-neutral-500">Cargando progreso…</p>;
  const pct = data.total > 0 ? Math.round((data.reportes / data.total) * 100) : 0;

  return (
    <div className="flex flex-col gap-1">
      <div className="h-2 w-full overflow-hidden rounded bg-neutral-800">
        <div className="h-full bg-emerald-600 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-sm text-neutral-400">
        {data.reportes} / {data.total} ya reportaron{mine ? " · tú ya reportaste ✓" : ""}
      </p>
    </div>
  );
}
```

- [ ] **Step 4:** `pnpm --filter web test campaignProgress` → PASS.

- [ ] **Step 5: `web/src/components/YaReporteButton.tsx`**:
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function YaReporteButton({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onClick() {
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setMsg("Sesión expirada: vuelve a entrar.");
      setBusy(false);
      return;
    }
    const { error } = await supabase
      .from("denuncia_actions")
      .insert({ campaign_id: campaignId, user_id: user.id });
    if (error) {
      setMsg(error.code === "23505" ? "Ya habías reportado ✓" : error.message);
    } else {
      setMsg("¡Registrado! Gracias por participar ✓");
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <div className="flex items-center gap-3">
      <button onClick={onClick} disabled={busy}
        className="rounded bg-emerald-600 px-4 py-2 font-medium disabled:opacity-50">
        ✋ Ya reporté
      </button>
      {msg && <span className="text-sm text-neutral-400">{msg}</span>}
    </div>
  );
}
```

- [ ] **Step 6: `web/src/components/CerrarCampaniaButton.tsx`**:
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function CerrarCampaniaButton({ campaignId }: { campaignId: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);

  async function onClick() {
    const resultado = prompt("Resultado de la campaña (ej: cuenta suspendida, sin respuesta):");
    if (resultado === null) return;
    const supabase = createClient();
    const { error } = await supabase.rpc("cerrar_campania", {
      p_campaign_id: campaignId, p_resultado: resultado || "sin especificar",
    });
    if (error) setMsg(error.message);
    else router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      <button onClick={onClick}
        className="rounded border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300">
        Cerrar campaña
      </button>
      {msg && <span className="text-xs text-red-400">{msg}</span>}
    </div>
  );
}
```

- [ ] **Step 7: `web/src/components/ActivateCampaignButton.tsx`**:
```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function ActivateCampaignButton({ caseId }: { caseId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [instructions, setInstructions] = useState("");
  const [url, setUrl] = useState("https://help.x.com/es/forms");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function activar() {
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const { data, error } = await supabase.rpc("activar_campania", {
      p_case_id: caseId, p_instructions: instructions, p_report_url: url,
    });
    if (error) {
      setMsg(error.message);
      setBusy(false);
      return;
    }
    router.push(`/campanias/${data}`);
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="rounded bg-emerald-600 px-3 py-2 text-sm font-medium">
        📢 Activar campaña de denuncia
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded border border-neutral-800 p-3">
      <h3 className="text-sm font-medium text-neutral-400">Nueva campaña</h3>
      <textarea
        placeholder="Instrucciones para el grupo (qué reportar y cómo)"
        value={instructions} onChange={(e) => setInstructions(e.target.value)}
        rows={3} className="rounded bg-neutral-900 p-2 text-sm"
      />
      <input
        placeholder="URL del mecanismo de reporte"
        value={url} onChange={(e) => setUrl(e.target.value)}
        className="rounded bg-neutral-900 p-2 font-mono text-sm"
      />
      <div className="flex items-center gap-2">
        <button onClick={activar} disabled={busy}
          className="rounded bg-emerald-600 px-3 py-2 text-sm font-medium disabled:opacity-50">
          Activar
        </button>
        <button onClick={() => setOpen(false)} className="text-sm text-neutral-400">Cancelar</button>
        {msg && <span className="text-xs text-red-400">{msg}</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 8:** `pnpm --filter web exec tsc --noEmit` → OK. `pnpm --filter web test` → verdes.

- [ ] **Step 9: Commit:**
```bash
git add web/src/components/CampaignProgress.tsx web/src/components/YaReporteButton.tsx web/src/components/CerrarCampaniaButton.tsx web/src/components/ActivateCampaignButton.tsx web/src/test/campaignProgress.test.tsx
git commit -m "feat(web): componentes de campaña (progreso, participación, activar/cerrar)"
```

---

## Task 3: Web — páginas de campañas + nav + integración al caso

**Files:**
- Create: `web/src/app/(app)/campanias/page.tsx`, `web/src/app/(app)/campanias/[id]/page.tsx`
- Modify: `web/src/app/(app)/layout.tsx`, `web/src/app/(app)/casos/[id]/page.tsx`

- [ ] **Step 1: `web/src/app/(app)/campanias/page.tsx`**:
```tsx
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CampaignProgress } from "@/components/CampaignProgress";

interface CampaignRow {
  id: string;
  status: string;
  resultado: string | null;
  created_at: string;
  case: { id: string; handle: string; platform: string };
}

export default async function CampaniasPage() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("denuncia_campaigns")
    .select("id, status, resultado, created_at, case:cases(id, handle, platform)")
    .order("created_at", { ascending: false });
  const campanias = (data ?? []) as unknown as CampaignRow[];
  const activas = campanias.filter((c) => c.status === "active");
  const cerradas = campanias.filter((c) => c.status === "closed");

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h1 className="mb-3 text-xl font-semibold">Campañas activas</h1>
        <ul className="flex flex-col gap-3">
          {activas.map((c) => (
            <li key={c.id} className="rounded border border-emerald-900 p-3">
              <Link href={`/campanias/${c.id}`} className="font-mono underline">
                @{c.case.handle}
              </Link>
              <span className="text-sm text-neutral-400"> · {c.case.platform}</span>
              <div className="mt-2">
                <CampaignProgress campaignId={c.id} active={false} />
              </div>
            </li>
          ))}
          {activas.length === 0 && (
            <li className="text-neutral-500">No hay campañas activas.</li>
          )}
        </ul>
      </div>

      {cerradas.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-medium text-neutral-400">Cerradas</h2>
          <ul className="flex flex-col gap-2 text-sm">
            {cerradas.map((c) => (
              <li key={c.id} className="rounded border border-neutral-800 p-3">
                <Link href={`/campanias/${c.id}`} className="font-mono underline">
                  @{c.case.handle}
                </Link>
                <span className="text-neutral-400"> · resultado: {c.resultado ?? "—"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 2: `web/src/app/(app)/campanias/[id]/page.tsx`**:
```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RoleGate, type Role } from "@/components/RoleGate";
import { CampaignProgress } from "@/components/CampaignProgress";
import { YaReporteButton } from "@/components/YaReporteButton";
import { CerrarCampaniaButton } from "@/components/CerrarCampaniaButton";

export default async function CampaniaDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data } = await supabase
    .from("denuncia_campaigns")
    .select("id, status, instructions, report_links, resultado, created_at, case:cases(id, handle, platform)")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const camp = data as unknown as {
    id: string; status: string; instructions: string | null;
    report_links: { url?: string } | null; resultado: string | null; created_at: string;
    case: { id: string; handle: string; platform: string };
  };

  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user!.id).single();
  const role: Role = (profile?.role as Role) ?? "activista";
  const activa = camp.status === "active";

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-xl font-semibold">📢 @{camp.case.handle}</h1>
          <p className="text-sm text-neutral-400">
            {camp.case.platform} · campaña {activa ? "activa" : `cerrada (${camp.resultado ?? "—"})`} ·{" "}
            <Link href={`/casos/${camp.case.id}`} className="underline">ver caso y expediente</Link>
          </p>
        </div>
        {activa && (
          <RoleGate role={role} allow={["admin"]}>
            <CerrarCampaniaButton campaignId={camp.id} />
          </RoleGate>
        )}
      </div>

      {camp.instructions && (
        <div className="rounded border border-neutral-800 p-3">
          <h2 className="mb-1 text-sm font-medium text-neutral-400">Instrucciones</h2>
          <p className="whitespace-pre-wrap text-sm">{camp.instructions}</p>
        </div>
      )}

      <CampaignProgress campaignId={camp.id} active={activa} />

      {activa && (
        <div className="flex flex-col gap-3">
          {camp.report_links?.url && (
            <a href={camp.report_links.url} target="_blank" rel="noopener noreferrer"
              className="w-fit rounded border border-neutral-700 px-4 py-2 text-sm">
              🔗 Abrir mecanismo de reporte
            </a>
          )}
          <YaReporteButton campaignId={camp.id} />
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Nav + badge** — en `web/src/app/(app)/layout.tsx`:
  1. Tras la consulta del `profile`, añadir:
```tsx
  const { count: campActivas } = await supabase
    .from("denuncia_campaigns")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");
```
  2. En el `<nav>`, después del link "Casos", añadir:
```tsx
          <a href="/campanias" className="text-sm text-neutral-300 hover:text-white">
            Campañas
            {(campActivas ?? 0) > 0 && (
              <span className="ml-1 rounded-full bg-emerald-600 px-1.5 text-xs font-medium">
                {campActivas}
              </span>
            )}
          </a>
```

- [ ] **Step 4: Integración al detalle del caso** — en `web/src/app/(app)/casos/[id]/page.tsx`:
  1. Imports: `import Link from "next/link";` (si no está) y
     `import { ActivateCampaignButton } from "@/components/ActivateCampaignButton";`
  2. Tras la consulta del `dossier`, añadir:
```tsx
  const { data: activeCampaign } = await supabase
    .from("denuncia_campaigns")
    .select("id").eq("case_id", id).eq("status", "active").maybeSingle();
```
  3. Después del bloque `{dossier && <DossierPanel ... />}`, añadir:
```tsx
      {caso.status === "confirmado" &&
        (activeCampaign ? (
          <Link href={`/campanias/${activeCampaign.id}`}
            className="w-fit rounded border border-emerald-800 px-3 py-2 text-sm text-emerald-400">
            📢 Ver campaña activa →
          </Link>
        ) : (
          <RoleGate role={role} allow={["admin"]}>
            <ActivateCampaignButton caseId={caso.id} />
          </RoleGate>
        ))}
```

- [ ] **Step 5:** `pnpm --filter web exec tsc --noEmit` → OK. `pnpm --filter web build` → exitoso. `pnpm --filter web test` → verdes (13).

- [ ] **Step 6: Commit:**
```bash
git add "web/src/app/(app)/campanias/page.tsx" "web/src/app/(app)/campanias/[id]/page.tsx" "web/src/app/(app)/layout.tsx" "web/src/app/(app)/casos/[id]/page.tsx"
git commit -m "feat(web): páginas de campañas, badge en nav y activación desde el caso"
```

---

## Task 4: Verificación integral

- [ ] **Step 1:** `pnpm -r test` x2 → TODOS verdes y estables (worker: 41 + 1 skipped; web: 13).
- [ ] **Step 2:** `pnpm --filter worker build && pnpm --filter web build` → OK.
- [ ] **Step 3:** Smoke manual (controlador/humano): caso confirmado → activar campaña (admin) → badge visible → "ya reporté" → progreso 1/N → cerrar con resultado.
- [ ] **Step 4:** Commit final si quedó algo.

---

## Self-Review (cobertura del spec)

- Flujo §2 completo (activar → participar → progreso → cerrar con resultado) → Tasks 1, 2, 3 ✅
- Datos §3: columna resultado, unique parcial, 3 RPCs con validaciones y grants, RLS endurecido de actions → Task 1 (11 tests) ✅
- UI §4: /campanias (activas+cerradas), detalle con instrucciones/link/participación/cierre, badge en nav, activación desde el caso (o link si ya hay activa) → Tasks 2, 3 ✅
- Sondeo 5 s en vez de Realtime (decisión documentada) → CampaignProgress ✅
- Testing §5 → Tasks 1 (integración) y 2 (component) ✅
- Tipos consistentes: `progreso_campania` devuelve `table` → el cliente maneja array-u-objeto (`Array.isArray`) en CampaignProgress y en el test de integración ✅
