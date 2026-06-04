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
