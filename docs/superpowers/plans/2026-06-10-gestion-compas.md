# Gestión de compas (creación directa) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que un admin cree compas directo (nombre, apellido, correo, contraseña, rol), los liste, les cambie el rol y los revoque/reactive — sin emails de invitación.

**Architecture:** Backend en Supabase (repo `michis`): una migración (`0015`) con RPCs `admin_listar_compas` / `admin_cambiar_rol` y un `is_admin()` que exige `active`, más una Edge Function `admin-compas` que usa `service_role` para `createUser` / desactivar / reactivar. El rol se asigna server-side tras crear (canal autorizado de `0006`); el trigger `handle_new_user` no se toca. Frontend en `michis-alerta`: `compas-client.ts` + hook + UI reescritos para creación directa. Revocar = desactivar (soft, reversible) para no perder casework.

**Tech Stack:** PostgreSQL (Supabase) · Deno Edge Functions · TypeScript · Vitest (worker integración real + frontend unit) · React + TanStack Router (frontend).

**Repos y rutas absolutas:**
- Backend: `/home/otrakossa/Fcbosque/michis` (rama `backend-compas`)
- Frontend: `/home/otrakossa/Fcbosque/michis-alerta` (rama `main`)

**Spec:** `docs/superpowers/specs/2026-06-10-backend-compas-design.md`

**Antes de empezar:** cargar el entorno del repo `michis`:
```bash
cd /home/otrakossa/Fcbosque/michis && set -a; . ./.env; set +a
```

---

## Task 1: Test de integración de las RPCs de compas (falla primero)

**Files:**
- Create: `/home/otrakossa/Fcbosque/michis/worker/test/compas.test.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `worker/test/compas.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabase as svc } from "../src/supabase.js";

const URL = process.env.SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const ADM = "test-compas-adm@example.com";
const ADM2 = "test-compas-adm2@example.com";
const ACT = "test-compas-act@example.com";
const PASS = "TestCompas2026!";

let adm: SupabaseClient;
let act: SupabaseClient;
let admId: string;
let adm2Id: string;
let actId: string;

async function delUser(email: string) {
  const { data } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const u = data?.users?.find((x) => x.email === email);
  if (u) await svc.auth.admin.deleteUser(u.id);
}
async function mkUser(email: string, role: "admin" | "activista") {
  const r = await svc.auth.admin.createUser({ email, password: PASS, email_confirm: true });
  const id = r.data.user!.id;
  await svc.from("profiles").update({ role }).eq("id", id);
  return id;
}

beforeAll(async () => {
  for (const e of [ADM, ADM2, ACT]) await delUser(e);
  admId = await mkUser(ADM, "admin");
  adm2Id = await mkUser(ADM2, "admin");
  actId = await mkUser(ACT, "activista");
  adm = createClient(URL, ANON);
  await adm.auth.signInWithPassword({ email: ADM, password: PASS });
  act = createClient(URL, ANON);
  await act.auth.signInWithPassword({ email: ACT, password: PASS });
});

afterAll(async () => {
  for (const e of [ADM, ADM2, ACT]) await delUser(e);
});

describe("admin_listar_compas", () => {
  it("un activista no está autorizado", async () => {
    const { error } = await act.rpc("admin_listar_compas");
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/no autorizado/i);
  });
  it("un admin ve a los compas con su estado", async () => {
    const { data, error } = await adm.rpc("admin_listar_compas");
    expect(error).toBeNull();
    const fila = (data as Array<{ id: string; estado: string; rol: string }>).find(
      (c) => c.id === actId,
    );
    expect(fila?.estado).toBe("activa");
    expect(fila?.rol).toBe("activista");
  });
});

describe("admin_cambiar_rol", () => {
  it("rechaza un rol inválido", async () => {
    const { error } = await adm.rpc("admin_cambiar_rol", { p_user_id: actId, p_rol: "jefe" });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/rol inválido/i);
  });
  it("promueve y luego degrada a un compa", async () => {
    await adm.rpc("admin_cambiar_rol", { p_user_id: actId, p_rol: "admin" });
    let r = await svc.from("profiles").select("role").eq("id", actId).single();
    expect(r.data!.role).toBe("admin");
    await adm.rpc("admin_cambiar_rol", { p_user_id: actId, p_rol: "activista" });
    r = await svc.from("profiles").select("role").eq("id", actId).single();
    expect(r.data!.role).toBe("activista");
  });
});

describe("is_admin() respeta active", () => {
  it("un admin desactivado deja de ser admin", async () => {
    await svc.from("profiles").update({ active: false }).eq("id", admId);
    const { error } = await adm.rpc("admin_listar_compas");
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/no autorizado/i);
    await svc.from("profiles").update({ active: true }).eq("id", admId);
  });
});

