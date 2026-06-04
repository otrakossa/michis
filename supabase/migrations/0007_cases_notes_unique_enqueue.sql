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
