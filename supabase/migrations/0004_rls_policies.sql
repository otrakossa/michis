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

-- Anti escalada de privilegios: solo un admin puede cambiar el rol de un profile.
create function public.prevent_role_change()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  if new.role <> old.role and not public.is_admin() then
    raise exception 'No autorizado a cambiar el rol';
  end if;
  return new;
end;
$$;

create trigger profiles_no_role_escalation
  before update on public.profiles
  for each row execute function public.prevent_role_change();

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

-- PROFILES: cada quien ve su perfil; admin ve todos.
-- Auto-edición permitida (el trigger bloquea el cambio de rol). Admin: todo.
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.is_admin());
create policy profiles_update_self on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
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

-- RUNS / STEPS / EVIDENCE: visibles si el caso es visible. Escritura de runs/steps
-- la hace el worker (service role saltea RLS). El activista sube evidencia.
create policy runs_select on public.investigation_runs for select
  using (public.can_see_case(case_id));
create policy steps_select on public.agent_steps for select
  using (exists (select 1 from public.investigation_runs r
                 where r.id = run_id and public.can_see_case(r.case_id)));
create policy evidence_select on public.evidence_items for select
  using (public.can_see_case(case_id));
create policy evidence_insert on public.evidence_items for insert
  with check (public.can_see_case(case_id));

-- DOSSIERS: ver si el caso es visible. Solo admin aprueba (update).
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

-- TAGS / CASE_TAGS / CASE_LINKS: lectura a usuarios autenticados / casos visibles.
create policy tags_select on public.tags for select using (auth.uid() is not null);
create policy case_tags_select on public.case_tags for select
  using (public.can_see_case(case_id));
create policy case_links_select on public.case_links for select
  using (public.can_see_case(source_case));