describe("guardarraíl del último admin activo", () => {
  it("no deja degradar al último admin activo", async () => {
    await svc.from("profiles").update({ active: false }).eq("id", adm2Id);
    const { error } = await adm.rpc("admin_cambiar_rol", { p_user_id: admId, p_rol: "activista" });
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/al menos un admin/i);
    await svc.from("profiles").update({ active: true, role: "admin" }).eq("id", adm2Id);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

```bash
cd /home/otrakossa/Fcbosque/michis && set -a; . ./.env; set +a
pnpm --filter worker test compas
```
Expected: FAIL — las RPCs `admin_listar_compas` / `admin_cambiar_rol` no existen aún (error tipo `function ... does not exist` / `no autorizado` no aparece).

No commit todavía (el test va junto con la migración en Task 2).

---

## Task 2: Migración 0015 (RPCs + is_admin con active + invited_by)

**Files:**
- Create: `/home/otrakossa/Fcbosque/michis/supabase/migrations/0015_compas.sql`

- [ ] **Step 1: Escribir la migración**

Crear `supabase/migrations/0015_compas.sql`:

```sql
-- Gestión de compas (creación directa por admin, sin invitaciones por correo).
-- Ver docs/superpowers/specs/2026-06-10-backend-compas-design.md

-- Auditoría: qué admin creó al compa.
alter table public.profiles
  add column if not exists invited_by uuid references auth.users(id);

-- is_admin() ahora exige cuenta activa: un admin desactivado pierde poderes
-- en TODAS las políticas RLS que ya usan este helper.
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and active = true
  );
$$;

-- Lista de compas para el panel admin (perfiles + email de auth.users).
create or replace function public.admin_listar_compas()
returns table (
  id           uuid,
  email        text,
  handle       text,
  rol          text,
  estado       text,
  creado_en    timestamptz,
  invitado_por uuid
)
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'no autorizado';
  end if;
  return query
    select p.id,
           u.email::text,
           coalesce(p.display_name, split_part(u.email::text, '@', 1)),
           p.role::text,
           case when p.active then 'activa' else 'inactiva' end,
           p.created_at,
           p.invited_by
      from public.profiles p
      join auth.users u on u.id = p.id
     order by p.created_at desc;
end;
$$;

revoke execute on function public.admin_listar_compas() from public, anon;
grant execute on function public.admin_listar_compas() to authenticated;

-- Cambiar el rol de un compa, con guardarraíl del último admin activo.
create or replace function public.admin_cambiar_rol(p_user_id uuid, p_rol text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'no autorizado';
  end if;
  if p_rol not in ('admin', 'activista') then
    raise exception 'rol inválido';
  end if;
  if p_rol = 'activista'
     and exists (select 1 from public.profiles
                 where id = p_user_id and role = 'admin' and active = true)
     and (select count(*) from public.profiles
          where role = 'admin' and active = true) <= 1 then
    raise exception 'tiene que quedar al menos un admin';
  end if;
  update public.profiles set role = p_rol::public.user_role where id = p_user_id;
end;
$$;

revoke execute on function public.admin_cambiar_rol(uuid, text) from public, anon;
grant execute on function public.admin_cambiar_rol(uuid, text) to authenticated;
```

- [ ] **Step 2: Aplicar la migración a la BD gestionada**

```bash
cd /home/otrakossa/Fcbosque/michis && set -a; . ./.env; set +a
npx supabase db push --db-url "$DATABASE_URL"
```
Expected: aplica `0015_compas.sql` sin error.

- [ ] **Step 3: Correr el test de Task 1 y verificar que pasa**

```bash
pnpm --filter worker test compas
```
Expected: PASS (4 describe, todos verdes).

- [ ] **Step 4: Commit**

```bash
cd /home/otrakossa/Fcbosque/michis
git add supabase/migrations/0015_compas.sql worker/test/compas.test.ts
git commit -m "feat(db): RPCs de gestión de compas + is_admin respeta active

admin_listar_compas / admin_cambiar_rol (guardarraíl último admin activo),
profiles.invited_by, e is_admin() exige active=true. Tests de integración.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: Edge Function `admin-compas` (crear / revocar / reactivar)

**Files:**
- Create: `/home/otrakossa/Fcbosque/michis/supabase/functions/admin-compas/index.ts`
- Create: `/home/otrakossa/Fcbosque/michis/worker/smoke-compas.ts`

- [ ] **Step 1: Escribir la Edge Function**

Crear `supabase/functions/admin-compas/index.ts`:

```ts
// michis — Edge Function "admin-compas"
// Gestión de compas por admins: crear / revocar(desactivar) / reactivar.
// Ver docs/superpowers/specs/2026-06-10-backend-compas-design.md
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BAN_FOREVER = "876000h"; // ~100 años

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "método no permitido" }, 405);

  // 1. Verificar que el caller sea admin activo (cliente con su JWT).
  const authHeader = req.headers.get("Authorization") ?? "";
  const caller = createClient(SUPABASE_URL, ANON, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData } = await caller.auth.getUser();
  const callerId = userData?.user?.id;
  if (!callerId) return json({ error: "no autorizado" }, 401);

  // 2. Cliente admin con service_role.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  });
  const { data: prof } = await admin
    .from("profiles").select("role, active").eq("id", callerId).single();
  if (!prof || prof.role !== "admin" || prof.active !== true) {
    return json({ error: "no autorizado" }, 401);
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "json inválido" }, 400); }
  const accion = body.accion;

  try {
    if (accion === "crear") {
      const email = String(body.email ?? "").trim().toLowerCase();
      const display_name = String(body.display_name ?? "").trim();
      const password = String(body.password ?? "");
      const rol = String(body.rol ?? "");
      if (!EMAIL_RE.test(email)) return json({ error: "correo inválido" }, 400);
      if (rol !== "admin" && rol !== "activista") return json({ error: "rol inválido" }, 400);
      if (password.length < 8) return json({ error: "contraseña inválida" }, 400);
      if (!display_name) return json({ error: "nombre inválido" }, 400);

      const created = await admin.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { display_name },
      });
      if (created.error) {
        const msg = /already|registered|exists/i.test(created.error.message)
          ? "compa ya existe" : created.error.message;
        return json({ error: msg }, 400);
      }
      const newId = created.data.user!.id;
      // Asigna el rol elegido por canal autorizado (service_role).
      const upd = await admin.from("profiles")
        .update({ role: rol, invited_by: callerId, display_name }).eq("id", newId);
      if (upd.error) return json({ error: upd.error.message }, 500);
      return json({ ok: true, id: newId });
    }

    if (accion === "revocar") {
      const target = String(body.target_id ?? "");
      if (!target) return json({ error: "falta target_id" }, 400);
      // Guardarraíl: no desactivar al último admin activo.
      const { data: t } = await admin.from("profiles")
        .select("role, active").eq("id", target).single();
      if (t?.role === "admin" && t.active === true) {
        const { count } = await admin.from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("role", "admin").eq("active", true);
        if ((count ?? 0) <= 1) return json({ error: "tiene que quedar al menos un admin" }, 400);
      }
      const upd = await admin.from("profiles").update({ active: false }).eq("id", target);
      if (upd.error) return json({ error: upd.error.message }, 500);
      // Banear el login (reversible). El access token vigente expira por TTL;
      // el refresh ya falla al estar baneado.
      await admin.auth.admin.updateUserById(target, { ban_duration: BAN_FOREVER });
      return json({ ok: true });
    }

    if (accion === "reactivar") {
      const target = String(body.target_id ?? "");
      if (!target) return json({ error: "falta target_id" }, 400);
      const upd = await admin.from("profiles").update({ active: true }).eq("id", target);
      if (upd.error) return json({ error: upd.error.message }, 500);
      await admin.auth.admin.updateUserById(target, { ban_duration: "none" });
      return json({ ok: true });
    }

    return json({ error: "acción desconocida" }, 400);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
