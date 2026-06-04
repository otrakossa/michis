# michis — Fase 0: Cimientos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Levantar el esqueleto del proyecto michis: monorepo + esquema de datos con RLS + auth solo-por-invitación con 2 roles + cascarón PWA con login + worker que consume la cola `jobs`.

**Architecture:** Monorepo pnpm con tres paquetes — `web` (Next.js PWA), `worker` (servicio Node/TS que sondea la tabla `jobs`), y `supabase` (migraciones SQL + pruebas pgTAP). Supabase gestionado es la fuente de verdad; el frontend habla con Supabase vía RLS; el worker usa la service key. Esta fase NO incluye el agente de IA todavía — solo el "latido" del worker procesando trabajos de prueba.

**Tech Stack:** TypeScript, pnpm workspaces, Next.js 15 (App Router) + React + Tailwind + `@ducanh2912/next-pwa`, Supabase (Postgres + Auth + RLS), pgTAP para tests de BD, Vitest para tests de TS, Docker para el worker.

---

## File Structure

```
michis/
  package.json                      # raíz del workspace pnpm
  pnpm-workspace.yaml
  .gitignore
  .env.example                      # plantilla de variables (sin secretos)
  supabase/
    config.toml                     # config local de Supabase
    migrations/
      0001_enums_and_profiles.sql   # enums base + profiles + trigger de alta
      0002_core_schema.sql          # cases, runs, steps, evidence, dossiers, denuncias, links, tags
      0003_jobs_queue.sql           # tabla jobs + función claim_job()
      0004_rls_policies.sql         # RLS para todas las tablas
    tests/
      0001_profiles_test.sql        # pgTAP: rol por defecto, trigger
      0002_rls_cases_test.sql       # pgTAP: aislamiento de casos por RLS
      0003_jobs_claim_test.sql      # pgTAP: claim_job atómico
  worker/
    package.json
    tsconfig.json
    vitest.config.ts
    Dockerfile
    src/
      config.ts                     # carga/valida env
      supabase.ts                   # cliente Supabase con service key
      jobs.ts                       # claimNextJob / completeJob / failJob
      handlers.ts                   # registro de handlers por tipo de job
      loop.ts                       # bucle de sondeo (heartbeat)
      index.ts                      # entrypoint
    test/
      jobs.test.ts
      handlers.test.ts
  web/
    package.json
    tsconfig.json
    next.config.mjs                 # config Next + PWA
    tailwind.config.ts
    middleware.ts                   # refresco de sesión Supabase
    public/
      manifest.webmanifest
    src/
      lib/
        supabase/client.ts          # cliente browser (anon key)
        supabase/server.ts          # cliente server (cookies)
      app/
        layout.tsx
        globals.css
        login/page.tsx
        (app)/layout.tsx            # layout protegido + nav por rol
        (app)/page.tsx              # dashboard placeholder
      components/
        RoleGate.tsx                # muestra/oculta según rol
      test/
        roleGate.test.tsx
```

**Decisiones de estructura:**
- Un archivo por responsabilidad clara. El worker separa `jobs` (acceso a la cola), `handlers` (qué hacer por tipo), y `loop` (orquestación) — así en Fase 1 el handler del agente se añade sin tocar el bucle.
- Migraciones numeradas y pequeñas; los tests pgTAP viven junto a las migraciones.
- En `web`, la lógica de Supabase se aísla en `lib/supabase/` para no esparcir claves ni clientes.

---

## Convenciones de testing

- **BD:** pgTAP vía `supabase test db`. Cada test declara `plan(N)` y usa `is()`, `throws_ok()`, `results_eq()`.
- **TS (worker/web):** Vitest. Tests unitarios puros; la lógica que toca Supabase se prueba contra una instancia local de Supabase (`supabase start`).
- **Commits frecuentes:** uno por tarea como mínimo, en la rama de trabajo.

---

## Task 0: Rama de trabajo

- [ ] **Step 1: Crear rama**

```bash
git checkout -b fase-0-cimientos
```

- [ ] **Step 2: Verificar**

Run: `git branch --show-current`
Expected: `fase-0-cimientos`

---

## Task 1: Scaffolding del monorepo

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `.gitignore`, `.env.example`

- [ ] **Step 1: Crear `pnpm-workspace.yaml`**

```yaml
packages:
  - "web"
  - "worker"
```

- [ ] **Step 2: Crear `package.json` raíz**

```json
{
  "name": "michis",
  "private": true,
  "version": "0.0.0",
  "scripts": {
    "db:start": "supabase start",
    "db:reset": "supabase db reset",
    "db:test": "supabase test db",
    "worker:dev": "pnpm --filter worker dev",
    "web:dev": "pnpm --filter web dev",
    "test": "pnpm -r test"
  }
}
```

- [ ] **Step 3: Crear `.gitignore`**

```gitignore
node_modules/
.next/
dist/
.env
.env.local
*.log
supabase/.branches/
supabase/.temp/
```

- [ ] **Step 4: Crear `.env.example`**

```bash
# Supabase (de `supabase start` o del panel del proyecto)
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=replace-me
SUPABASE_SERVICE_ROLE_KEY=replace-me

# Worker
WORKER_POLL_INTERVAL_MS=2000

# Frontend (Next.js necesita el prefijo NEXT_PUBLIC_ para el browser)
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=replace-me
```

