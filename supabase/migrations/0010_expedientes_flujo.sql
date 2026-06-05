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
