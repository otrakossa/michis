-- Seguridad: la URL de reporte de una campaña debe ser http(s).
-- Sin esto, una URL javascript: renderizada como href sería XSS para todo el
-- grupo. (Hallazgo de revisión automática; se valida también en UI y render.)
create or replace function public.activar_campania(p_case_id uuid, p_instructions text, p_report_url text)
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
  if p_report_url is null or p_report_url !~* '^https?://' then
    raise exception 'La URL de reporte debe empezar con http:// o https://';
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
