-- Endurecimiento de seguridad (responde a revisión automática de seguridad).
-- Las migraciones 0001-0004 ya estaban aplicadas; se corrige hacia adelante.

-- 1) [CRÍTICO] Anti escalada de privilegios en el alta de usuarios.
--    El rol NO debe leerse de raw_user_meta_data (el usuario lo controla en
--    signUp y podría autoasignarse 'admin'). Se lee de raw_app_meta_data, que
--    solo setea el admin vía Admin API / service role. Por defecto 'activista'.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, role, display_name)
  values (
    new.id,
    coalesce((new.raw_app_meta_data ->> 'role')::public.user_role, 'activista'),
    new.raw_user_meta_data ->> 'display_name'
  );
  return new;
end;
$$;

-- 2) [ALTO] claim_job solo debe poder invocarla el worker (service_role).
revoke execute on function public.claim_job() from public, anon, authenticated;
grant execute on function public.claim_job() to service_role;

-- 3) [ALTO] RLS deny-by-default en la cola de jobs. El worker usa service_role
--    (bypassa RLS); ningún cliente anon/authenticated debe tocar la cola.
--    El encolado controlado se hará server-side en Fase 1 (RPC/edge function).
alter table public.jobs enable row level security;
revoke all on public.jobs from anon, authenticated;

-- 4) [MEDIO] case_links: exigir visibilidad de AMBOS extremos para no filtrar la
--    existencia de un caso oculto a través de un caso visible.
drop policy if exists case_links_select on public.case_links;
create policy case_links_select on public.case_links for select
  using (public.can_see_case(source_case) and public.can_see_case(target_case));