- [ ] **Step 5: Verificar pnpm reconoce el workspace**

Run: `pnpm install`
Expected: instala sin error (aún sin paquetes hijos; crea `pnpm-lock.yaml`)

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-workspace.yaml .gitignore .env.example pnpm-lock.yaml
git commit -m "chore: scaffolding del monorepo pnpm"
```

---

## Task 2: Inicializar Supabase local

**Files:**
- Create: `supabase/config.toml` (generado por la CLI)

- [ ] **Step 1: Inicializar Supabase**

Run: `supabase init`
Expected: crea `supabase/config.toml` y la carpeta `supabase/`.

- [ ] **Step 2: Arrancar Supabase local**

Run: `supabase start`
Expected: imprime `API URL`, `anon key`, `service_role key`. Copiar esos valores a un `.env` local (no commitear).

- [ ] **Step 3: Verificar que corre**

Run: `supabase status`
Expected: servicios `RUNNING` (Postgres, Auth, Storage, Studio).

- [ ] **Step 4: Commit**

```bash
git add supabase/config.toml
git commit -m "chore: inicializar Supabase local"
```

---

## Task 3: Migración — enums y profiles

**Files:**
- Create: `supabase/migrations/0001_enums_and_profiles.sql`
- Test: `supabase/tests/0001_profiles_test.sql`

- [ ] **Step 1: Escribir el test pgTAP (falla primero)**

`supabase/tests/0001_profiles_test.sql`:

```sql
begin;
select plan(3);

-- La tabla profiles existe
select has_table('public', 'profiles', 'profiles existe');