```

- [ ] **Step 2: Escribir el smoke script (la "prueba" de la función)**

Crear `worker/smoke-compas.ts`:

```ts
// Smoke E2E de la Edge Function admin-compas (requiere deploy).
// Correr: RUN_REAL_COMPAS_TEST=1 npx tsx worker/smoke-compas.ts
import { createClient } from "@supabase/supabase-js";
import { config } from "./src/config.js";

if (process.env.RUN_REAL_COMPAS_TEST !== "1") {
  console.log("Saltado (set RUN_REAL_COMPAS_TEST=1 para correr).");
  process.exit(0);
}
const URL = config.supabaseUrl;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const svc = createClient(URL, config.serviceRoleKey, { auth: { persistSession: false } });
const ADM = "smoke-compas-adm@example.com";
const NUEVO = "smoke-compas-nuevo@example.com";
const PASS = "SmokeCompas2026!";

async function delUser(email: string) {
  const { data } = await svc.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const u = data?.users?.find((x) => x.email === email);
  if (u) await svc.auth.admin.deleteUser(u.id);
}

const main = async () => {
  for (const e of [ADM, NUEVO]) await delUser(e);
  const a = await svc.auth.admin.createUser({ email: ADM, password: PASS, email_confirm: true });
  await svc.from("profiles").update({ role: "admin" }).eq("id", a.data.user!.id);
  const cli = createClient(URL, ANON);
  await cli.auth.signInWithPassword({ email: ADM, password: PASS });

  let r = await cli.functions.invoke("admin-compas", {
    body: { accion: "crear", display_name: "Compa Smoke", email: NUEVO, password: "TempPass1234!", rol: "activista" },
  });
  console.log("crear:", r.error ? await (r.error as { context: Response }).context.json() : r.data);

  const list = await cli.rpc("admin_listar_compas");
  const nuevo = (list.data as Array<{ id: string; email: string; estado: string }>).find((c) => c.email === NUEVO);
  console.log("listar → nuevo:", nuevo);

  r = await cli.functions.invoke("admin-compas", { body: { accion: "revocar", target_id: nuevo!.id } });
  console.log("revocar:", r.error ?? r.data);
  r = await cli.functions.invoke("admin-compas", { body: { accion: "reactivar", target_id: nuevo!.id } });
  console.log("reactivar:", r.error ?? r.data);

  for (const e of [ADM, NUEVO]) await delUser(e);
  console.log("✅ smoke OK");
};
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Desplegar la función**

