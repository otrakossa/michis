# michis — Sistema visual "Calor militante" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-skin completo al sistema "Calor militante" (stone/amber, redondeado, lenguaje humano) sin tocar lógica ni datos; los 56 tests siguen verdes.

**Architecture:** Tokens = Tailwind estándar (stone/amber). Clases de componente en `globals.css`. Módulo `estados.ts` como única fuente de etiquetas humanas. VerdictView v2 con gauge + chips. Luego re-skin página por página.

**Tech Stack:** Tailwind 3, Next.js 15. **Spec:** `docs/superpowers/specs/2026-06-05-sistema-visual-design.md` (mockup de referencia: `.superpowers/brainstorm/558304-1780636514/content/sistema-visual-b.html`).

**Entorno:** pnpm en `~/.local/node-v22.15.1-linux-x64/bin/pnpm` si falta en PATH. Git: `git -c user.name="michis" -c user.email="kossa@nodolibre.org" commit ...`. REGLA DURA: cero cambios de lógica/datos — solo JSX/clases/textos de presentación. Los textos que asertan los tests existentes se conservan (ver cada tarea).

---

## Task 0: Rama
- [ ] `git checkout -b sistema-visual` → verificar.

## Task 1: Base — estados.ts (TDD) + clases de componente + manifest

**Files:** Create `web/src/lib/estados.ts`, `web/src/test/estados.test.ts` · Modify `web/src/app/globals.css`, `web/public/manifest.webmanifest`, `web/src/app/layout.tsx`

- [ ] **Step 1 (test PRIMERO):** `web/src/test/estados.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { ESTADO_CASO, ESTADO_DOSSIER, ESTADO_RUN, etiquetaEstado, fraseVeredicto } from "../lib/estados";

describe("estados humanos", () => {
  it("traduce estados de caso", () => {
    expect(etiquetaEstado(ESTADO_CASO, "needs_review")).toBe("esperando tu revisión");
    expect(etiquetaEstado(ESTADO_CASO, "investigando")).toBe("la IA está investigando…");
  });
  it("traduce dossier y run", () => {
    expect(etiquetaEstado(ESTADO_DOSSIER, "draft")).toBe("borrador — editable");
    expect(etiquetaEstado(ESTADO_RUN, "failed")).toBe("falló");
  });
  it("cae al valor crudo si el estado es desconocido", () => {
    expect(etiquetaEstado(ESTADO_CASO, "raro")).toBe("raro");
  });
  it("frase del veredicto por rango de score", () => {
    expect(fraseVeredicto(85)).toMatch(/Muy probablemente/);
    expect(fraseVeredicto(55)).toMatch(/señales sospechosas/);
    expect(fraseVeredicto(20)).toMatch(/Pocas señales/);
  });
});
```
- [ ] **Step 2:** `pnpm --filter web test estados` → FAIL.
- [ ] **Step 3:** `web/src/lib/estados.ts`:
```typescript
// Única fuente de etiquetas humanas. Los valores crudos del enum no se muestran.
export const ESTADO_CASO: Record<string, string> = {
  nuevo: "recién cargado",
  investigando: "la IA está investigando…",
  needs_review: "esperando tu revisión",
  confirmado: "confirmado ✓",
  descartado: "descartado",
};

export const ESTADO_DOSSIER: Record<string, string> = {
  draft: "borrador — editable",
  listo_admin: "pendiente de admin",
  approved: "aprobado",
};

export const ESTADO_RUN: Record<string, string> = {
  queued: "en cola",
  running: "investigando…",
  needs_review: "lista para revisar",
  done: "terminada",
  failed: "falló",
};

export function etiquetaEstado(mapa: Record<string, string>, estado: string): string {
  return mapa[estado] ?? estado;
}

export function fraseVeredicto(score: number): string {
  if (score > 70) return "Muy probablemente es una cuenta sintética";
  if (score >= 40) return "Hay señales sospechosas";
  return "Pocas señales de bot";
}
```
- [ ] **Step 4:** PASS. Añadir a `web/src/app/globals.css` (después de las @tailwind):
```css
@layer components {
  .card { @apply rounded-xl bg-stone-800 p-4; }
  .btn-primary { @apply rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-stone-900 disabled:opacity-50; }
  .btn-ghost { @apply rounded-xl bg-stone-700 px-4 py-2 text-sm text-stone-200 disabled:opacity-50; }
  .btn-danger { @apply rounded-xl border border-red-900 px-4 py-2 text-sm text-red-400; }
  .chip { @apply rounded-full bg-stone-900 px-3 py-1 text-xs text-stone-200; }
  .badge-accion { @apply rounded-full bg-amber-500 px-2 py-0.5 text-xs font-extrabold text-stone-900; }
}
```
- [ ] **Step 5:** `manifest.webmanifest`: `background_color` y `theme_color` → `"#1c1917"`. En `web/src/app/layout.tsx` (raíz): body `className` → `"min-h-screen bg-stone-900 text-stone-50 antialiased"`.
- [ ] **Step 6:** `pnpm --filter web test` verdes + `pnpm --filter web build` OK. Commit `feat(web): base del sistema visual (estados humanos, clases, tokens)`.

