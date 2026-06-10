# Backend + Frontend · Gestión de compas (creación directa, sin correos)

**Fecha:** 2026-06-10
**Repos:** `michis` (backend — este repo) y `michis-alerta` (frontend).

> Esta versión **reemplaza** el enfoque de invitaciones por correo del doc
> `michis-alerta/docs/backend/admin-compas.md`. Decisión del usuario
> (2026-06-10): el admin **crea el usuario directo** (nombre, apellido, correo,
> contraseña, rol); nada de emails de invitación.

## 1. Objetivo

Un admin, desde `/admin/compas`, puede:
- **Crear** un compa directo: nombre, apellido, correo, contraseña y rol. La
  cuenta queda activa al instante (sin email de confirmación).
- **Listar** los compas con su rol y estado.
- **Cambiar el rol** (activista ↔ admin).
- **Revocar** (desactivar) y **reactivar** un compa.

La contraseña inicial la **genera el formulario** (botón "generar", mostrada en
claro para que el admin la copie y se la pase al compa por fuera); el admin
también puede escribir una manual. El compa luego la cambia desde
`/perfil` (flujo "cambiar contraseña" que ya existe).

## 2. Decisiones tomadas

- **Nombre:** el form pide nombre y apellido, pero se guardan combinados como
  `profiles.display_name = 'Nombre Apellido'`. Sin columnas nuevas de nombre.
- **Sin tabla `invitations`, sin estados pendiente/revocada, sin `inviteUserByEmail`,
  sin stub `/aceptar-invitacion`.** El concepto de "invitación" desaparece.
- **Revocar = desactivar (soft), reversible.** Borrar de verdad rompería:
  `cases.created_by` referencia `profiles(id)` **sin `on delete cascade`** y es
  `not null`, así que `deleteUser` fallaría para cualquier compa con casos. Se
  conserva el casework: `profiles.active = false` + ban del login en auth.
- **Frontend:** lo actualiza Claude end-to-end (backend + `compas-client.ts` +
  UI). Nota de territorio: normalmente Lovable es dueño de las pantallas; aquí
  el usuario pidió explícitamente que Claude rehaga también la UI. Lovable
  puede pulir el diseño después.

## 3. Seguridad del rol (sin tocar el trigger)

El rol **no viaja por la metadata del usuario**. Se mantiene `handle_new_user`
tal cual `0006` (siempre crea `activista`). La Edge Function, tras `createUser`,
asigna el rol elegido server-side con `service_role` — el "canal autorizado"
que define el endurecimiento de `0006`. Cero cambios al trigger, cero vector de
auto-escalada aunque se abrieran los signups.

## 4. Migración `0015_compas.sql` (repo `michis`)

### 4.1 `profiles`
- `alter table public.profiles add column if not exists invited_by uuid references auth.users(id)`
  — auditoría: qué admin creó al compa. (`active` y `created_at` ya existen.)

### 4.2 `is_admin()` respeta `active`
Reescribe el helper de `0004` para exigir cuenta activa, de modo que un admin
desactivado pierde poderes de inmediato:
```sql
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and active = true
  );
$$;
```
Esto endurece todas las políticas RLS que ya usan `is_admin()` (un compa
desactivado deja de ver/operar como admin). Para activistas desactivados, el
ban de auth (§5) impide el login, que es la barrera principal.

### 4.3 RPC `admin_listar_compas()`
`security definer`, `search_path` fijado, valida `is_admin()` (si no →
`raise exception 'no autorizado'`). Devuelve, por cada perfil:
```
id            uuid          -- user id
email         text          -- de auth.users
handle        text          -- coalesce(display_name, split_part(email,'@',1))
rol           text          -- 'admin' | 'activista'
estado        text          -- 'activa' | 'inactiva'  (de profiles.active)
creado_en     timestamptz   -- profiles.created_at
invitado_por  uuid          -- profiles.invited_by
```
`grant execute to authenticated`; `revoke` de `public`/`anon` (patrón `0013`).

### 4.4 RPC `admin_cambiar_rol(p_user_id uuid, p_rol text)`
`security definer`. Valida `is_admin()` y `p_rol ∈ ('admin','activista')`
(si no → `rol inválido`). Guardarraíl del **último admin activo**: si se degrada
a `activista` al único admin con `active = true` → `raise exception 'tiene que
quedar al menos un admin'`. Hace `update profiles set role = p_rol where id =
p_user_id`. `grant execute to authenticated`.

## 5. Edge Function `supabase/functions/admin-compas/index.ts` (repo `michis`)

Deno autocontenida, patrón de `procesar-cola` (`createClient` de
`npm:@supabase/supabase-js@2`). `POST` con `Authorization: Bearer <user JWT>`.

**Verificación del caller:** cliente con el JWT → `auth.getUser()` →
`profiles.role`/`active`. Si no es admin activo → `401 { error: "no autorizado" }`.
Luego cliente admin con `SUPABASE_SERVICE_ROLE_KEY`.

**Acciones (body):**

