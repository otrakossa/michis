-- Camino angosto de auto-edición de perfil: SOLO display_name.
-- (El auto-update general de profiles se eliminó en 0006 para impedir la
-- escalada de rol; esta RPC reabre únicamente lo inofensivo.)
create function public.actualizar_perfil(p_display_name text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if p_display_name is null
     or length(trim(p_display_name)) < 1
     or length(p_display_name) > 60 then
    raise exception 'Nombre inválido (1-60 caracteres)';
  end if;
  update public.profiles
  set display_name = trim(p_display_name)
  where id = auth.uid();
end;
$$;

revoke execute on function public.actualizar_perfil(text) from public, anon;
grant execute on function public.actualizar_perfil(text) to authenticated;