## Task 2: VerdictView v2 (gauge + chips)

**Files:** Modify `web/src/components/VerdictView.tsx` (reescritura completa). Los tests existentes (`verdictView.test.tsx`) NO se tocan y deben seguir verdes (asertan: "85", /alta/, /postea sin dormir/, /@otra/, /modo degradado/i, /Sin veredicto del agente/).

- [ ] **Step 1:** Reescribir `VerdictView.tsx` (misma interfaz `VerdictData`, solo presentación):
```tsx
import { fraseVeredicto } from "@/lib/estados";

export interface VerdictData {
  score?: number;
  confianza?: string;
  senales?: { tipo: string; descripcion: string; peso: number }[];
  cuentas_vinculadas?: { handle: string; relacion: string; razon: string }[];
  modo_degradado?: boolean;
  parcial?: boolean;
  stub?: boolean;
  summary?: string;
}

function pesoDots(peso: number): string {
  const p = Math.max(0, Math.min(5, Math.round(peso)));
  return "●".repeat(p) + "○".repeat(5 - p);
}

export function VerdictView({ verdict }: { verdict: VerdictData }) {
  if (verdict.stub || verdict.score == null) {
    return <p className="text-stone-400">Sin veredicto del agente todavía.</p>;
  }
  const score = verdict.score;
  const color = score > 70 ? "#f87171" : score >= 40 ? "#f59e0b" : "#4ade80";

  return (
    <div className="card flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <div
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full"
          style={{ background: `conic-gradient(${color} 0% ${score}%, #44403c ${score}% 100%)` }}
        >
          <div
            className="flex h-[52px] w-[52px] items-center justify-center rounded-full bg-stone-800 text-xl font-extrabold"
            style={{ color }}
          >
            {score}
          </div>
        </div>
        <div>
          <p className="font-bold">{fraseVeredicto(score)}</p>
          <p className="text-sm text-stone-400">confianza: {verdict.confianza}</p>
        </div>
        <div className="ml-auto flex flex-col items-end gap-1">
          {verdict.modo_degradado && (
            <span className="rounded-full bg-amber-950 px-2 py-0.5 text-xs text-orange-400">modo degradado</span>
          )}
          {verdict.parcial && (
            <span className="rounded-full bg-red-950 px-2 py-0.5 text-xs text-red-400">parcial</span>
          )}
        </div>
      </div>

      {(verdict.senales ?? []).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {verdict.senales!.map((s, i) => (
            <span key={i} className="chip">
              {s.tipo.replace(/_/g, " ")} · {s.descripcion}{" "}
              <b style={{ color: s.peso >= 4 ? "#f87171" : "#fb923c" }}>{pesoDots(s.peso)}</b>
            </span>
          ))}
        </div>
      )}

      {(verdict.cuentas_vinculadas ?? []).length > 0 && (
        <div className="text-sm">
          <h3 className="mb-1 text-stone-400">Cuentas posiblemente vinculadas</h3>
          <div className="flex flex-wrap gap-2">
            {verdict.cuentas_vinculadas!.map((c, i) => (
              <span key={i} className="chip font-mono">
                @{c.handle} <span className="font-sans text-stone-400">· {c.relacion.replace(/_/g, " ")} · {c.razon}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```
- [ ] **Step 2:** `pnpm --filter web test` → TODOS verdes (incl. verdictView sin cambios). `tsc --noEmit` OK. Commit `feat(web): VerdictView v2 con medidor y chips de señales`.

## Task 3: Nav + Login

**Files:** Modify `web/src/app/(app)/layout.tsx`, `web/src/app/login/page.tsx`

- [ ] **Step 1 — Nav:** header → `className="flex items-center justify-between border-b border-stone-700 bg-stone-800 p-4"`; marca → `<span className="font-extrabold">🐱 michis</span>`; links → `text-sm text-stone-300 hover:text-orange-400`; badge campañas → clase `badge-accion`; texto usuario → `text-sm text-stone-400`. No tocar lógica (role, count).
- [ ] **Step 2 — Login:** título → `<h1 className="text-center text-3xl font-extrabold">🐱 michis</h1>` + subtítulo `<p className="text-center text-sm text-stone-400">investigación y denuncia coordinada de bots</p>`; inputs → `rounded-xl bg-stone-800 p-3`; botón → clase `btn-primary` (texto "Entrar"); error igual; nota final igual.
- [ ] **Step 3:** `tsc --noEmit` + tests verdes + build OK. Commit `feat(web): nav y login al sistema visual`.

## Task 4: Casos (lista, alta, detalle)

**Files:** Modify `web/src/app/(app)/casos/page.tsx`, `casos/nuevo/page.tsx`, `casos/[id]/page.tsx`, `web/src/components/{InvestigateButton,DeleteCaseButton,DossierPanel}.tsx`

REGLA: solo clases/JSX/etiquetas. Importar `ESTADO_CASO, ESTADO_DOSSIER, ESTADO_RUN, etiquetaEstado` de `@/lib/estados` donde se muestren estados. NO cambiar queries ni handlers. El test `casoNuevoForm` aserta el placeholder `"@handle"`, el texto del botón `"Crear caso"` y el mensaje `/Handle inválido/` — conservarlos.

- [ ] **Step 1 — Lista:** botón "+ Nuevo caso" → `btn-primary`; filtros de estado → chips (`chip` + activo con `!bg-amber-500 !text-stone-900 font-bold`), etiqueta humana vía `etiquetaEstado(ESTADO_CASO, e)`; items → `card flex items-center justify-between hover:ring-1 hover:ring-amber-500/50` con estado humano en `text-stone-400`.
- [ ] **Step 2 — Alta:** inputs/textarea/select → `rounded-xl bg-stone-800 p-3`; botón → `btn-primary`; aviso duplicado igual (texto intacto) en `text-orange-400`.
- [ ] **Step 3 — Detalle:** cabecera: handle `text-2xl font-extrabold font-mono`, línea de meta con `etiquetaEstado(ESTADO_CASO, caso.status)` en `text-orange-400 font-semibold`; bloque Notas → `card`; lista de corridas → `card` por item con `etiquetaEstado(ESTADO_RUN, r.status)`. `InvestigateButton` → `btn-primary` (texto "▶ Investigar" igual); `DeleteCaseButton` → `btn-danger`; `DossierPanel`: contenedor `card`, chip de estado vía `etiquetaEstado(ESTADO_DOSSIER, dossier.status)` (reemplaza el STATUS_LABEL local — eliminarlo), textarea `rounded-xl bg-stone-900 p-3 font-mono text-sm`, "Guardar" → `btn-ghost`, "Elevar al admin" → `btn-primary`.
- [ ] **Step 4:** tests verdes + `tsc` + build. Commit `feat(web): pantallas de casos al sistema visual`.

## Task 5: Expedientes + Campañas

**Files:** Modify `web/src/app/(app)/expedientes/page.tsx`, `campanias/page.tsx`, `campanias/[id]/page.tsx`, `web/src/components/{ResolveButtons,CampaignProgress,YaReporteButton,CerrarCampaniaButton,ActivateCampaignButton}.tsx`

- [ ] **Step 1 — /expedientes:** items → `card`; "Aprobar" → `btn-primary`; "Devolver" → `btn-ghost` con texto `text-orange-400`.
- [ ] **Step 2 — Campañas:** lista: activas → `card ring-1 ring-amber-500/40`, cerradas → `card opacity-70` con resultado; detalle: instrucciones → `card`; link reporte → `btn-ghost` (texto igual "🔗 Abrir mecanismo de reporte"); "✋ Ya reporté" → `btn-primary px-6 py-3 text-base`; CerrarCampania → `btn-ghost`; ActivateCampaign: botón inicial → `btn-primary` (texto igual), form → `card` con inputs `rounded-xl bg-stone-900 p-2`.
- [ ] **Step 3 — CampaignProgress:** barra → `h-3 rounded-full bg-stone-700` con fill `bg-gradient-to-r from-amber-500 to-orange-400`; texto → `text-sm text-stone-300` con números en `font-bold text-amber-400` (el test aserta el TEXTO `3 / 10 ya reportaron` — el string exacto se conserva, solo cambia el wrapper).
- [ ] **Step 4:** tests verdes + `tsc` + build. Commit `feat(web): expedientes y campañas al sistema visual`.

## Task 6: Verificación integral
- [ ] `pnpm -r test` x2 → 56+ verdes estables. Builds OK.
- [ ] Revisión visual manual (humano/controlador): las 7 pantallas en móvil (375px) y escritorio; chequear contraste de textos `stone-400` sobre `stone-800/900`.
- [ ] Commit final si quedó algo; merge a master + push (preferencia vigente del usuario).

## Self-Review
- Tokens/clases (spec §2) → Task 1 ✅ · Lenguaje humano §3 → Tasks 1, 4, 5 (estados.ts + uso) ✅ · Componentes §4 (VerdictView v2, nav, botones, tarjetas, progreso, login, PWA) → Tasks 1-5 ✅ · Alcance §5 (7 pantallas) → Tasks 3-5 ✅ · Restricciones §6 (cero lógica, tests intactos + estados.test nuevo) → explícito en cada tarea ✅
- Textos asertados por tests, preservados: "85"/confianza/señal/@otra/"modo degradado"/"Sin veredicto" (VerdictView), "@handle"/"Crear caso"/"Handle inválido" (form), "3 / 10 ya reportaron" (progreso) ✅
