-- El rol NO se deriva de metadata del usuario (timing poco fiable + superficie de
-- ataque). El trigger SIEMPRE crea 'activista'; el rol admin se asigna por un canal
-- autorizado: un admin (vía RLS is_admin) o el service role (panel admin server-side).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name');
  return new;
end;
$$;

-- Quitar la auto-edición de profiles: cierra el vector de auto-escalada de rol.
-- (En Fase 1 se añadirá un path acotado para editar solo display_name.)
drop policy if exists profiles_update_self on public.profiles;

-- El trigger anti-escalada ahora es redundante (ya no hay path de auto-update) y
-- además bloquearía la asignación legítima de rol por el service role. Se elimina.
drop trigger if exists profiles_no_role_escalation on public.profiles;
drop function if exists public.prevent_role_change();
