# michis — Port de componentes de Lovable — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portar las 12 piezas de `michis-alerta` (BottomNav, EmptyState, skeletons, ScoreGauge SVG, pills/chips/badges, MiniMarkdown, pill de campañas con pulso) al código real, adaptadas a Next/stone-amber/datos reales.

**Architecture:** Solo presentación. FUENTE DE VERDAD: `/home/otrakossa/Fcbosque/michis-alerta/src/components/michis/ui.tsx` — los implementadores LEEN ese archivo y aplican la **tabla de adaptación del spec** (`docs/superpowers/specs/2026-06-05-port-lovable-design.md` §2). No se inventa diseño: se traduce.

**Entorno:** pnpm en `~/.local/node-v22.15.1-linux-x64/bin/pnpm` si falta. Git: `git -c user.name="michis" -c user.email="kossa@nodolibre.org" commit ...`. REGLA DURA: cero lógica/datos; suite actual verde; el clon `michis-alerta` NO se modifica.

---

## Task 0: Rama
- [ ] `git checkout -b port-lovable`.

## Task 1: Base del port
**Files:** Create `web/src/lib/cn.ts` · Modify `web/package.json` (lucide), `web/src/app/globals.css`
- [ ] `pnpm --filter web add lucide-react`
- [ ] `web/src/lib/cn.ts`:
```typescript
// Une clases condicionales sin dependencias.
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
```
- [ ] Añadir a `globals.css` (fuera de @layer, al final):
```css
@keyframes shimmer { 0% { opacity: .45 } 50% { opacity: .8 } 100% { opacity: .45 } }
.shimmer { background: #292524; animation: shimmer 1.4s ease-in-out infinite; }
@keyframes pulse-soft { 0%,100% { opacity: 1 } 50% { opacity: .4 } }
.pulse-soft { animation: pulse-soft 1.6s ease-in-out infinite; }
```
- [ ] `tsc --noEmit` + tests verdes. Commit `feat(web): base del port de Lovable (cn, lucide, animaciones)`.

## Task 2: Primitivas (TDD) — badges, pills, EmptyState, SkeletonCard, MiniMarkdown
**Files:** Create `web/src/components/{StatusPill,ScoreBadge,SignalChip,PlatformBadge,AIBadge,EmptyState,SkeletonCard,MiniMarkdown}.tsx` · Test: `web/src/test/portLovable.test.tsx`
- [ ] **Test PRIMERO** (`portLovable.test.tsx`):
```tsx
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StatusPill } from "../components/StatusPill";
import { EmptyState } from "../components/EmptyState";
import { MiniMarkdown } from "../components/MiniMarkdown";

describe("port de Lovable", () => {
  it("StatusPill muestra la etiqueta humana del estado", () => {
    render(<StatusPill mapa="caso" estado="needs_review" />);
    expect(screen.getByText("esperando tu revisión")).toBeDefined();
  });
  it("EmptyState renderiza emoji, título, texto", () => {
    render(<EmptyState emoji="🐱" titulo="Nada aún" texto="¿viste algo raro?" />);
    expect(screen.getByText("Nada aún")).toBeDefined();
    expect(screen.getByText("¿viste algo raro?")).toBeDefined();
  });
  it("MiniMarkdown renderiza headings, listas y bold", () => {
    render(<MiniMarkdown text={"## Título\n- punto **fuerte**"} />);
    expect(screen.getByText("Título")).toBeDefined();
    expect(screen.getByText("fuerte")).toBeDefined();
  });
});
```
→ FAIL → implementar leyendo la FUENTE (`ui.tsx` líneas 82-130, 181-248) con la tabla de adaptación: colores semánticos→stone/amber (`bg-amber-500/15 text-amber-400`, warning→`orange-400`, success→`green-400`, danger→`red-400`, border→`stone-700`, card→`stone-800`, muted-foreground→`stone-400`); `StatusPill` recibe `mapa: "caso"|"dossier"|"run"` + `estado: string` y usa `etiquetaEstado` (iconos lucide: Loader2 girando para investigando/running, Clock para listo_admin, CheckCircle2 para confirmado/approved); `SignalChip` recibe `{ tipo, descripcion, peso }` (nuestro shape); `ScoreBadge` umbrales >70/≥40; `MiniMarkdown` se copia casi literal (primary→`text-amber-400`). → PASS → tests todos verdes → Commit `feat(web): primitivas de UI portadas de Lovable`.

