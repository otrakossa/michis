# michis — Fase 1 / Sub-proyecto 1: Gestión de casos — Documento de Diseño

**Fecha:** 2026-06-04
**Estado:** Diseño aprobado — pendiente de plan de implementación
**Contexto:** Primer sub-proyecto de la Fase 1 (MVP agéntico). Se apoya en la
Fase 0 ya integrada a master (esquema + RLS + worker con cola + PWA con login).
Diseño general en `2026-06-04-michis-design.md`.

---

## 1. Resumen

Permite a los activistas **crear, listar y ver casos** (cuentas sospechosas) y
**encolar su investigación** de forma controlada. El agente investigador NO
existe todavía (es el Sub-proyecto 2): un **handler stub** del worker ejercita el
pipeline completo de punta a punta para que el agente real se enchufe después
sin tocar nada más.

### Decisiones de alcance (validadas con el usuario)
- Alta de caso: **solo texto** (plataforma + handle + notas). Capturas y URLs de
  tweets llegan en iteraciones posteriores.
- Duplicados: **avisar y enlazar** al caso existente (no permitir, no fusionar).
- Investigación: **botón "Investigar" + handler stub** (no encolado automático).
- Sin realtime en este sub-proyecto (llega con el progreso del agente, Sub-2).
- Sin edición de notas post-creación (anotado para después).

### Descomposición de Fase 1 (acordada)
1. **Gestión de casos** ← este spec
2. Agente investigador (tools X API + similitud, guardarraíles, veredicto)
3. Expedientes + doble gate humano
4. Denuncia coordinada (push + conteo)

## 2. Enfoque técnico (elegido: A)

- **Lecturas y escrituras de casos:** el navegador habla directo con Supabase
  (supabase-js + sesión del usuario). La autorización la garantiza el **RLS de
  Fase 0** (`cases_select/insert/update/delete`).
- **Encolado:** la tabla `jobs` sigue cerrada a clientes (endurecimiento 0005).
  La única puerta es la RPC **`enqueue_investigation(case_id)`** (SECURITY
  DEFINER), que valida y crea run+job atómicamente.
- Descartados: Server Actions con service key (violaría "claves privilegiadas
  solo en el worker") e híbrido con Server Actions + sesión (boilerplate sin
  ganancia hoy).

## 3. Pantallas y flujo

Tres pantallas nuevas dentro del área protegida `(app)`:

| Ruta | Contenido |
|---|---|
| `/casos` | Lista de casos visibles (RLS decide: propios + compartidos; admin todo). Columnas: handle, plataforma, estado, creador. Filtro por estado. Botón "+ Nuevo caso". |
| `/casos/nuevo` | Form: plataforma (select: twitter/tiktok), handle (normalizado en vivo), notas (textarea). Pre-chequeo de duplicado **al enviar el formulario**: si existe, aviso "ya existe este caso →" con link y bloquea crear. |
| `/casos/[id]` | Detalle: datos, notas, botón **▶ Investigar** (RPC; muestra "investigación encolada"), lista de corridas (`investigation_runs` del caso con estado), botón Eliminar solo-admin (`RoleGate`). |

**Normalización de handle:** minúsculas, sin `@` inicial, trim. Vive en una
función pura `web/src/lib/handle.ts` (testeada) y se aplica antes de guardar y
antes del pre-chequeo.

**Ciclo de estados:**
```
caso: nuevo ──(RPC)──► investigando ──(worker stub)──► needs_review
run:  queued ──(worker toma job)──► running ──► needs_review
```

## 4. Cambios de datos — migración `0007`

1. **`alter table public.cases add column notes text;`** — contexto inicial del
   activista ("por qué lo marco"). Distinto de `evidence_items` (evidencia
   recolectada).
2. **Índice único anti-duplicados:**
   `create unique index cases_platform_handle_key on public.cases (platform, lower(handle));`
   La UI pre-chequea (UX amable); el índice es el backstop contra carreras — si
   dos activistas crean el mismo caso a la vez, el segundo insert falla y la UI
   lo convierte en el aviso "ya existe →".
3. **RPC `enqueue_investigation(p_case_id uuid) returns uuid`** (SECURITY
   DEFINER, `search_path = ''`):
   - Rechaza si `auth.uid()` es null ("No autenticado").
   - Rechaza si `not can_see_case(p_case_id)` ("Caso no visible").
   - Rechaza si existe `investigation_run` del caso en `queued`/`running`
     ("Ya hay una investigación en curso").
   - Inserta `investigation_run` (status `queued`) → inserta `job` tipo
     `investigate` con payload `{run_id, case_id}` → pasa el caso a
     `investigando`. Todo en una transacción. Devuelve `run_id`.
   - Permisos: `revoke execute ... from public, anon;`
     `grant execute ... to authenticated;`

## 5. Worker — handler stub `investigate`

Archivo nuevo `worker/src/investigate.ts`, registrado en `handlers.ts`. Se
**elimina el handler `noop`** de Fase 0 (cumplió su función).

Comportamiento del stub con payload `{run_id, case_id}`:
1. `investigation_run` → `running`, `started_at = now()`.
2. Escribe un `agent_step` (run_id, step_no 1, tool_name `stub`, reasoning
   "Agente no implementado aún (llega en Sub-proyecto 2)").
3. `investigation_run` → `needs_review`, `finished_at = now()`, `verdict`:
   `{ "stub": true, "summary": "Pendiente del agente investigador" }`.
4. `cases` → `needs_review`.

Si algo falla, el `tick()` existente ya captura y hace `failJob` (queda en
`jobs.last_error`). El stub ejercita el pipeline completo: RPC → cola → claim →
handler → run/steps → UI. El Sub-proyecto 2 reemplaza SOLO las tripas del
handler.

## 6. Manejo de errores

- La RPC lanza mensajes claros; la UI los traduce a texto amable ("Ya hay una
  investigación en curso", "ya existe este caso →" con link).
- Violación del índice único en el alta → la UI muestra el aviso de duplicado
  con link al existente (mismo camino que el pre-chequeo).
- Fallos del handler → `failJob` + `last_error` (visible para debug).

## 7. Testing

| Qué | Cómo | Dónde |
|---|---|---|
| Normalización de handle | Unit test puro (TDD) | `web/src/lib/handle.ts` + `web/src/test/handle.test.ts` |
| RPC enqueue (encola OK; rechaza corrida duplicada; revocada para anon) | Integración Vitest contra Supabase gestionado | `worker/test/enqueue.test.ts` |
| Índice único (2º insert igual falla) | Integración | mismo archivo |
| Handler `investigate` e2e (job→run needs_review + step + caso) | Integración con `tick()` | `worker/test/investigate.test.ts` |
| Form de alta (validación, aviso duplicado) | Component test (Testing Library/jsdom) | `web/src/test/` |

Los tests de integración viven en `worker/` porque ahí está la infraestructura
(Vitest + carga de `.env` raíz + cliente service role). Convención de datos de
prueba: handles con prefijo `test-` y limpieza en `beforeEach`.

## 8. Fuera de alcance (este sub-proyecto)

- Agente real, API de X, similitud de texto (Sub-2).
- Capturas de pantalla / URLs de tweets como evidencia en el alta.
- Edición de caso/notas post-creación; asignación (`assigned_to`); tags en UI.
- Realtime de progreso; notificaciones.
- Expedientes, aprobaciones, campañas (Sub-3 y Sub-4).
