# michis — Fase 1 / Sub-proyecto 4: Denuncia coordinada — Diseño

**Fecha:** 2026-06-05
**Estado:** Diseño aprobado — pendiente de plan
**Contexto:** Último sub-proyecto de Fase 1. Convierte un caso `confirmado`
(Sub-3) en acción colectiva: campaña de denuncia, participación individual
("ya reporté") y conteo de progreso. Diseños previos en `docs/superpowers/specs/`.

## 1. Decisiones validadas
- **In-app ahora, push web después:** campañas visibles con badge en el nav;
  el push real (VAPID/SW/permisos) queda para la siguiente iteración.
- **"Ya reporté" de un toque**, sin captura (la columna `proof_path` ya existe
  para añadirla después).
- **Conteo "en vivo" por sondeo ligero (5 s)** vía RPC de progreso. Realtime de
  Supabase no sirve aquí: los eventos respetan RLS y un activista solo ve sus
  propias `denuncia_actions`. La RPC SECURITY DEFINER devuelve agregados sin
  exponer identidades.

## 2. Flujo
```
caso confirmado → [admin] activar_campania() → campaña active
  → activistas: /campanias → detalle → reportan en X → "ya reporté" (1/persona)
  → progreso {reportes}/{total activistas activos}
  → [admin] cerrar_campania(resultado) → closed + resultado en historial
```

## 3. Datos — migración 0011
1. `alter table denuncia_campaigns add column resultado text;`
2. Una activa por caso:
   `create unique index denuncia_campaigns_active_key on denuncia_campaigns (case_id) where status = 'active';`
3. **RPC `activar_campania(p_case_id uuid, p_instructions text, p_report_url text) returns uuid`**
   (SECURITY DEFINER; revoke public/anon, grant authenticated; valida adentro):
   `is_admin()` ("Solo un admin puede activar campañas"); caso existe y status
   `confirmado` ("El caso debe estar confirmado"); inserta campaign `active` con
   `instructions`, `report_links = jsonb {url: p_report_url}`,
   `started_by = auth.uid()`. El índice único parcial rechaza una segunda activa
   (la RPC traduce a "Ya hay una campaña activa para este caso").
4. **RPC `cerrar_campania(p_campaign_id uuid, p_resultado text) returns void`**:
   `is_admin()`; exige status `active`; set `closed` + `resultado`.
5. **RPC `progreso_campania(p_campaign_id uuid) returns table(reportes int, total int)`**
   (SECURITY DEFINER; grant authenticated): `reportes` = count de
   `denuncia_actions` de la campaña; `total` = count de `profiles` con
   `active = true`. Solo agregados.
6. **Endurecimiento RLS:** recrear `actions_insert` añadiendo que la campaña
   esté `active`:
   `with check (user_id = auth.uid() and exists (select 1 from denuncia_campaigns c where c.id = campaign_id and c.status = 'active'))`.

## 4. UI
- **Nav:** link "Campañas" para todos + badge con el nº de campañas activas
  (conteo server-side en el layout por request).
- **`/campanias`** (server): activas arriba con barra de progreso (RPC progreso
  por campaña); cerradas abajo con `resultado`.
- **`/campanias/[id]`** (server + client):
  - handle/plataforma del caso (link al caso), instrucciones, botón
    "Abrir reporte en X" (usa `report_links.url`; `target="_blank"`).
  - **`YaReporteButton`** (client): insert en `denuncia_actions`; si error
    `23505` → "Ya habías reportado ✓"; si RLS rechaza (campaña cerrada) →
    mensaje claro. Tras éxito refresca el progreso.
  - **`CampaignProgress`** (client): barra + "X / Y ya reportaron"; sondea
    `progreso_campania` cada 5 s mientras está montado; muestra si YO ya
    reporté (consulta de mis propias actions, que el RLS sí permite).
  - **Admin:** botón "Cerrar campaña" (prompt de resultado → RPC + refresh).
- **`/casos/[id]`:** si el caso está `confirmado`, el ADMIN ve
  **`ActivateCampaignButton`** (form inline: instrucciones + URL de reporte →
  RPC → redirige a la campaña). Si ya hay activa, link a ella en su lugar.

## 5. Testing
| Qué | Cómo |
|---|---|
| `activar_campania`: admin ok / activista rechazado / caso no confirmado rechazado / segunda activa rechazada | Integración (usuarios activista+admin de prueba) |
| `cerrar_campania`: cierra con resultado; rechaza no-admin y no-activa | Integración |
| `progreso_campania`: cuenta reportes y total | Integración |
| "ya reporté": ok una vez; duplicado 23505; en campaña cerrada el RLS lo rechaza | Integración |
| `CampaignProgress` render (X/Y, barra) | Component test con fetch mockeado |

Convenciones vigentes (tests secuenciales en `worker/test/`, datos `test-*`).

## 6. Fuera de alcance
- Push web real (VAPID/SW) — siguiente iteración.
- Captura de prueba al reportar (Storage) — siguiente iteración.
- Notificación al admin de nuevos expedientes — junto con push.
