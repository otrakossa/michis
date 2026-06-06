# michis — michis-alerta como frontend oficial (cableado a Supabase) — Diseño

**Fecha:** 2026-06-06 · **Estado:** aprobado (Modelo B disciplinado, decidido por el usuario)

## 1. Decisión y división de territorios
- **`michis-alerta`** (github.com/otrakossa/michis-alerta, TanStack Start + Vite)
  pasa a ser **EL frontend**. Lovable diseña pantallas; Claude es dueño de la
  capa de datos. **El mismo Supabase gestionado de siempre** — backend intacto.
- **`michis`** conserva worker + migraciones + docs. `michis/web` queda
  **congelado como fallback** hasta confirmar paridad (luego se archiva).
- **Frontera dentro de michis-alerta:** `src/lib/api/**`, `src/lib/michis/store.ts`
  y `src/lib/supabase.ts` son territorio de Claude. Se instruye a Lovable vía
  Knowledge del proyecto: *"No modifiques src/lib/api, src/lib/supabase.ts ni
  store.ts; los datos vienen del store useMichis"*.

## 2. Estrategia de cableado: swap de tripas del store
El store zustand `useMichis` (interfaz: usuario, casos, campanas, misReportes,
login/logout, crearCaso, guardarExpediente, elevarAdmin, aprobarCaso,
devolverCaso, activarCampana, marcarReporte, cerrarCampana, buscarPorHandle)
**conserva su firma** — las pantallas no cambian — pero sus acciones pasan a
llamar Supabase real:

| Acción del store | Backing real |
|---|---|
| `login(email)` → pasa a `login(email, password)` | `auth.signInWithPassword` + profile (role) — única firma que cambia; la pantalla login gana campo contraseña (toque mínimo) y pierde el toggle de rol (el rol real viene de la BD) |
| carga inicial / `refrescar()` (nueva) | select `cases` (+ última run con verdict + dossier) y `denuncia_campaigns` + `progreso_campania`; compone los shapes de Lovable |
| `crearCaso` | normalización de handle + pre-chequeo duplicado + insert `cases` + RPC `enqueue_investigation` (su UX ya asume investigación automática al crear) |
| `guardarExpediente` | update `dossiers.content` (RLS solo-draft) |
| `elevarAdmin` | RPC `elevar_expediente` |
| `aprobarCaso` / `devolverCaso` | RPC `resolver_expediente('aprobar'/'devolver')` |
| `activarCampana` | RPC `activar_campania` (instrucciones + URL de reporte por defecto editables) |
| `marcarReporte` | insert `denuncia_actions` (23505 → "ya habías reportado") |
| `cerrarCampana` | RPC `cerrar_campania` |
| "investigando…" | polling cada 4 s del caso mientras estado=investigando (reemplaza los setTimeout del mock) |

## 3. Adaptadores de tipos (`src/lib/api/adapters.ts`, con tests)
- Estados caso+dossier de la BD → `EstadoCaso` de Lovable:
  `nuevo`→`borrador`; `investigando`→`investigando`; `needs_review` (sin dossier
  elevado)→`esperando_revision`; dossier `listo_admin`→`pendiente_admin`;
  `confirmado`→`confirmado`; `descartado`→`descartado`.
- `platform` `twitter|tiktok` ↔ `Plataforma` `"X"|"TikTok"`.
- `verdict` (score, confianza textual→número 0.3/0.6/0.9, senales
  {tipo,descripcion,peso}→{texto: "tipo: descripcion", peso}, resumen→frase del
  veredicto vía score) + `dossiers.content.resumen`→`expediente`.
- `Campana`: `meta` = total de `progreso_campania`; `reportes` = reportes.

## 4. Conexión y credenciales
`src/lib/supabase.ts`: cliente singleton con la **URL y publishable key como
constantes** (son públicas por diseño; evita fricción de env en el sandbox de
Lovable). La service key y `DATABASE_URL` JAMÁS entran a este repo. Sesión SPA
estándar (localStorage, manejada por supabase-js).

## 5. Verificación
- Unit tests (vitest mínimo en michis-alerta) para los adaptadores de estados.
- La red de seguridad de fondo siguen siendo los 43 tests del worker (RPCs/RLS).
- Smoke manual: login real → crear caso → ver investigación del worker →
  expediente → elevar → aprobar (admin) → campaña → ya reporté → cerrar.
- Tras push a master de michis-alerta, Lovable sincroniza y el usuario ve la
  app REAL con datos reales en el preview de Lovable.

## 6. Fuera de alcance
PWA del nuevo frontend (vite-plugin-pwa, iteración siguiente) · archivo
definitivo de michis/web · página /perfil funcional completa (mínimo viable:
mostrar usuario + logout) · Realtime (se mantiene polling/refresco).
