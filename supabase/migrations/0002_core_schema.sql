-- Enums de estado
create type public.platform        as enum ('twitter', 'tiktok');
create type public.case_status     as enum ('nuevo', 'investigando', 'needs_review', 'confirmado', 'descartado');
create type public.run_status      as enum ('queued', 'running', 'needs_review', 'done', 'failed');
create type public.dossier_status  as enum ('draft', 'approved');
create type public.campaign_status as enum ('draft', 'active', 'closed');
create type public.evidence_source as enum ('tool', 'manual');
create type public.link_relation   as enum ('mismo_texto', 'amplificacion_coordinada', 'mismo_avatar');
create type public.discovered_by   as enum ('agente', 'manual');

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
