-- Gestión de compas (creación directa por admin, sin invitaciones por correo).
-- Ver docs/superpowers/specs/2026-06-10-backend-compas-design.md

-- Auditoría: qué admin creó al compa.
alter table public.profiles
  add column if not exists invited_by uuid references auth.users(id);

-- is_admin() ahora exige cuenta activa: un admin desactivado pierde poderes
-- en TODAS las políticas RLS que ya usan este helper.
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and active = true
  );
$$;

-- Lista de compas para el panel admin (perfiles + email de auth.users).
create or replace function public.admin_listar_compas()
returns table (
  id           uuid,
  email        text,
  handle       text,
  rol          text,
  estado       text,
  creado_en    timestamptz,
  invitado_por uuid
)
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'no autorizado';
  end if;
  return query
    select p.id,
           u.email::text,
           coalesce(p.display_name, split_part(u.email::text, '@', 1)),
           p.role::text,
           case when p.active then 'activa' else 'inactiva' end,
           p.created_at,
           p.invited_by
      from public.profiles p
      join auth.users u on u.id = p.id
     order by p.created_at desc;
end;
$$;

revoke execute on function public.admin_listar_compas() from public, anon;
grant execute on function public.admin_listar_compas() to authenticated;

-- Cambiar el rol de un compa, con guardarraíl del último admin activo.
create or replace function public.admin_cambiar_rol(p_user_id uuid, p_rol text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'no autorizado';
  end if;
  if p_rol not in ('admin', 'activista') then
    raise exception 'rol inválido';
  end if;
  if p_rol = 'activista'
     and exists (select 1 from public.profiles
                 where id = p_user_id and role = 'admin' and active = true)
     and (select count(*) from public.profiles
          where role = 'admin' and active = true) <= 1 then
    raise exception 'tiene que quedar al menos un admin';
  end if;
  update public.profiles set role = p_rol::public.user_role where id = p_user_id;
end;
$$;

revoke execute on function public.admin_cambiar_rol(uuid, text) from public, anon;
grant execute on function public.admin_cambiar_rol(uuid, text) to authenticated;
