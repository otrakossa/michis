# michis — Sistema visual "Calor militante" — Diseño

**Fecha:** 2026-06-05
**Estado:** Diseño aprobado (validado visualmente con mockups en el companion;
elegido entre 4 direcciones) — pendiente de plan.
**Mockups de referencia:** `.superpowers/brainstorm/558304-1780636514/content/`
(`direccion-visual.html`, `sistema-visual-b.html`).

## 1. Dirección elegida

**"Calor militante":** oscuro cálido (tonos tierra), ámbar como color de acción,
esquinas redondeadas, **lenguaje humano** en los estados. Cercano y de
colectivo, no "dashboard corporativo". Mobile-first (los 200 usan el teléfono).

## 2. Tokens

| Token | Valor | Tailwind |
|---|---|---|
| Fondo app | `#1c1917` | `stone-900` |
| Tarjeta / superficie | `#292524` | `stone-800` |
| Borde sutil | `#44403c` | `stone-700` |
| Texto principal | `#fafaf9` | `stone-50` |
| Texto secundario | `#a8a29e` | `stone-400` |
| **Acción (primario)** | `#f59e0b` | `amber-500` (texto oscuro encima) |
| Alerta / atención | `#fb923c` | `orange-400` |
| OK / bajo riesgo | `#4ade80` | `green-400` |
| Peligro / alto riesgo | `#f87171` | `red-400` |

Los valores SON la paleta estándar stone/amber de Tailwind → se usan clases
estándar, sin theme custom. Tipografía: system-ui, títulos en peso 700/800;
handles y contenido técnico en monospace. Radios: `rounded-xl`/`rounded-2xl`
(tarjetas), `rounded-full` (chips/badges). Botón primario: fondo ámbar, texto
`stone-900`, peso 700-800.

**Clases de componente** en `globals.css` (capa `@layer components`) para no
repetir tailwind largo: `.card` (superficie), `.btn-primary`, `.btn-ghost`,
`.btn-danger`, `.chip`, `.badge-accion`. Regla: si un patrón aparece 3+ veces,
es clase de componente.

## 3. Lenguaje humano (pieza central)

Nuevo módulo `web/src/lib/estados.ts`: mapas estado→etiqueta humana, ÚNICA
fuente para toda la UI (testeado):

- caso: `nuevo`→"recién cargado" · `investigando`→"la IA está investigando" ·
  `needs_review`→"esperando tu revisión" · `confirmado`→"confirmado ✓" ·
  `descartado`→"descartado"
- dossier: `draft`→"borrador — editable" · `listo_admin`→"pendiente de admin" ·
  `approved`→"aprobado"
- run: igual criterio (`running`→"investigando…", `failed`→"falló").
- Veredicto por score: `>70`→"Muy probablemente es una cuenta sintética" ·
  `40-70`→"Hay señales sospechosas" · `<40`→"Pocas señales de bot".

Los valores crudos del enum dejan de mostrarse al usuario (siguen en BD/API).

## 4. Componentes rediseñados

1. **`VerdictView` v2:** medidor circular (conic-gradient) con el score y color
   por rango (verde<40/ámbar/rojo>70), frase humana del veredicto, **señales
   como chips** con puntos de peso (`●●●●○`, color por peso), vinculadas como
   chips con handle mono. Badges `modo degradado`/`parcial` en ámbar.
   *Mantiene los textos que asertan los tests actuales (score, confianza,
   descripción de señal, @handle, "modo degradado").*
2. **Nav:** fondo `stone-800`, marca "🐱 michis" peso 800, link activo en
   `orange-400`, badge de campañas en ámbar con texto oscuro.
3. **Botones:** primario ámbar (Investigar, Elevar, Ya reporté, Activar);
   ghost (Guardar, Cerrar campaña); danger borde rojo (Eliminar).
4. **Tarjetas de listas** (casos, expedientes, campañas): superficie
   `stone-800` `rounded-xl`, estados como chips humanos, hover con borde ámbar.
5. **Barra de progreso de campaña:** gradiente ámbar→naranja, números grandes.
6. **Login:** centrado, 🐱 + "michis" grande, inputs `stone-800` redondeados,
   botón ámbar.
7. **PWA:** `manifest.webmanifest` `theme_color`/`background_color` → `#1c1917`.

## 5. Alcance por pantalla

Re-skin de TODO lo existente (sin cambios de lógica ni de datos):
`layout` (nav) · `login` · `/casos` (lista+filtros como chips) · `/casos/nuevo` ·
`/casos/[id]` (cabecera, VerdictView v2, DossierPanel, bloque campaña) ·
`/expedientes` · `/campanias` y `/campanias/[id]` · componentes (botones).

## 6. Restricciones y testing

- **Cero cambios de lógica/datos**: solo presentación + el módulo `estados.ts`.
- Los tests existentes deben seguir verdes; los textos que asertan se conservan.
- Nuevo test unit de `estados.ts` (mapas completos, fallback a valor crudo si
  llega un estado desconocido).
- Verificación: suite completa + build + revisión visual manual (companion o
  navegador) de las 7 pantallas en móvil (viewport angosto) y escritorio.

## 7. Fuera de alcance
- Iconos PWA finales (icon-192/512) — se generan al desplegar.
- Modo claro; animaciones complejas; ilustraciones custom.
- Cambios de flujo o navegación (solo piel).