```bash
cd /home/otrakossa/Fcbosque/michis && set -a; . ./.env; set +a
npx supabase functions deploy admin-compas
```
Expected: deploy OK (verify_jwt activado por defecto — los admins llaman con su JWT).

- [ ] **Step 4: Correr el smoke y verificar el flujo**

```bash
RUN_REAL_COMPAS_TEST=1 npx tsx worker/smoke-compas.ts
```
Expected: `crear: { ok: true, id: ... }`, la fila aparece en `listar`, `revocar`/`reactivar` sin error, y `✅ smoke OK`.

- [ ] **Step 5: Commit**

```bash
cd /home/otrakossa/Fcbosque/michis
git add supabase/functions/admin-compas/index.ts worker/smoke-compas.ts
git commit -m "feat: Edge Function admin-compas (crear/revocar/reactivar)

createUser + rol server-side; revocar = desactivar + ban (reversible).
Smoke E2E gated por RUN_REAL_COMPAS_TEST.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: Frontend — `compas-client.ts` reescrito + util de contraseña (TDD)

**Files:**
- Modify (rewrite): `/home/otrakossa/Fcbosque/michis-alerta/src/lib/admin/compas-client.ts`
- Create: `/home/otrakossa/Fcbosque/michis-alerta/src/lib/admin/compas-client.test.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `src/lib/admin/compas-client.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { rowToCompa, generarPassword } from "./compas-client";

describe("rowToCompa", () => {
  it("mapea estado inactiva y rol admin", () => {
    const c = rowToCompa({
      id: "1", email: "ana@b.org", handle: "Ana Pérez", rol: "admin",
      estado: "inactiva", creado_en: "2026-01-01T00:00:00Z", invitado_por: null,
    });
    expect(c.estado).toBe("inactiva");
    expect(c.rol).toBe("admin");
    expect(c.handle).toBe("Ana Pérez");
  });
  it("handle cae al usuario del email cuando es null, rol desconocido → activista", () => {
    const c = rowToCompa({
      id: "1", email: "compa@b.org", handle: null, rol: "x",
      estado: "activa", creado_en: "2026-01-01T00:00:00Z", invitado_por: null,
    });
    expect(c.handle).toBe("compa");
    expect(c.rol).toBe("activista");
  });
});

describe("generarPassword", () => {
  it("respeta el largo pedido", () => {
    expect(generarPassword(20)).toHaveLength(20);
    expect(generarPassword()).toHaveLength(16);
  });
  it("genera valores distintos", () => {
    expect(generarPassword()).not.toBe(generarPassword());
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

```bash
cd /home/otrakossa/Fcbosque/michis-alerta
pnpm vitest run src/lib/admin/compas-client.test.ts
```
Expected: FAIL — `rowToCompa`/`generarPassword` no exportados (firma vieja con `esInvitacion`).

- [ ] **Step 3: Reescribir el cliente**

Reemplazar TODO el contenido de `src/lib/admin/compas-client.ts`:

```ts
import { supabase } from "@/lib/supabase";
import { FunctionsHttpError } from "@supabase/supabase-js";

// Cliente del panel admin → gestión de "compas" (miembros del colectivo).
// Creación directa por admin (sin invitaciones por correo). Habla con las RPCs
// y la Edge Function definidas en
// docs/superpowers/specs/2026-06-10-backend-compas-design.md (repo michis).

export type CompaRol = "admin" | "activista";
export type CompaEstado = "activa" | "inactiva";

export interface Compa {
  id: string;
  email: string;
  handle: string;
  rol: CompaRol;
  estado: CompaEstado;
  creadoEn: number; // epoch ms
  invitadoPor?: string | null;
}

export interface CrearCompaInput {
  nombre: string;
  apellido: string;
  email: string;
  password: string;
  rol: CompaRol;
}

interface CompaRow {
  id: string;
  email: string;
  handle: string | null;
  rol: string;
  estado: string;
  creado_en: string;
  invitado_por: string | null;
}

export function rowToCompa(r: CompaRow): Compa {
  return {
    id: r.id,
    email: r.email,
    handle: r.handle ?? r.email.split("@")[0] ?? "compa",
    rol: r.rol === "admin" ? "admin" : "activista",
    estado: r.estado === "inactiva" ? "inactiva" : "activa",
    creadoEn: new Date(r.creado_en).getTime(),
    invitadoPor: r.invitado_por,
  };
}

// Contraseña inicial fuerte; el compa la cambia luego desde /perfil.
const ALFABETO =
  "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%*?";
