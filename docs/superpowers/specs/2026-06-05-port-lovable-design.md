# michis — Port de componentes de Lovable — Diseño

**Fecha:** 2026-06-05 · **Estado:** aprobado (usuario eligió "todo lo portable")
**Fuente:** repo `michis-alerta` clonado en `/home/otrakossa/Fcbosque/michis-alerta`
(generado con Lovable desde `docs/lovable-prompt.md`). Lo portable vive en
`src/components/michis/ui.tsx` (249 líneas, presentacional puro).

## 1. Qué se porta (y qué no)

**SÍ** (12 piezas): `BottomNav` (nav inferior móvil), `EmptyState`,
`SkeletonCard` (+ skeletons de carga vía `loading.tsx` de Next), `ScoreGauge`
(SVG animado), `StatusPill`, `ScoreBadge`, `SignalChip`, `PlatformBadge`,
`AIBadge`, `MiniMarkdown` (render del expediente), pill de campañas con pulso
en el header, avatar-chip de usuario.

**NO**: esqueleto TanStack/Vite/React 19, kit shadcn (40 archivos), store/mock
data, Tailwind 4 (su tema oklch se traduce a nuestro stone/amber), página
/perfil (no existe en nuestra app — fuera de alcance; el BottomNav la omite).

## 2. Tabla de adaptación (regla por regla)

| En Lovable | En michis |
|---|---|
| `@tanstack/react-router` `Link`/`useRouterState` | `next/link` / `usePathname()` (client) |
| `useMichis` (store) | Props desde el layout server (role, count campañas, handle/email) |
| Vars `--primary/--warning/--success/--danger/--border/--card/--muted` | `amber-500 / orange-400 / green-400 / red-400 / stone-700 / stone-800 / stone-400` (tokens del spec visual) |
| `cn` de `@/lib/utils` | Helper propio `web/src/lib/cn.ts` (filter+join, sin deps) |
| `lucide-react` | Se ADOPTA como dependencia (íconos del BottomNav/pills; tree-shaken) |
| Clases `shimmer` / `pulse-soft` | Keyframes nuevos en `globals.css` |
| `EstadoCaso` de Lovable (`esperando_revision`…) | NUESTROS estados crudos + `etiquetaEstado(ESTADO_CASO, …)` |
| `confianza` numérica del gauge | Nuestra `confianza` textual (baja/media/alta) |

## 3. Integraciones

1. **Layout `(app)`:** header conserva links de escritorio (ocultos en móvil,
   `hidden sm:flex`) + adopta pill de campañas con pulso y avatar-chip;
   `BottomNav` fijo abajo solo móvil (`sm:hidden`), items Casos / Expedientes
   (admin) / Campañas con grid dinámico; `main` con `pb-20 sm:pb-4` para no
   tapar contenido.
2. **`VerdictView`:** el gauge conic-gradient se reemplaza por `ScoreGauge`
   (SVG animado, número grande); señales con `SignalChip`; badge `AIBadge` en
   el título. Textos asertados por tests se conservan.
3. **`DossierPanel`:** la vista de solo-lectura usa `MiniMarkdown` (adiós
   `<pre>`); estado con `StatusPill` adaptado a dossier.
4. **Listas (casos/expedientes/campañas):** `StatusPill`+`ScoreBadge`+
   `PlatformBadge` en items; `EmptyState` con personalidad en cada lista
   ("Ningún caso todavía — ¿viste algo raro en redes?"); `loading.tsx` por
   ruta con `SkeletonCard` (mejora Next nativa).

## 4. Restricciones y testing
- Presentación solamente; cero cambios de lógica/datos; suite actual verde.
- Tests nuevos: `MiniMarkdown` (bold/lista/heading), `StatusPill` (etiqueta
  humana por estado), `EmptyState` (render). Gauge cubierto por verdictView.
- El clon `michis-alerta/` NO se toca ni se commitea en este repo.