-- El tipo user_role existe con los dos valores de Fase 1
select has_enum('user_role', 'enum user_role existe');
select enum_has_labels(
  'user_role',
  array['activista', 'admin'],
  'user_role tiene activista y admin'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Correr el test para verque falla**

Run: `supabase test db`
Expected: FAIL — `relation "profiles" does not exist` / enum ausente.

- [ ] **Step 3: Escribir la migración**

`supabase/migrations/0001_enums_and_profiles.sql`:

```sql
-- Roles del sistema (Fase 1: dos)
create type public.user_role as enum ('activista', 'admin');

-- Perfil ligado a auth.users
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  role         public.user_role not null default 'activista',
  display_name text,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- Al crear un usuario en auth, crear su profile automáticamente.
-- El rol y display_name se toman de raw_user_meta_data si el admin los puso
-- en la invitación; por defecto 'activista'.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, role, display_name)
  values (
    new.id,
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'activista'),
    new.raw_user_meta_data ->> 'display_name'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `supabase db reset && supabase test db`
Expected: PASS — `0001_profiles_test.sql .. ok`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0001_enums_and_profiles.sql supabase/tests/0001_profiles_test.sql
git commit -m "feat(db): enums de rol y tabla profiles con trigger de alta"
```

---

## Task 4: Migración — esquema central

**Files:**
- Create: `supabase/migrations/0002_core_schema.sql`

Esta tarea crea todas las tablas de negocio. No lleva test propio de existencia (lo cubren los tests de RLS y de jobs que vienen después); el criterio de éxito es que `supabase db reset` aplique sin error.

- [ ] **Step 1: Escribir la migración**

`supabase/migrations/0002_core_schema.sql`:

```sql
-- Enums de estado
create type public.platform        as enum ('twitter', 'tiktok');
create type public.case_status     as enum ('nuevo', 'investigando', 'needs_review', 'confirmado', 'descartado');
create type public.run_status       as enum ('queued', 'running', 'needs_review', 'done', 'failed');
create type public.dossier_status   as enum ('draft', 'approved');
create type public.campaign_status  as enum ('draft', 'active', 'closed');
create type public.evidence_source  as enum ('tool', 'manual');
create type public.link_relation    as enum ('mismo_texto', 'amplificacion_coordinada', 'mismo_avatar');
create type public.discovered_by    as enum ('agente', 'manual');

-- Caso: la unidad central (una cuenta-objetivo)
create table public.cases (
  id               uuid primary key default gen_random_uuid(),
  platform         public.platform not null,
  handle           text not null,
  external_id      text,
  status           public.case_status not null default 'nuevo',
  risk_score       int check (risk_score between 0 and 100),
  confidence       numeric(3,2) check (confidence between 0 and 1),
  shared           boolean not null default true,   -- visible para el grupo
  account_snapshot jsonb,
  created_by       uuid not null references public.profiles(id),
  assigned_to      uuid references public.profiles(id),
  created_at       timestamptz not null default now()
);

-- Tags y relación N:M con casos
create table public.tags (
  id    uuid primary key default gen_random_uuid(),
  name  text not null unique,
  color text
);
create table public.case_tags (
  case_id uuid not null references public.cases(id) on delete cascade,
  tag_id  uuid not null references public.tags(id) on delete cascade,
  primary key (case_id, tag_id)
);

-- Corrida de investigación (ejecución del agente)
create table public.investigation_runs (
  id          uuid primary key default gen_random_uuid(),
  case_id     uuid not null references public.cases(id) on delete cascade,
  status      public.run_status not null default 'queued',
  iterations  int not null default 0,
  tokens_used int not null default 0,
  cost        numeric(10,4) not null default 0,
  verdict     jsonb,
  started_at  timestamptz,
  finished_at timestamptz,
  created_at  timestamptz not null default now()
);

-- Auditoría: un paso del agente por fila
create table public.agent_steps (
  id         uuid primary key default gen_random_uuid(),
  run_id     uuid not null references public.investigation_runs(id) on delete cascade,
  step_no    int not null,
  tool_name  text,
  input      jsonb,
  output     jsonb,
  reasoning  text,
  created_at timestamptz not null default now()
);

-- Evidencia (de tools o subida por el activista)
create table public.evidence_items (
  id           uuid primary key default gen_random_uuid(),
  case_id      uuid not null references public.cases(id) on delete cascade,
  run_id       uuid references public.investigation_runs(id) on delete set null,
  type         text not null,
  source       public.evidence_source not null,
  payload      jsonb,
  storage_path text,
  captured_at  timestamptz not null default now()
);

-- Expediente
create table public.dossiers (
  id           uuid primary key default gen_random_uuid(),
  case_id      uuid not null references public.cases(id) on delete cascade,
  content      jsonb,
  status       public.dossier_status not null default 'draft',
  version      int not null default 1,
  generated_by uuid references public.profiles(id),
  approved_by  uuid references public.profiles(id),
  created_at   timestamptz not null default now()
);

-- Campaña de denuncia coordinada
create table public.denuncia_campaigns (
  id           uuid primary key default gen_random_uuid(),
  case_id      uuid not null references public.cases(id) on delete cascade,
  status       public.campaign_status not null default 'draft',
  report_links jsonb,
  instructions text,
  started_by   uuid references public.profiles(id),
  created_at   timestamptz not null default now()
);

-- Acción individual de denuncia (conteo)
create table public.denuncia_actions (
  id          uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.denuncia_campaigns(id) on delete cascade,
  user_id     uuid not null references public.profiles(id),
  reported_at timestamptz not null default now(),
  proof_path  text,
  unique (campaign_id, user_id)
);

-- Aristas del grafo de la granja
create table public.case_links (
  id            uuid primary key default gen_random_uuid(),
  source_case   uuid not null references public.cases(id) on delete cascade,
  target_case   uuid not null references public.cases(id) on delete cascade,
  relation_type public.link_relation not null,
  weight        numeric(3,2),
  discovered_by public.discovered_by not null,
  created_at    timestamptz not null default now(),
  check (source_case <> target_case)
);

-- Índices útiles
create index on public.cases (created_by);
create index on public.cases (status);
create index on public.investigation_runs (case_id);
create index on public.agent_steps (run_id);
create index on public.evidence_items (case_id);
create index on public.denuncia_actions (campaign_id);
```

- [ ] **Step 2: Verificar que aplica**

Run: `supabase db reset`
Expected: aplica `0001` y `0002` sin error.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0002_core_schema.sql
git commit -m "feat(db): esquema central (casos, runs, evidencia, expedientes, denuncias, grafo)"
```

---

## Task 5: Migración — cola de trabajos + claim atómico

**Files:**
- Create: `supabase/migrations/0003_jobs_queue.sql`
- Test: `supabase/tests/0003_jobs_claim_test.sql`

El corazón del worker: `claim_job()` debe entregar **un** trabajo y marcarlo
`running` de forma atómica, para que dos workers nunca tomen el mismo (usa
`for update skip locked`).

- [ ] **Step 1: Escribir el test pgTAP (falla primero)**

`supabase/tests/0003_jobs_claim_test.sql`:

```sql
begin;
select plan(4);

select has_table('public', 'jobs', 'jobs existe');
select has_function('public', 'claim_job', 'claim_job existe');

-- Sembrar dos jobs pendientes
insert into public.jobs (type, payload) values ('test', '{}'::jsonb), ('test', '{}'::jsonb);

-- Primer claim devuelve un job y lo deja 'running'
select isnt(
  (select id from public.claim_job()),
  null,
  'claim_job devuelve un job cuando hay pendientes'
);

-- Tras reclamar ambos, no quedan pendientes que reclamar
select claim_job();
select is(
  (select count(*)::int from public.jobs where status = 'pending'),
  0,
  'no quedan jobs pending tras dos claims'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `supabase test db`
Expected: FAIL — `relation "jobs" does not exist`.

- [ ] **Step 3: Escribir la migración**

`supabase/migrations/0003_jobs_queue.sql`:

```sql
create type public.job_status as enum ('pending', 'running', 'done', 'failed');

create table public.jobs (
  id         uuid primary key default gen_random_uuid(),
  type       text not null,
  payload    jsonb not null default '{}'::jsonb,
  status     public.job_status not null default 'pending',
  attempts   int not null default 0,
  last_error text,
  locked_at  timestamptz,
  run_after  timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index on public.jobs (status, run_after);

-- Reclama el siguiente job pendiente de forma atómica.
-- `for update skip locked` evita que dos workers tomen el mismo.
create function public.claim_job()
returns public.jobs
language plpgsql
security definer set search_path = ''
as $$
declare
  claimed public.jobs;
begin
  select * into claimed
  from public.jobs
  where status = 'pending' and run_after <= now()
  order by created_at
  for update skip locked
  limit 1;

  if not found then
    return null;
  end if;

  update public.jobs
  set status = 'running', attempts = attempts + 1, locked_at = now()
  where id = claimed.id
  returning * into claimed;

  return claimed;
end;
$$;
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `supabase db reset && supabase test db`
Expected: PASS — `0003_jobs_claim_test.sql .. ok`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0003_jobs_queue.sql supabase/tests/0003_jobs_claim_test.sql
git commit -m "feat(db): cola de trabajos con claim_job atómico (skip locked)"
```

---

## Task 6: Migración — políticas RLS

**Files:**
- Create: `supabase/migrations/0004_rls_policies.sql`
- Test: `supabase/tests/0002_rls_cases_test.sql`

Helper `is_admin()` + RLS. Regla central: un activista ve sus casos y los
`shared`; solo admin aprueba expedientes y activa campañas.

- [ ] **Step 1: Escribir el test pgTAP (falla primero)**

`supabase/tests/0002_rls_cases_test.sql`:

```sql
begin;
select plan(3);

-- RLS activado en cases
select is(
  (select relrowsecurity from pg_class where oid = 'public.cases'::regclass),
  true,
  'RLS activado en cases'
);

-- Existe la función helper is_admin
select has_function('public', 'is_admin', 'is_admin existe');

-- Existe una política de SELECT sobre cases
select isnt(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'cases' and cmd = 'SELECT'),
  0,
  'cases tiene política de SELECT'
);

select * from finish();
rollback;
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `supabase test db`
Expected: FAIL — RLS apagado / `is_admin` ausente / sin políticas.

- [ ] **Step 3: Escribir la migración**

`supabase/migrations/0004_rls_policies.sql`:

```sql
-- Helper: ¿el usuario actual es admin?
create function public.is_admin()
returns boolean
language sql
stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Activar RLS en todas las tablas de negocio
alter table public.profiles            enable row level security;
alter table public.cases               enable row level security;
alter table public.tags                enable row level security;
alter table public.case_tags           enable row level security;
alter table public.investigation_runs  enable row level security;
alter table public.agent_steps         enable row level security;
alter table public.evidence_items      enable row level security;
alter table public.dossiers            enable row level security;
alter table public.denuncia_campaigns  enable row level security;
alter table public.denuncia_actions    enable row level security;
alter table public.case_links          enable row level security;

-- PROFILES: cada quien ve su perfil; admin ve todos. Solo admin cambia roles.
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_admin());
create policy profiles_update_self on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));
create policy profiles_admin_all on public.profiles for all
  using (public.is_admin()) with check (public.is_admin());

