# michis — Fase 1 / Sub-proyecto 3: Expedientes + doble gate humano — Diseño

**Fecha:** 2026-06-04
**Estado:** Diseño aprobado — pendiente de plan de implementación
**Contexto:** Tercer sub-proyecto de Fase 1. Convierte el veredicto del agente
(Sub-2) en un expediente revisado por humanos y aprobado por el admin — la
antesala de la denuncia coordinada (Sub-4). Diseños previos en
`2026-06-04-michis-design.md`, `...gestion-casos-design.md`,
`...agente-investigador-design.md`.

---

## 1. Decisiones validadas con el usuario
- **Generación automática:** el worker crea el dossier borrador al terminar la
  investigación, desde el veredicto.
- **Editable:** el activista puede editar el contenido (markdown) mientras está
  en `draft`.
- **Colaborativo:** cualquier activista que vea el caso puede revisar y elevar
  el expediente; queda estampado quién lo hizo.
- **Enfoque A (autorización):** edición de contenido por UPDATE directo bajo
  RLS; transiciones de estado SOLO por RPCs SECURITY DEFINER que estampan
  quién/cuándo (el cliente nunca pone los sellos de auditoría).

## 2. Flujo de estados

```
agente termina → dossier draft (worker; editable) 
  → [activista] elevar_expediente() → listo_admin
      → [admin] resolver_expediente('aprobar') → approved + caso confirmado
      → [admin] resolver_expediente('devolver') → draft (conserva contenido)
```

Acciones de caso ya existentes no cambian: descartar caso sigue siendo del
creador/admin (update de `cases`); re-investigar sigue vía
`enqueue_investigation`.

## 3. Cambios de datos

**Migración 0009** (sola — Postgres no permite añadir un valor de enum y usarlo
en la misma transacción):
```sql
alter type public.dossier_status add value if not exists 'listo_admin';
```

**Migración 0010:**
1. `alter table dossiers add column submitted_by uuid references profiles(id);`
   y `submitted_at timestamptz`.
2. Política `dossiers_update_activista`: UPDATE si `can_see_case(case_id)` y
   `status = 'draft'`, `with check (can_see_case(case_id) and status = 'draft')`
   → el activista edita contenido pero no puede mover el status (las
   transiciones van por RPC; la política de admin existente queda igual).
3. **RPC `elevar_expediente(p_dossier_id uuid) returns void`** (SECURITY
   DEFINER, `search_path=''`; revoke public/anon, grant authenticated):
   - rechaza sin sesión; rechaza si el caso no es visible (`can_see_case`);
   - rechaza si el dossier no está en `draft` ("El expediente no está en borrador");
   - set `status='listo_admin'`, `submitted_by=auth.uid()`, `submitted_at=now()`.
4. **RPC `resolver_expediente(p_dossier_id uuid, p_decision text) returns void`**
   (SECURITY DEFINER; revoke public/anon, grant authenticated, valida
   `is_admin()` adentro → "Solo un admin puede resolver expedientes"):
   - exige status `listo_admin` ("El expediente no está pendiente de admin");
   - `p_decision = 'aprobar'` → dossier `approved`, `approved_by=auth.uid()`;
     caso → `confirmado`;
   - `p_decision = 'devolver'` → dossier `draft` (contenido intacto);
   - otra decisión → error "Decisión inválida".

## 4. Cambio en el worker (`investigate.ts`)

Tras persistir el veredicto, **upsert del dossier**:
- Sin dossier para el caso → insertar `draft` con
  `content = { resumen, score, confianza, senales, modo_degradado, parcial }`,
  `generated_by = null` (autor = agente).
- Dossier existente en `draft` → actualizar `content` y `version = version + 1`.
- Dossier en `listo_admin` o `approved` → NO tocar (no se pisa trabajo humano;
  el veredicto nuevo queda en su `investigation_run`).

## 5. UI

**`/casos/[id]`** — dos bloques nuevos:
1. **Veredicto** (vista rica adeudada del Sub-2): score 0-100 con color
   (<40 verde, 40-70 ámbar, >70 rojo), confianza, tabla de señales (tipo,
   descripción, peso), cuentas vinculadas, badges `modo degradado` / `parcial`.
   Se alimenta del `verdict` de la última corrida.
2. **Expediente**: si `draft` → textarea editable (campo `content.resumen`) con
   guardar + botón "Elevar al admin" (RPC); si `listo_admin`/`approved` → solo
   lectura + quién lo elevó/aprobó. Errores de RPC traducidos (patrón Sub-1).

**`/expedientes`** — página **solo-admin** (el layout/página valida el rol en el
SERVIDOR y redirige si no es admin; `RoleGate` es solo cosmético): lista de
dossiers `listo_admin` (handle del caso, score, quién elevó, cuándo) con
botones **Aprobar** / **Devolver** → RPC `resolver_expediente` + refresh.

**Header:** link "Expedientes" visible solo para admin (el rol ya se carga en el
layout de `(app)`; pasa a renderizar el nav condicionado).

## 6. Testing

| Qué | Cómo |
|---|---|
| `elevar_expediente`: ok desde draft + estampa; rechaza no-draft; rechaza sin sesión | Integración (usuario activista de prueba) |
| `resolver_expediente`: aprueba → dossier approved + caso confirmado; devuelve → draft; **rechaza si no es admin**; rechaza si no está listo_admin | Integración (usuario activista + usuario admin de prueba promovido vía service role) |
| RLS edición: activista edita content en draft; NO puede editar en listo_admin; NO puede cambiar status por UPDATE directo | Integración |
| Upsert del worker: crea draft; re-run refresca content/version; respeta listo_admin | Integración con FakeLlm |
| Vista del veredicto (score/señales render) | Component test (jsdom) |

Convenciones vigentes: tests en `worker/test/` (secuenciales, datos `test-*`),
component tests en `web/src/test/`.

## 7. Fuera de alcance
- Comentarios/discusión sobre expedientes (futuro).
- Notificaciones al admin cuando algo queda `listo_admin` (llega con Sub-4/push).
- Historial de versiones del expediente navegable (solo contador `version`).
- Campañas de denuncia (Sub-4).
