# michis — Cableado de michis-alerta a Supabase real — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox syntax.

**Goal:** `michis-alerta` deja los mocks y opera contra el Supabase real conservando la interfaz del store `useMichis` (las pantallas de Lovable no se tocan, salvo login).

**Spec:** `docs/superpowers/specs/2026-06-06-frontend-lovable-supabase-design.md` (en el repo michis — LEERLO: ahí están la tabla acción→backing y el mapeo de tipos §3).

**Entorno:** se trabaja en `/home/otrakossa/Fcbosque/michis-alerta` (repo independiente; remote github.com/otrakossa/michis-alerta). El backend de referencia está en `/home/otrakossa/Fcbosque/michis` (migraciones en `supabase/migrations/0001..0012` — consultar ahí columnas/firmas exactas de tablas y RPCs; el `.env` raíz de michis tiene `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` — son los valores públicos a copiar como constantes; NUNCA copiar service key ni DATABASE_URL). pnpm en `~/.local/node-v22.15.1-linux-x64/bin/pnpm`. Git: `git -c user.name="michis" -c user.email="kossa@nodolibre.org" commit ...`. REGLA: no tocar pantallas/rutas salvo `login.tsx` y donde el plan lo indique; no tocar `components/ui/**`.

---

## Task 0: Preparar repo
- [ ] En michis-alerta: `git fetch --unshallow 2>/dev/null; git checkout -b wire-supabase`.

## Task 1: Cliente Supabase + vitest mínimo
- [ ] `pnpm add @supabase/supabase-js` y `pnpm add -D vitest`.
- [ ] `src/lib/supabase.ts`:
```typescript
import { createClient } from "@supabase/supabase-js";

// Públicas por diseño (publishable key + URL). Las claves privilegiadas viven
// SOLO en el backend (repo michis). NO añadir aquí ninguna otra credencial.
const URL = "<copiar NEXT_PUBLIC_SUPABASE_URL del .env de michis>";
const PUBLISHABLE_KEY = "<copiar NEXT_PUBLIC_SUPABASE_ANON_KEY>";

export const supabase = createClient(URL, PUBLISHABLE_KEY);
```
- [ ] `package.json`: script `"test": "vitest run"`. Commit `feat: cliente supabase y vitest`.

## Task 2: Adaptadores (TDD) — `src/lib/api/adapters.ts`
- [ ] Test PRIMERO `src/lib/api/adapters.test.ts`: `mapEstado` (tabla del spec §3: needs_review sin dossier elevado→esperando_revision; dossier listo_admin→pendiente_admin; etc.), `mapPlataforma` (twitter↔X), `confianzaNumero` (baja/media/alta→0.3/0.6/0.9), `senalesAdaptadas` ({tipo,descripcion,peso}→{texto:"tipo: descripcion",peso}). → FAIL → implementar → PASS.
- [ ] `composeCaso(row, run, dossier)` → shape `Caso` de `src/lib/michis/types.ts` (expediente = dossier?.content?.resumen ?? "", score/frase/senales/vinculadas del verdict de la última run, sellos de dossier.submitted_by/at). Tipar entradas con interfaces mínimas de las filas. Commit `feat: adaptadores BD→tipos de UI`.

## Task 3: Capa de consultas — `src/lib/api/queries.ts`
- [ ] `fetchCasos()`: select cases (id, handle, platform, status, notes, created_by, created_at, risk_score, confidence) + por caso la última `investigation_runs` (verdict, status) y su `dossiers` (content, status, submitted_by, submitted_at) — 3 selects compuestos client-side (volumen bajo). Devuelve `Caso[]` vía composeCaso.
- [ ] `fetchCampanas()`: select denuncia_campaigns (+case join handle/platform) + `progreso_campania` por campaña (reportes, total→meta) + mis `denuncia_actions` (para misReportes). Devuelve `{ campanas: Campana[], misReportes: string[] }`.
- [ ] `fetchUsuario()`: `auth.getUser()` + profiles (role, display_name) → `Usuario { email, handle: display_name ?? email, rol }` o null. Commit `feat: capa de consultas reales`.

## Task 4: Swap de tripas del store — `src/lib/michis/store.ts`
- [ ] Reescribir manteniendo la INTERFAZ (leer el archivo actual primero). Cambios de firma permitidos SOLO: `login(email, password)` async devolviendo `string | null` (mensaje de error), nueva `refrescar()` async, `logout()` async, y las acciones pasan a async devolviendo `string | null` (error legible) — el resto de nombres/semántica igual. Quitar zustand/persist del estado de datos (queda zustand simple en memoria; la sesión la persiste supabase-js). Quitar `setRol` (rol real de BD) y `simularInvestigacion` (reemplazado por polling: mientras algún caso esté `investigando`, `refrescar()` cada 4 s con setInterval gestionado en el store).
- [ ] Acciones → tabla del spec §2 (crearCaso: normalizar handle minúsculas sin @, pre-chequeo duplicado → si existe devolver error con el handle, insert con created_by = user.id, luego RPC `enqueue_investigation`; manejar 23505 y mensajes de RPC tal cual llegan). `marcarReporte`: 23505 → tratar como éxito idempotente. Tras cada acción: `refrescar()`.
- [ ] `pnpm test` (adapters verdes) + `pnpm build` (vite) sin errores. Commit `feat: store respaldado por Supabase real`.

## Task 5: Login real + arranque
- [ ] `src/routes/login.tsx`: añadir campo contraseña, llamar `login(email, password)`, mostrar error; quitar selector/toggle de rol si existe. Nota "acceso solo por invitación".
- [ ] `src/routes/_app.tsx` (layout): al montar, `fetchUsuario` + `refrescar()`; si no hay sesión → redirect a /login (revisar cómo lo hace hoy con el store y conservar el patrón). `/perfil`: mínimo mostrar email/rol + botón logout (si la ruta ya existe, solo recablear).
- [ ] `pnpm build` OK. Commit `feat: login real y arranque con sesión`.

## Task 6: Verificación + publicación
- [ ] `pnpm test` + `pnpm build` finales. Smoke manual contra Supabase real (controlador): login admin-demo → crear caso → (worker corriendo) investigación → expediente → elevar → aprobar → campaña → ya reporté → cerrar.
- [ ] Push de la rama y merge a la rama principal del repo (master o main — verificar) + push → Lovable sincroniza.
- [ ] En el repo michis: añadir a `web/README.md` (crear) la nota "FRONTEND CONGELADO — el oficial es michis-alerta; este queda de fallback" + commit/push.
- [ ] Entregar al usuario el texto para el Knowledge de Lovable (lo redacta el controlador).

## Self-Review
- Territorios y constantes públicas (spec §1,4) → Tasks 1, 6 ✅ · Swap de store con interfaz conservada (§2, tabla completa de acciones) → Task 4 ✅ · Adaptadores con tests (§3, §5) → Task 2 ✅ · Login con contraseña + sin toggle (§2) → Task 5 ✅ · Polling reemplaza setTimeout (§2) → Task 4 ✅ · Smoke E2E (§5) → Task 6 ✅ · Fuera de alcance respetado (PWA/Realtime/perfil completo) ✅