-- CASES: ver propios o compartidos (o admin). Crear como uno mismo.
-- Editar propios o admin. Borrar solo admin.
create policy cases_select on public.cases for select
  using (created_by = auth.uid() or shared = true or public.is_admin());
create policy cases_insert on public.cases for insert
  with check (created_by = auth.uid());
create policy cases_update on public.cases for update
  using (created_by = auth.uid() or public.is_admin());
create policy cases_delete on public.cases for delete
  using (public.is_admin());

-- Helper de visibilidad de un caso para el usuario actual
create function public.can_see_case(c uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.cases
    where id = c and (created_by = auth.uid() or shared = true or public.is_admin())
  );
$$;

-- RUNS / STEPS / EVIDENCE: visibles si el caso es visible. Escritura: worker
-- (service role saltea RLS) y admin. El activista no escribe runs a mano.
create policy runs_select on public.investigation_runs for select
  using (public.can_see_case(case_id));
create policy steps_select on public.agent_steps for select
  using (exists (select 1 from public.investigation_runs r
                 where r.id = run_id and public.can_see_case(r.case_id)));
create policy evidence_select on public.evidence_items for select
  using (public.can_see_case(case_id));
create policy evidence_insert on public.evidence_items for insert
  with check (public.can_see_case(case_id));

-- DOSSIERS: ver si el caso es visible. Solo admin aprueba (status=approved).
create policy dossiers_select on public.dossiers for select
  using (public.can_see_case(case_id));
create policy dossiers_update_admin on public.dossiers for update
  using (public.is_admin()) with check (public.is_admin());

-- CAMPAÑAS: ver si caso visible. Crear/activar solo admin.
create policy campaigns_select on public.denuncia_campaigns for select
  using (public.can_see_case(case_id));
create policy campaigns_admin_write on public.denuncia_campaigns for all
  using (public.is_admin()) with check (public.is_admin());

-- ACCIONES DE DENUNCIA: cada quien crea/ve la suya; admin ve todas.
create policy actions_select on public.denuncia_actions for select
  using (user_id = auth.uid() or public.is_admin());
create policy actions_insert on public.denuncia_actions for insert
  with check (user_id = auth.uid());

-- TAGS / CASE_TAGS / CASE_LINKS: lectura a usuarios autenticados; escritura por
-- dueños del caso o admin.
create policy tags_select on public.tags for select using (auth.uid() is not null);
create policy case_tags_select on public.case_tags for select
  using (public.can_see_case(case_id));