export function generarPassword(largo = 16): string {
  const buf = new Uint32Array(largo);
  crypto.getRandomValues(buf);
  let out = "";
  for (let i = 0; i < largo; i++) out += ALFABETO[buf[i] % ALFABETO.length];
  return out;
}

// supabase.functions.invoke devuelve un error genérico en HTTP no-2xx; el
// mensaje real del backend viaja en el body. Lo extraemos.
async function mensajeError(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.json();
      if (body?.error) return String(body.error);
    } catch {
      /* sin body legible */
    }
  }
  return error instanceof Error ? error.message : "Error desconocido";
}

export async function listarCompas(): Promise<{ data: Compa[]; error: string | null }> {
  const { data, error } = await supabase.rpc("admin_listar_compas");
  if (error) return { data: [], error: error.message };
  return { data: ((data ?? []) as CompaRow[]).map(rowToCompa), error: null };
}

export async function crearCompa(input: CrearCompaInput): Promise<string | null> {
  const display_name = `${input.nombre} ${input.apellido}`.trim();
  const { error } = await supabase.functions.invoke("admin-compas", {
    body: {
      accion: "crear",
      display_name,
      email: input.email,
      password: input.password,
      rol: input.rol,
    },
  });
  return error ? await mensajeError(error) : null;
}

export async function cambiarRolCompa(userId: string, rol: CompaRol): Promise<string | null> {
  const { error } = await supabase.rpc("admin_cambiar_rol", { p_user_id: userId, p_rol: rol });
  return error ? error.message : null;
}

export async function revocarCompa(userId: string): Promise<string | null> {
  const { error } = await supabase.functions.invoke("admin-compas", {
    body: { accion: "revocar", target_id: userId },
  });
  return error ? await mensajeError(error) : null;
}

export async function reactivarCompa(userId: string): Promise<string | null> {
  const { error } = await supabase.functions.invoke("admin-compas", {
    body: { accion: "reactivar", target_id: userId },
  });
  return error ? await mensajeError(error) : null;
}
```

- [ ] **Step 4: Correr y verificar que pasa**

```bash
cd /home/otrakossa/Fcbosque/michis-alerta
pnpm vitest run src/lib/admin/compas-client.test.ts
```
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
cd /home/otrakossa/Fcbosque/michis-alerta
git add src/lib/admin/compas-client.ts src/lib/admin/compas-client.test.ts
git commit -m "feat(compas): cliente de creación directa + util generarPassword

Reemplaza el flujo de invitaciones: crear/listar/cambiarRol/revocar/reactivar.
Extrae el mensaje real del backend en errores de Edge Function.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Frontend — hook `use-compas.ts` reescrito

**Files:**
- Modify (rewrite): `/home/otrakossa/Fcbosque/michis-alerta/src/hooks/use-compas.ts`

- [ ] **Step 1: Reescribir el hook**

Reemplazar TODO el contenido de `src/hooks/use-compas.ts`:

```ts
import { useCallback, useEffect, useState } from "react";
import {
  listarCompas,
  crearCompa,
  cambiarRolCompa,
  revocarCompa,
  reactivarCompa,
  type Compa,
  type CompaRol,
  type CrearCompaInput,
} from "@/lib/admin/compas-client";