## Task 3: ScoreGauge + integración en VerdictView
**Files:** Create `web/src/components/ScoreGauge.tsx` · Modify `web/src/components/VerdictView.tsx`
- [ ] Portar `ScoreGauge` (FUENTE líneas 132-179): SVG circle r=78 con dasharray animado; colores hex `#f87171/#f59e0b/#4ade80` por umbral >70/≥40; firma adaptada `{ score, frase, confianza }: { score: number; frase?: string; confianza?: string }` — la confianza se muestra textual ("confianza de la IA: alta").
- [ ] En `VerdictView`: reemplazar el div conic-gradient por `<ScoreGauge score={score} frase={fraseVeredicto(score)} confianza={verdict.confianza} />`; señales con `<SignalChip>`; añadir `<AIBadge />` junto al título de la sección que lo usa el padre — mantener TODOS los textos asertados (score numérico visible, /alta/, descripciones, @handles, "modo degradado", "Sin veredicto del agente"). `pnpm --filter web test` verde.
- [ ] Commit `feat(web): ScoreGauge SVG animado en el veredicto`.

## Task 4: BottomNav + header con pill de campañas
**Files:** Create `web/src/components/BottomNav.tsx` · Modify `web/src/app/(app)/layout.tsx`
- [ ] Portar `BottomNav` (FUENTE líneas 45-80) como client component: `usePathname()` de `next/navigation`, `Link` de `next/link`; props `{ role, activeCampaigns }`; items Casos(FileSearch) / Expedientes(CheckCircle2, solo admin) / Campañas(Megaphone, con punto ámbar si hay activas); grid dinámico `grid-cols-2`/`grid-cols-3` según items; clases: fijo abajo, `border-t border-stone-700 bg-stone-800/95 backdrop-blur pb-[env(safe-area-inset-bottom)]`, activo `text-amber-400`, `sm:hidden`.
- [ ] Layout: links de texto del header → `hidden sm:flex`; añadir pill de campañas (FUENTE líneas 19-27 adaptada: `bg-amber-500/15 text-amber-400` + punto `pulse-soft`) visible siempre que `campActivas > 0`; renderizar `<BottomNav role={role} activeCampaigns={campActivas ?? 0} />` antes de cerrar el div raíz; `<main className="p-4 pb-24 sm:pb-4">`.
- [ ] `tsc` + tests + build. Commit `feat(web): navegación inferior móvil y pill de campañas`.

## Task 5: Integraciones en pantallas
**Files:** Modify páginas de listas y `DossierPanel.tsx` · Create `web/src/app/(app)/{casos,expedientes,campanias}/loading.tsx`
- [ ] Listas: `/casos` items con `StatusPill mapa="caso"` + `ScoreBadge` + `PlatformBadge`; vacío → `EmptyState emoji="🐱" titulo="Ningún caso todavía" texto="¿Viste algo raro en redes? Carga la primera cuenta sospechosa." action={<Link className="btn-primary" href="/casos/nuevo">+ Nuevo caso</Link>}`; `/expedientes` vacío → `EmptyState 📂 "Sin expedientes pendientes"`; `/campanias` vacío → `EmptyState 📢 "No hay campañas activas"`.
- [ ] `DossierPanel`: vista solo-lectura usa `<MiniMarkdown text={dossier.content.resumen ?? ""} />` en vez de `<pre>`; chip de estado → `<StatusPill mapa="dossier" estado={dossier.status} />`.
- [ ] `loading.tsx` por ruta (3 archivos idénticos): `export default function Loading() { return (<div className="flex flex-col gap-3"><div className="h-24 rounded-2xl shimmer" /><div className="h-24 rounded-2xl shimmer" /><div className="h-24 rounded-2xl shimmer" /></div>); }`
- [ ] `pnpm --filter web test` verde + `tsc` + build. Commit `feat(web): pills, vacíos con personalidad, markdown y skeletons en pantallas`.

## Task 6: Verificación + merge
- [ ] Suite x2 + builds; revisión visual (móvil 375px: BottomNav, gauge animado, vacíos); merge a master + push (preferencia vigente).

## Self-Review
- 12 piezas del spec §1 → Tasks 2-5 ✅ · Tabla de adaptación §2 referenciada en cada task ✅ · Integraciones §3 (layout/VerdictView/DossierPanel/listas/loading) → Tasks 3-5 ✅ · Tests nuevos §4 (StatusPill/EmptyState/MiniMarkdown) → Task 2; textos asertados preservados → Task 3 ✅ · `/perfil` omitido (spec §1) ✅
