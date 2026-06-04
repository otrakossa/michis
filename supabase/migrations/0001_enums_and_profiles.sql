-- Roles del sistema (Fase 1: dos)
create type public.user_role as enum ('activista', 'admin');

-- Perfil ligado a auth.users
create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  role         public.user_role not null default 'activista',
  display_name text,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- Al crear un usuario en auth, crear su profile automáticamente.
-- El rol y display_name se toman de raw_user_meta_data si el admin los puso
-- en la invitación; por defecto 'activista'.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, role, display_name)
  values (
    new.id,
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'activista'),
    new.raw_user_meta_data ->> 'display_name'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