create policy case_links_select on public.case_links for select
  using (public.can_see_case(source_case));
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `supabase db reset && supabase test db`
Expected: PASS — los tres archivos de test `.. ok`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0004_rls_policies.sql supabase/tests/0002_rls_cases_test.sql
git commit -m "feat(db): políticas RLS con helper is_admin y can_see_case"
```

---

## Task 7: Worker — config y cliente Supabase

**Files:**
- Create: `worker/package.json`, `worker/tsconfig.json`, `worker/vitest.config.ts`, `worker/src/config.ts`, `worker/src/supabase.ts`

- [ ] **Step 1: Crear `worker/package.json`**

```json
{
  "name": "worker",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run"
  },
  "dependencies": {
    "@supabase/supabase-js": "^2.45.0"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Crear `worker/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Crear `worker/vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node" },
});
```

- [ ] **Step 4: Instalar dependencias**

Run: `pnpm install`
Expected: instala las deps del worker en el workspace.

- [ ] **Step 5: Crear `worker/src/config.ts`**

```typescript
function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

export const config = {
  supabaseUrl: required("SUPABASE_URL"),
  serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
  pollIntervalMs: Number(process.env.WORKER_POLL_INTERVAL_MS ?? "2000"),
};
```

- [ ] **Step 6: Crear `worker/src/supabase.ts`**

```typescript
import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";

// Cliente con service role: saltea RLS. SOLO se usa en el worker (servidor).
export const supabase = createClient(config.supabaseUrl, config.serviceRoleKey, {
  auth: { persistSession: false },
});
```

- [ ] **Step 7: Verificar que compila**

Run: `pnpm --filter worker build`
Expected: compila sin errores de tipo.

- [ ] **Step 8: Commit**

```bash
git add worker/package.json worker/tsconfig.json worker/vitest.config.ts worker/src/config.ts worker/src/supabase.ts pnpm-lock.yaml
git commit -m "feat(worker): config validada y cliente Supabase con service role"
```

---

## Task 8: Worker — acceso a la cola de jobs (TDD)

**Files:**
- Create: `worker/src/jobs.ts`
- Test: `worker/test/jobs.test.ts`

Probamos contra Supabase local real (`supabase start`) — `claimNextJob` debe
devolver `null` cuando la cola está vacía, y un job tras insertar uno.

- [ ] **Step 1: Escribir el test (falla primero)**

`worker/test/jobs.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { supabase } from "../src/supabase.js";
import { claimNextJob, completeJob, failJob } from "../src/jobs.js";