- `{ accion: "crear", display_name, email, password, rol }`
  - Valida: email con formato; `rol ∈ {admin,activista}` (`rol inválido`);
    `password` ≥ 8 (`contraseña inválida`); `display_name` no vacío.
  - Rechaza si el email ya existe en `profiles`/`auth` (`compa ya existe`).
  - `admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name } })`.
  - Tras crear: `update public.profiles set role = rol, invited_by = <caller>
    where id = <nuevo id>` (con service_role). El trigger ya creó el perfil como
    `activista`; aquí se fija el rol elegido.
  - `{ ok: true }`.

- `{ accion: "revocar", target_id }`  → **desactivar**
  - Guardarraíl: no desactivar al último admin activo (`tiene que quedar al
    menos un admin`).
  - `update profiles set active = false where id = target_id`.
  - `admin.updateUserById(target_id, { ban_duration: "876000h" })` (≈100 años).
  - Revocar sesiones vigentes del usuario (`auth.admin.signOut`/invalidar
    refresh tokens) para que el JWT activo no sobreviva al refresh.
  - `{ ok: true }`.

- `{ accion: "reactivar", target_id }`
  - `update profiles set active = true where id = target_id`.
  - `admin.updateUserById(target_id, { ban_duration: "none" })`.
  - `{ ok: true }`.

`cambiar_rol` **no** pasa por la función: el frontend llama directo
`supabase.rpc("admin_cambiar_rol")` (no necesita service_role).

**Secretos:** `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` los inyecta la
plataforma. No requiere `SITE_URL` (sin emails). Despliegue:
`npx supabase functions deploy admin-compas` (verifica JWT).

## 6. Frontend (repo `michis-alerta`)

### 6.1 `src/lib/admin/compas-client.ts` (reescrito)
- Tipo `Compa = { id, email, handle, rol: 'admin'|'activista',
  estado: 'activa'|'inactiva', creadoEn, invitadoPor? }`. Se elimina
  `esInvitacion` y el estado `pendiente`.
- `crearCompa({ nombre, apellido, email, password, rol })` →
  `functions.invoke("admin-compas", { accion:"crear",
  display_name: \`${nombre} ${apellido}\`.trim(), email, password, rol })`.
- `listarCompas()` → `rpc("admin_listar_compas")` (mapea filas a `Compa`).
- `cambiarRolCompa(userId, rol)` → `rpc("admin_cambiar_rol", ...)` (sin cambios).
- `revocarCompa(userId)` → `invoke({ accion:"revocar", target_id })`.
- `reactivarCompa(userId)` → `invoke({ accion:"reactivar", target_id })`.
- Se eliminan `invitarCompa` y `reenviarInvitacion`.
- Util `generarPassword()`: contraseña aleatoria fuerte (≥16 chars, alfanum +
  símbolos seguros), con `crypto.getRandomValues`.

### 6.2 `src/hooks/use-compas.ts`
Ajustar a los nuevos métodos: `crear`, `revocar`, `reactivar`, `cambiarRol`,
`recargar`.

### 6.3 `src/routes/_app.admin.compas.tsx` (formulario + lista)
- Formulario "Crear compa": campos nombre, apellido, correo, contraseña (con
  botón **generar** y toggle ver/copiar), select de rol. Validación cliente +
  toasts con los mensajes de error del backend.
- Lista de compas (de `listarCompas`) con su rol y estado (activa/inactiva).

### 6.4 `src/components/michis/admin/compa-row.tsx`
- Quita "reenviar invitación" y el estado "pendiente".
- Acciones: cambiar rol; **revocar** (si activa) / **reactivar** (si inactiva),
  con confirmación.

## 7. Pruebas

**Backend SQL/RPC — TDD, integración real (Vitest en `worker/`, patrón existente):**
- `admin_listar_compas`: activista → `no autorizado`; admin → ve compas con
  `estado` correcto según `active`.
- `admin_cambiar_rol`: promueve/degrada; rechaza `rol inválido`; **rechaza
  degradar al último admin activo**.
- `is_admin()` respeta `active`: un admin con `active=false` no es admin.
- Disciplina: **posponer (no borrar/reclamar) jobs reales**; limpiar solo las
  filas creadas por el test. `fileParallelism: false` ya configurado.

**Edge Function — smoke gated (manual, requiere deploy):** script tras env
(`RUN_REAL_COMPAS_TEST=1`) con un JWT de admin: crear → listar → revocar →
reactivar.

**Frontend — Vitest:** funciones puras: mapeo fila→`Compa` y `generarPassword`
(longitud/charset/aleatoriedad básica).

## 8. Fuera de alcance

- Reasignación de casos (no se borra a nadie; los casos quedan con su
  `created_by` original aunque el compa esté inactivo).
- Rediseño visual fino de la pantalla (Lovable puede repulir después).
- 2FA / bloqueo de signups públicos (ya cerrados; el diseño no depende de ello).

## 9. Checklist de despliegue

- [ ] Migración `0015` aplicada (`npx supabase db push --db-url "$DATABASE_URL"`).
- [ ] Tests de integración del worker en verde.
- [ ] Edge Function `admin-compas` desplegada.
- [ ] Frontend (`compas-client.ts` + hook + UI) actualizado y compilando.
- [ ] E2E: crear compa → login con la clave generada → cambiarla en `/perfil`.
- [ ] E2E: revocar (no puede entrar; sus casos siguen) → reactivar (vuelve a entrar).
- [ ] E2E: degradar al último admin activo falla.