export function useCompas() {
  const [compas, setCompas] = useState<Compa[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    setCargando(true);
    const { data, error } = await listarCompas();
    setCompas(data);
    setError(error);
    setCargando(false);
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  const crear = useCallback(
    async (input: CrearCompaInput) => {
      const err = await crearCompa(input);
      if (!err) await recargar();
      return err;
    },
    [recargar],
  );

  const cambiarRol = useCallback(
    async (userId: string, rol: CompaRol) => {
      const err = await cambiarRolCompa(userId, rol);
      if (!err) await recargar();
      return err;
    },
    [recargar],
  );

  const revocar = useCallback(
    async (userId: string) => {
      const err = await revocarCompa(userId);
      if (!err) await recargar();
      return err;
    },
    [recargar],
  );

  const reactivar = useCallback(
    async (userId: string) => {
      const err = await reactivarCompa(userId);
      if (!err) await recargar();
      return err;
    },
    [recargar],
  );

  return { compas, cargando, error, recargar, crear, cambiarRol, revocar, reactivar };
}
```

- [ ] **Step 2: Verificar tipos (compila)**

```bash
cd /home/otrakossa/Fcbosque/michis-alerta
pnpm exec tsc --noEmit
```
Expected: fallará SOLO en `compa-row.tsx` y `_app.admin.compas.tsx` (aún usan la API vieja). El hook en sí no debe tener errores propios. Se arreglan en Task 6 y 7.

No commit todavía (va junto con Task 6 y 7, que dejan el frontend compilando).

---

## Task 6: Frontend — `compa-row.tsx` reescrito

**Files:**
- Modify (rewrite): `/home/otrakossa/Fcbosque/michis-alerta/src/components/michis/admin/compa-row.tsx`

- [ ] **Step 1: Reescribir la fila**

Reemplazar TODO el contenido de `src/components/michis/admin/compa-row.tsx`:

```tsx
import { useState } from "react";
import { toast } from "sonner";
import { MoreVertical, ShieldCheck, UserMinus, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { tiempoRelativo } from "@/lib/michis/store";
import type { Compa } from "@/lib/admin/compas-client";

function enmascarar(email: string) {
  const [user, dom] = email.split("@");
  if (!user || !dom) return email;
  return `${user.slice(0, 1)}${"•".repeat(Math.max(1, user.length - 1))}@${dom}`;
}

export function CompaRow({
  compa,
  esMiUsuario,
  onCambiarRol,
  onRevocar,
  onReactivar,
}: {
  compa: Compa;
  esMiUsuario: boolean;
  onCambiarRol: (id: string, rol: "admin" | "activista") => Promise<string | null>;
  onRevocar: (id: string) => Promise<string | null>;
  onReactivar: (id: string) => Promise<string | null>;
}) {
  const [confirmarRevocar, setConfirmarRevocar] = useState(false);
  const [trabajando, setTrabajando] = useState(false);

  const handleCambiarRol = async () => {
    setTrabajando(true);
    const nuevoRol = compa.rol === "admin" ? "activista" : "admin";
    const err = await onCambiarRol(compa.id, nuevoRol);
    setTrabajando(false);
    if (err) toast.error(err);
    else toast.success(`Rol cambiado a ${nuevoRol}`);
  };

  const handleReactivar = async () => {
    setTrabajando(true);
    const err = await onReactivar(compa.id);
    setTrabajando(false);
    if (err) toast.error(err);
    else toast.success("Compa reactivada");
  };

  const handleRevocar = async () => {
    setTrabajando(true);
    const err = await onRevocar(compa.id);
    setTrabajando(false);
    setConfirmarRevocar(false);
    if (err) toast.error(err);
    else toast.success("Acceso revocado");
  };

  const inactiva = compa.estado === "inactiva";

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3">
      <div
        className={
          "grid size-10 shrink-0 place-items-center rounded-full text-base font-extrabold " +
          (inactiva ? "bg-muted text-muted-foreground" : "bg-primary/15 text-primary")
        }
      >
        {compa.handle.slice(0, 1).toUpperCase()}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate font-mono text-sm font-bold">@{compa.handle}</span>
          {esMiUsuario && (
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              tú
            </span>
          )}
          <span
            className={
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider " +
              (compa.rol === "admin"
                ? "bg-primary/15 text-primary"
                : "bg-muted text-muted-foreground")
            }
          >
            {compa.rol === "admin" && <ShieldCheck className="size-3" />}
            {compa.rol}
          </span>
          <span
            className={
              "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider " +
              (inactiva ? "bg-muted text-muted-foreground" : "bg-success/15 text-success")
            }
          >
            {compa.estado}
          </span>
        </div>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
          {enmascarar(compa.email)} · {tiempoRelativo(compa.creadoEn)}
        </p>
      </div>

      {!esMiUsuario && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              disabled={trabajando}
              className="size-9 text-muted-foreground"
              aria-label="Acciones"
            >
              <MoreVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleCambiarRol}>
              <ShieldCheck className="size-4" />
              Hacer {compa.rol === "admin" ? "activista" : "admin"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {inactiva ? (
              <DropdownMenuItem onClick={handleReactivar}>
                <UserCheck className="size-4" />
                Reactivar compa
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                onClick={() => setConfirmarRevocar(true)}
                className="text-destructive focus:text-destructive"
              >
                <UserMinus className="size-4" />
                Revocar acceso
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <AlertDialog open={confirmarRevocar} onOpenChange={setConfirmarRevocar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Revocar acceso a @{compa.handle}?</AlertDialogTitle>
            <AlertDialogDescription>
              El compa perderá acceso de inmediato, pero sus casos y expedientes se
              conservan. Podés reactivarlo cuando quieras.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={trabajando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleRevocar}
              disabled={trabajando}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Sí, revocar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
```

(No commit aún — junto con Task 7.)

---

## Task 7: Frontend — pantalla `_app.admin.compas.tsx` (crear + lista)

**Files:**
- Modify (rewrite): `/home/otrakossa/Fcbosque/michis-alerta/src/routes/_app.admin.compas.tsx`

- [ ] **Step 1: Reescribir la pantalla**

Reemplazar TODO el contenido de `src/routes/_app.admin.compas.tsx`:

```tsx
import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { ArrowLeft, UserPlus, Users, RefreshCw, Eye, EyeOff, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { EmptyState } from "@/components/michis/ui";
import { CompaRow } from "@/components/michis/admin/compa-row";
import { useCompas } from "@/hooks/use-compas";
import { useMichis } from "@/lib/michis/store";
import { generarPassword, type CompaRol } from "@/lib/admin/compas-client";

export const Route = createFileRoute("/_app/admin/compas")({
  head: () => ({ meta: [{ title: "michis · compas del colectivo" }] }),
  component: CompasPage,
});

const crearSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio").max(40, "Máximo 40 caracteres"),
  apellido: z.string().trim().min(1, "El apellido es obligatorio").max(40, "Máximo 40 caracteres"),
  email: z.string().trim().toLowerCase().email("Correo inválido").max(255, "Máximo 255 caracteres"),
  password: z.string().min(8, "Mínimo 8 caracteres").max(72, "Máximo 72 caracteres"),
  rol: z.enum(["admin", "activista"]),
});

function CompasPage() {
  const usuario = useMichis((s) => s.usuario);
  const { compas, cargando, crear, cambiarRol, revocar, reactivar } = useCompas();
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(() => generarPassword());
  const [verPass, setVerPass] = useState(true);
  const [rol, setRol] = useState<CompaRol>("activista");
  const [enviando, setEnviando] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [filtroRol, setFiltroRol] = useState<"todos" | CompaRol>("todos");
  const [filtroEstado, setFiltroEstado] = useState<"todos" | "activa" | "inactiva">("todos");

  if (usuario && usuario.rol !== "admin") return <Navigate to="/casos" />;

  const totalActivas = compas.filter((c) => c.estado === "activa").length;
  const totalInactivas = compas.filter((c) => c.estado === "inactiva").length;

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return compas.filter((c) => {
      if (filtroRol !== "todos" && c.rol !== filtroRol) return false;
      if (filtroEstado !== "todos" && c.estado !== filtroEstado) return false;
      if (!q) return true;
      return c.handle.toLowerCase().includes(q) || c.email.toLowerCase().includes(q);
    });
  }, [compas, busqueda, filtroRol, filtroEstado]);

  const copiarPass = async () => {
    try {
      await navigator.clipboard.writeText(password);
      toast.success("Contraseña copiada");
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  const onCrear = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = crearSchema.safeParse({ nombre, apellido, email, password, rol });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }
    setEnviando(true);
    const err = await crear(parsed.data);
    setEnviando(false);
    if (err) {
      toast.error(err);
      return;
    }
    toast.success(`Compa ${parsed.data.nombre} creada. Pasale la contraseña.`);
    setNombre("");
    setApellido("");
    setEmail("");
    setPassword(generarPassword());
    setRol("activista");
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Link
              to="/admin"
              className="inline-flex size-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground"
              aria-label="Volver al panel"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <h1 className="flex items-center gap-2 text-xl font-black tracking-tight sm:text-2xl">
              <Users className="size-6 text-primary" /> Compas del colectivo
            </h1>
          </div>
          <p className="mt-1 text-[13px] text-muted-foreground sm:text-sm">
            {totalActivas} {totalActivas === 1 ? "compa activa" : "compas activas"}
            {totalInactivas > 0 && ` · ${totalInactivas} inactiva${totalInactivas === 1 ? "" : "s"}`}
          </p>
        </div>
      </div>

      {/* Formulario crear compa */}
      <form onSubmit={onCrear} className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <h2 className="flex items-center gap-2 text-sm font-extrabold">
          <UserPlus className="size-4 text-primary" /> Crear un compa
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="nombre" className="text-xs uppercase tracking-wider text-muted-foreground">
              nombre
            </Label>
            <Input id="nombre" maxLength={40} required value={nombre}
              onChange={(e) => setNombre(e.target.value)} placeholder="Camila"
              className="h-11 bg-background" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="apellido" className="text-xs uppercase tracking-wider text-muted-foreground">
              apellido
            </Label>
            <Input id="apellido" maxLength={40} required value={apellido}
              onChange={(e) => setApellido(e.target.value)} placeholder="Rojas"
              className="h-11 bg-background" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="email" className="text-xs uppercase tracking-wider text-muted-foreground">
              correo
            </Label>
            <Input id="email" type="email" inputMode="email" autoComplete="off"
              autoCapitalize="none" required value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="compa@colectivo.org"
              className="h-11 bg-background" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="password" className="text-xs uppercase tracking-wider text-muted-foreground">
              contraseña inicial
            </Label>
            <div className="flex gap-2">
              <Input id="password" type={verPass ? "text" : "password"} required
                value={password} onChange={(e) => setPassword(e.target.value)}
                className="h-11 flex-1 bg-background font-mono" />
              <Button type="button" variant="outline" size="icon"
                onClick={() => setVerPass((v) => !v)} className="h-11 w-11 shrink-0 bg-background"
                aria-label={verPass ? "Ocultar" : "Mostrar"}>
                {verPass ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
              <Button type="button" variant="outline" size="icon" onClick={copiarPass}
                className="h-11 w-11 shrink-0 bg-background" aria-label="Copiar">
                <Copy className="size-4" />
              </Button>
              <Button type="button" variant="outline" size="icon"
                onClick={() => setPassword(generarPassword())}
                className="h-11 w-11 shrink-0 bg-background" aria-label="Generar otra">
                <RefreshCw className="size-4" />
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              El compa la cambia luego desde su perfil. Pasásela por un canal seguro.
            </p>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">rol</Label>
            <Select value={rol} onValueChange={(v) => setRol(v as CompaRol)}>
              <SelectTrigger className="h-11 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="activista">activista — investiga y arma expedientes</SelectItem>
                <SelectItem value="admin">admin — revisa, aprueba y gestiona compas</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button type="submit" disabled={enviando}
          className="h-11 w-full bg-primary font-extrabold text-primary-foreground sm:w-auto">
          {enviando ? "Creando…" : "Crear compa"}
        </Button>
      </form>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Busca por alias o correo" className="h-10 max-w-xs bg-card" />
        <Select value={filtroRol} onValueChange={(v) => setFiltroRol(v as typeof filtroRol)}>
          <SelectTrigger className="h-10 w-[140px] bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los roles</SelectItem>
            <SelectItem value="admin">admin</SelectItem>
            <SelectItem value="activista">activista</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filtroEstado} onValueChange={(v) => setFiltroEstado(v as typeof filtroEstado)}>
          <SelectTrigger className="h-10 w-[160px] bg-card">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los estados</SelectItem>
            <SelectItem value="activa">activas</SelectItem>
            <SelectItem value="inactiva">inactivas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Lista */}
      <section className="space-y-2.5">
        {cargando ? (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 rounded-2xl shimmer" />
            ))}
          </div>
        ) : visibles.length === 0 ? (
          <EmptyState emoji="🐾" titulo="Sin compas que mostrar"
            texto="Cambia los filtros o crea a alguien para empezar." />
        ) : (
          visibles.map((c) => (
            <CompaRow
              key={c.id}
              compa={c}
              esMiUsuario={usuario?.id === c.id}
              onCambiarRol={cambiarRol}
              onRevocar={revocar}
              onReactivar={reactivar}
            />
          ))
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 2: Verificar tipos y build**

```bash
cd /home/otrakossa/Fcbosque/michis-alerta
pnpm exec tsc --noEmit && pnpm build
```
Expected: sin errores de tipos; build OK.

- [ ] **Step 3: Correr el conjunto de tests del frontend**

```bash
pnpm vitest run
```
Expected: PASS (los 17 de adapters + los 4 nuevos de compas-client).

- [ ] **Step 4: Commit**

```bash
cd /home/otrakossa/Fcbosque/michis-alerta
git add src/hooks/use-compas.ts src/components/michis/admin/compa-row.tsx src/routes/_app.admin.compas.tsx
git commit -m "feat(compas): UI de creación directa (form + lista + reactivar)

Formulario nombre/apellido/correo/contraseña(generada)/rol; fila con
cambiar rol y revocar/reactivar. Reemplaza el flujo de invitaciones.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Push de ambos repos

> **Checkpoint con el usuario antes de pushear `michis-alerta` a `main`:** esa rama
> es la que Lovable refleja y donde Lovable también escribe. Confirmar que no haya
> trabajo sin sincronizar en Lovable para evitar conflictos.

- [ ] **Step 1: Push del backend (`michis`)**

```bash
cd /home/otrakossa/Fcbosque/michis
git push -u origin backend-compas
```

- [ ] **Step 2: Sincronizar y pushear el frontend (`michis-alerta`)**

```bash
cd /home/otrakossa/Fcbosque/michis-alerta
git pull --ff-only origin main   # traer cualquier cambio reciente de Lovable
git push origin main
```
Expected: push OK. En segundos Lovable refleja la nueva pantalla de compas.

- [ ] **Step 3: Verificación E2E manual (con el usuario)**

1. Entrar a la PWA como admin → `/admin/compas`.
2. Crear un compa (copiar la contraseña generada).
3. Cerrar sesión, entrar con el nuevo compa + esa contraseña → debe entrar.
4. Cambiarla en `/perfil`.
5. Como admin: revocar al compa → ya no puede entrar; reactivarlo → vuelve a entrar.
6. Verificar que degradar al último admin activo falla con el mensaje correcto.

---

## Notas de despliegue / convenciones

- BD: `npx supabase db push --db-url "$DATABASE_URL"` con el **session pooler (5432)**. Cargar `.env` raíz con `set -a; . ./.env; set +a` antes.
- Edge Function: `npx supabase functions deploy admin-compas` (requiere `SUPABASE_ACCESS_TOKEN` en `.env`). `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` los inyecta la plataforma.
- Tests del worker: `pnpm --filter worker test` (integración real, `fileParallelism: false`). Nunca borrar/reclamar jobs reales; este test no toca jobs.
- Frontend: `pnpm` en `/home/otrakossa/Fcbosque/michis-alerta` (también hay `bun`; usar uno consistente).
- Plantilla de email y SMTP: fuera de alcance (sin emails en este flujo).
```
