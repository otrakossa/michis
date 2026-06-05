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