describe("cola de jobs", () => {
  beforeEach(async () => {
    await supabase.from("jobs").delete().neq("type", "__never__");
  });

  it("devuelve null cuando no hay jobs pendientes", async () => {
    const job = await claimNextJob();
    expect(job).toBeNull();
  });

  it("reclama un job pendiente y lo marca como done al completar", async () => {
    await supabase.from("jobs").insert({ type: "test", payload: {} });

    const job = await claimNextJob();
    expect(job).not.toBeNull();
    expect(job!.type).toBe("test");
    expect(job!.status).toBe("running");

    await completeJob(job!.id);
    const { data } = await supabase.from("jobs").select("status").eq("id", job!.id).single();
    expect(data!.status).toBe("done");
  });

  it("marca failed con mensaje de error", async () => {
    await supabase.from("jobs").insert({ type: "test", payload: {} });
    const job = await claimNextJob();
    await failJob(job!.id, "boom");
    const { data } = await supabase.from("jobs").select("status,last_error").eq("id", job!.id).single();
    expect(data!.status).toBe("failed");
    expect(data!.last_error).toBe("boom");
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `pnpm --filter worker test`
Expected: FAIL — `claimNextJob is not a function` (módulo aún no existe).

- [ ] **Step 3: Escribir la implementación**

`worker/src/jobs.ts`:

```typescript
import { supabase } from "./supabase.js";

export interface Job {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  status: string;
  attempts: number;
}

export async function claimNextJob(): Promise<Job | null> {
  const { data, error } = await supabase.rpc("claim_job");
  if (error) throw error;
  // claim_job devuelve una fila o null
  return (data as Job | null) ?? null;
}

export async function completeJob(id: string): Promise<void> {
  const { error } = await supabase.from("jobs").update({ status: "done" }).eq("id", id);
  if (error) throw error;
}

export async function failJob(id: string, message: string): Promise<void> {
  const { error } = await supabase
    .from("jobs")
    .update({ status: "failed", last_error: message })
    .eq("id", id);
  if (error) throw error;
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `supabase start` (si no corre) y luego `pnpm --filter worker test`
Expected: PASS — 3 tests verdes. (El test carga env desde `.env`; asegurar que `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` apunten al Supabase local.)

- [ ] **Step 5: Commit**

```bash
git add worker/src/jobs.ts worker/test/jobs.test.ts
git commit -m "feat(worker): claimNextJob/completeJob/failJob sobre la cola"
```

---

## Task 9: Worker — registro de handlers (TDD)

**Files:**
- Create: `worker/src/handlers.ts`
- Test: `worker/test/handlers.test.ts`

Un registro tipo->handler. En Fase 0 registramos un handler `noop` de prueba;
en Fase 1 se añade el handler `investigate` sin tocar el bucle.

- [ ] **Step 1: Escribir el test (falla primero)**

`worker/test/handlers.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { registerHandler, getHandler, handlerExists } from "../src/handlers.js";

describe("registro de handlers", () => {
  it("registra y recupera un handler por tipo", async () => {
    const calls: string[] = [];
    registerHandler("demo", async (payload) => {
      calls.push(JSON.stringify(payload));
    });

    expect(handlerExists("demo")).toBe(true);
    const handler = getHandler("demo");
    await handler({ hola: "mundo" });
    expect(calls).toEqual(['{"hola":"mundo"}']);
  });

  it("lanza si el tipo no tiene handler", () => {
    expect(() => getHandler("inexistente")).toThrow(/sin handler/);
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `pnpm --filter worker test handlers`
Expected: FAIL — módulo `handlers.js` no existe.

- [ ] **Step 3: Escribir la implementación**

`worker/src/handlers.ts`:

```typescript
export type JobHandler = (payload: Record<string, unknown>) => Promise<void>;

const handlers = new Map<string, JobHandler>();

export function registerHandler(type: string, handler: JobHandler): void {
  handlers.set(type, handler);
}

export function handlerExists(type: string): boolean {
  return handlers.has(type);
}

export function getHandler(type: string): JobHandler {
  const handler = handlers.get(type);
  if (!handler) throw new Error(`Tipo de job sin handler: ${type}`);
  return handler;
}

// Handler de prueba de Fase 0: solo registra que se ejecutó. Se quitará en Fase 1.
registerHandler("noop", async () => {
  console.log("[worker] job noop procesado");
});
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `pnpm --filter worker test handlers`
Expected: PASS — 2 tests verdes.

- [ ] **Step 5: Commit**

```bash
git add worker/src/handlers.ts worker/test/handlers.test.ts
git commit -m "feat(worker): registro de handlers por tipo de job"
```

---

## Task 10: Worker — bucle de sondeo y entrypoint

**Files:**
- Create: `worker/src/loop.ts`, `worker/src/index.ts`

- [ ] **Step 1: Escribir `worker/src/loop.ts`**

```typescript
import { claimNextJob, completeJob, failJob } from "./jobs.js";
import { getHandler, handlerExists } from "./handlers.js";

// Procesa un único job si hay alguno pendiente. Devuelve true si procesó algo.
export async function tick(): Promise<boolean> {
  const job = await claimNextJob();
  if (!job) return false;

  try {
    if (!handlerExists(job.type)) {
      await failJob(job.id, `Tipo de job sin handler: ${job.type}`);
      return true;
    }
    await getHandler(job.type)(job.payload);
    await completeJob(job.id);
  } catch (err) {
    await failJob(job.id, err instanceof Error ? err.message : String(err));
  }
  return true;
}

// Bucle infinito: procesa jobs; si no hay, duerme `intervalMs`.
export async function runLoop(intervalMs: number, shouldStop = () => false): Promise<void> {
  while (!shouldStop()) {
    const processed = await tick();
    if (!processed) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
}
```

- [ ] **Step 2: Escribir `worker/src/index.ts`**

```typescript
import { config } from "./config.js";
import { runLoop } from "./loop.js";
import "./handlers.js"; // registra los handlers

console.log("[worker] michis worker iniciado (latido)");
runLoop(config.pollIntervalMs).catch((err) => {
  console.error("[worker] error fatal:", err);
  process.exit(1);
});
```

- [ ] **Step 3: Añadir test de `tick` end-to-end**

Añadir a `worker/test/jobs.test.ts` (al final, dentro de un nuevo `describe`):

```typescript
import { tick } from "../src/loop.js";
import { registerHandler } from "../src/handlers.js";

describe("tick", () => {
  it("procesa un job con handler registrado y lo deja done", async () => {
    await supabase.from("jobs").delete().neq("type", "__never__");
    let ran = false;
    registerHandler("e2e", async () => { ran = true; });
    await supabase.from("jobs").insert({ type: "e2e", payload: {} });

    const processed = await tick();
    expect(processed).toBe(true);
    expect(ran).toBe(true);
  });

  it("devuelve false cuando la cola está vacía", async () => {
    await supabase.from("jobs").delete().neq("type", "__never__");
    expect(await tick()).toBe(false);
  });
});
```

- [ ] **Step 4: Correr todos los tests del worker**

Run: `pnpm --filter worker test`
Expected: PASS — todos verdes.

- [ ] **Step 5: Verificar el latido manualmente**

Run (en una terminal con env del Supabase local): `pnpm --filter worker dev`
En otra terminal, insertar un job desde Studio o SQL:
`insert into jobs (type, payload) values ('noop', '{}');`
Expected: el worker imprime `[worker] job noop procesado`.

- [ ] **Step 6: Commit**

```bash
git add worker/src/loop.ts worker/src/index.ts worker/test/jobs.test.ts
git commit -m "feat(worker): bucle de sondeo (heartbeat) y entrypoint"
```

---

## Task 11: Worker — Dockerfile

**Files:**
- Create: `worker/Dockerfile`

- [ ] **Step 1: Escribir `worker/Dockerfile`**

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY pnpm-workspace.yaml package.json ./
COPY worker/package.json worker/
RUN pnpm install --filter worker --frozen-lockfile=false
COPY worker/ worker/
RUN pnpm --filter worker build

FROM node:22-alpine
WORKDIR /app/worker
RUN corepack enable
COPY --from=build /app/worker/dist ./dist
COPY --from=build /app/worker/package.json ./
COPY --from=build /app/node_modules /app/node_modules
CMD ["node", "dist/index.js"]
```

- [ ] **Step 2: Construir la imagen**

Run: `docker build -f worker/Dockerfile -t michis-worker .`
Expected: build exitoso.

- [ ] **Step 3: Commit**

```bash
git add worker/Dockerfile
git commit -m "chore(worker): Dockerfile para despliegue en VPS"
```

---

## Task 12: Web — scaffolding Next.js + PWA

**Files:**
- Create: `web/package.json`, `web/tsconfig.json`, `web/next.config.mjs`, `web/tailwind.config.ts`, `web/src/app/globals.css`, `web/public/manifest.webmanifest`

- [ ] **Step 1: Crear `web/package.json`**

```json
{
  "name": "web",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run"
  },
  "dependencies": {
    "@supabase/ssr": "^0.5.0",
    "@supabase/supabase-js": "^2.45.0",
    "next": "^15.0.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0"
  },
  "devDependencies": {
    "@ducanh2912/next-pwa": "^10.2.0",
    "@testing-library/react": "^16.0.0",
    "@types/react": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.0",
    "jsdom": "^25.0.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Crear `web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "jsx": "preserve",
    "module": "esnext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Crear `web/next.config.mjs`**

```javascript
import withPWAInit from "@ducanh2912/next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
});

/** @type {import('next').NextConfig} */
const nextConfig = {};

export default withPWA(nextConfig);
```

- [ ] **Step 4: Crear `web/tailwind.config.ts`**

```typescript
import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 5: Crear `web/src/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 6: Crear `web/public/manifest.webmanifest`**

```json
{
  "name": "michis",
  "short_name": "michis",
  "description": "Investigación y denuncia coordinada de bots",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0b0b0f",
  "theme_color": "#0b0b0f",
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 7: Instalar y verificar build base**

Run: `pnpm install`
Expected: instala deps de `web`. (Los íconos PNG se añaden como assets reales antes del deploy; no bloquean el dev.)

- [ ] **Step 8: Commit**

```bash
git add web/package.json web/tsconfig.json web/next.config.mjs web/tailwind.config.ts web/src/app/globals.css web/public/manifest.webmanifest pnpm-lock.yaml
git commit -m "chore(web): scaffolding Next.js + Tailwind + PWA"
```

---

## Task 13: Web — clientes Supabase (browser y server)

**Files:**
- Create: `web/src/lib/supabase/client.ts`, `web/src/lib/supabase/server.ts`, `web/middleware.ts`

- [ ] **Step 1: Crear `web/src/lib/supabase/client.ts`**

```typescript
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Step 2: Crear `web/src/lib/supabase/server.ts`**

```typescript
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Llamado desde un Server Component sin response: se ignora.
          }
        },
      },
    },
  );
}
```

- [ ] **Step 3: Crear `web/middleware.ts`**

```typescript
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );
  await supabase.auth.getUser(); // refresca la sesión
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest).*)"],
};
```

- [ ] **Step 4: Verificar tipos**

Run: `pnpm --filter web exec tsc --noEmit`
Expected: sin errores de tipo.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/supabase/client.ts web/src/lib/supabase/server.ts web/middleware.ts
git commit -m "feat(web): clientes Supabase browser/server y middleware de sesión"
```

---

## Task 14: Web — componente RoleGate (TDD)

**Files:**
- Create: `web/src/components/RoleGate.tsx`, `web/vitest.config.ts`, `web/src/test/roleGate.test.tsx`

- [ ] **Step 1: Crear `web/vitest.config.ts`**

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: { environment: "jsdom", globals: true },
});
```

- [ ] **Step 2: Escribir el test (falla primero)**

`web/src/test/roleGate.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { RoleGate } from "../components/RoleGate";

describe("RoleGate", () => {
  it("muestra el contenido cuando el rol coincide", () => {
    render(<RoleGate role="admin" allow={["admin"]}>secreto</RoleGate>);
    expect(screen.getByText("secreto")).toBeDefined();
  });

  it("oculta el contenido cuando el rol no está permitido", () => {
    render(<RoleGate role="activista" allow={["admin"]}>secreto</RoleGate>);
    expect(screen.queryByText("secreto")).toBeNull();
  });
});
```

- [ ] **Step 3: Correr el test para verificar que falla**

Run: `pnpm --filter web test`
Expected: FAIL — `RoleGate` no existe.

- [ ] **Step 4: Escribir la implementación**

`web/src/components/RoleGate.tsx`:

```tsx
import type { ReactNode } from "react";

export type Role = "activista" | "admin";

export function RoleGate({
  role,
  allow,
  children,
}: {
  role: Role;
  allow: Role[];
  children: ReactNode;
}) {
  if (!allow.includes(role)) return null;
  return <>{children}</>;
}
```

- [ ] **Step 5: Correr el test para verificar que pasa**

Run: `pnpm --filter web test`
Expected: PASS — 2 tests verdes.

- [ ] **Step 6: Commit**

```bash
git add web/vitest.config.ts web/src/components/RoleGate.tsx web/src/test/roleGate.test.tsx
git commit -m "feat(web): componente RoleGate con tests"
```

---

## Task 15: Web — layout raíz, login y dashboard protegido

**Files:**
- Create: `web/src/app/layout.tsx`, `web/src/app/login/page.tsx`, `web/src/app/(app)/layout.tsx`, `web/src/app/(app)/page.tsx`

- [ ] **Step 1: Crear `web/src/app/layout.tsx`**

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "michis",
  description: "Investigación y denuncia coordinada de bots",
  manifest: "/manifest.webmanifest",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-neutral-950 text-neutral-100 antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Crear `web/src/app/login/page.tsx`** (login por email/contraseña con Supabase)

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      return;
    }
    router.push("/");
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 p-6">
      <h1 className="text-2xl font-semibold">michis</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <input
          type="email" placeholder="Email" value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded bg-neutral-900 p-2"
        />
        <input
          type="password" placeholder="Contraseña" value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded bg-neutral-900 p-2"
        />
        <button type="submit" className="rounded bg-emerald-600 p-2 font-medium">
          Entrar
        </button>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </form>
      <p className="text-xs text-neutral-500">El acceso es solo por invitación.</p>
    </main>
  );
}
```

- [ ] **Step 3: Crear `web/src/app/(app)/layout.tsx`** (protege y carga rol)

```tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Role } from "@/components/RoleGate";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles").select("role, display_name").eq("id", user.id).single();
  const role: Role = (profile?.role as Role) ?? "activista";

  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b border-neutral-800 p-4">
        <span className="font-semibold">michis</span>
        <span className="text-sm text-neutral-400">
          {profile?.display_name ?? user.email} · {role}
        </span>
      </header>
      <main className="p-4">{children}</main>
    </div>
  );
}
```

- [ ] **Step 4: Crear `web/src/app/(app)/page.tsx`** (dashboard placeholder)

```tsx
export default function DashboardPage() {
  return (
    <section>
      <h1 className="text-xl font-semibold">Panel</h1>
      <p className="text-neutral-400">
        Fase 0 lista. La gestión de casos llega en Fase 1.
      </p>
    </section>
  );
}
```

- [ ] **Step 5: Verificar build**

Run: `pnpm --filter web build`
Expected: build exitoso (con env del Supabase local presentes).

- [ ] **Step 6: Verificar el flujo manualmente**

Crear un usuario de prueba desde Supabase Studio (Authentication → Add user) con
`raw_user_meta_data` `{"role":"admin","display_name":"Admin Prueba"}`.
Run: `pnpm --filter web dev` → ir a `/login` → entrar.
Expected: redirige al panel y muestra `Admin Prueba · admin`. Sin sesión, `/`
redirige a `/login`.

- [ ] **Step 7: Commit**

```bash
git add "web/src/app/layout.tsx" "web/src/app/login/page.tsx" "web/src/app/(app)/layout.tsx" "web/src/app/(app)/page.tsx"
git commit -m "feat(web): layout raíz, login y panel protegido por sesión y rol"
```

---

## Task 16: Verificación integral de Fase 0

- [ ] **Step 1: Tests de base de datos**

Run: `supabase db reset && supabase test db`
Expected: los 3 archivos de test pgTAP `.. ok`.

- [ ] **Step 2: Tests de TS (worker + web)**

Run: `pnpm -r test`
Expected: todos los tests verdes en `worker` y `web`.

- [ ] **Step 3: Builds**

Run: `pnpm --filter worker build && pnpm --filter web build`
Expected: ambos compilan.

- [ ] **Step 4: Smoke test end-to-end del worker**

Con `supabase start` y `pnpm --filter worker dev` corriendo, insertar:
`insert into jobs (type, payload) values ('noop', '{}');`
Expected: el worker imprime `[worker] job noop procesado` y el job queda `done`.

- [ ] **Step 5: Commit final de fase**

```bash
git add -A
git commit -m "chore: cierre Fase 0 — cimientos verificados"
```

---

## Self-Review (cobertura del spec)

- **Arquitectura (4 bloques):** web (Tasks 12-15), Supabase (Tasks 2-6), worker (Tasks 7-11), externos → diferidos a Fase 1. ✅
- **Modelo de datos (todas las tablas):** Tasks 3-5 (profiles, cases, runs, steps, evidence, dossiers, campaigns, actions, links, tags, jobs). ✅
- **Roles + RLS + invitación + 2FA:** roles y RLS en Tasks 3, 6; invitación = alta solo desde Studio/admin (sin signup público) reflejada en login (Task 15); 2FA obligatorio se configura en el panel de Supabase Auth (paso de despliegue, documentado en Fase 1). ⚠️ *2FA queda como configuración de proyecto, no código de Fase 0.*
- **Cola de jobs + worker asíncrono:** Tasks 5, 8-11. ✅
- **PWA:** manifest + next-pwa (Task 12). ✅
- **Agente de IA / tools / denuncia / OSINT:** **fuera de alcance de Fase 0** — son Fase 1+. ✅ (consistente con el spec)

**Nota para el ejecutor:** el 2FA obligatorio y la deshabilitación de signups públicos
se activan en la configuración de Supabase Auth del proyecto (no en migraciones).
Documentar esa configuración al inicio del plan de Fase 1.
