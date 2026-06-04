# michis — Fase 1 / Sub-proyecto 2: Agente investigador — Documento de Diseño

**Fecha:** 2026-06-04
**Estado:** Diseño aprobado — pendiente de plan de implementación
**Contexto:** Segundo sub-proyecto de Fase 1. Reemplaza las "tripas" del handler
stub `investigate` (Sub-1) por el agente real. Diseño general en
`2026-06-04-michis-design.md`; Sub-1 en `2026-06-04-fase1-gestion-casos-design.md`.

---

## 1. Resumen

El **agente investigador**: un bucle acotado de *tool use* con Claude que, dado
un caso, decide qué herramientas consultar, razona sobre la evidencia y emite un
**veredicto estructurado** con score, señales, cuentas vinculadas y borrador de
expediente. Cada paso queda auditado en `agent_steps`.

### Decisiones validadas con el usuario
- **Runtime:** bucle propio con el SDK de Anthropic (tool use nativo). NO Claude
  Agent SDK (control fino de auditoría/presupuesto), NO pipeline de una pasada
  (mataría la estrategia agéntica progresiva).
- **Modelo:** `claude-sonnet-4-6` (balance calidad/costo).
- **Guardarraíles estándar:** máx **8 iteraciones**, tope **~US$0.50** por
  investigación.
- **Modo degradado:** SÍ — sin clave de X el agente investiga con notas +
  similitud interna y lo declara en el veredicto. Sin `ANTHROPIC_API_KEY`, el
  handler cae al stub actual (un deploy sin claves nunca rompe).
- **Idioma del prompt/contexto:** español latinoamericano.
- La API de X se asume tier Basic, detrás de una interfaz `XClient`
  intercambiable (`MockXClient` hasta tener la clave).

## 2. Módulos

```
worker/src/agent/
  runtime.ts        ← el bucle (caso + tools + límites → veredicto)
  llm.ts            ← interfaz LlmClient + impl Anthropic (inyectable)
  budget.ts         ← contador tokens→USD y corte por tope
  prompt.ts         ← system prompt del investigador (es-LA)
  xclient.ts        ← interfaz XClient + MockXClient (+ RealXClient futuro)
  tools/
    types.ts        ← interfaz AgentTool { name, description, input_schema, execute }
    perfilX.ts      ← tool "perfil_x"
    similitud.ts    ← tool "similitud_texto"
    finalizar.ts    ← tool "finalizar_investigacion" (schema = veredicto)
worker/src/investigate.ts   ← MODIFICAR: orquesta runtime + persistencia
```

Principio: `runtime.ts` recibe `LlmClient` y las tools **inyectadas** — Anthropic
real en producción, fakes en tests (los tests no queman dinero).

## 3. Tools

| Tool | Entrada | Salida | Sin clave de X |
|---|---|---|---|
| `perfil_x` | `{ handle }` | perfil vía `XClient`: fecha de creación, métricas, ratio seguidos/seguidores, últimos N tweets con timestamps, resumen de horarios | Mock devuelve `{ disponible: false }`; el agente lo declara en el veredicto |
| `similitud_texto` | `{ texto }` | top 5 casos de la BD con notas/contenido similar + score (función SQL `find_similar_cases`, extensión `pg_trgm`) | Funciona igual (interna) |
| `finalizar_investigacion` | el veredicto (schema §4) | termina el bucle | Funciona igual |

**Migración 0008:** `create extension if not exists pg_trgm;` + función
`find_similar_cases(p_texto text, p_exclude_case uuid)` → tabla
`(case_id uuid, handle text, similarity real)` con los 5 casos más parecidos por
`similarity(notes, p_texto)`, umbral mínimo 0.1, excluyendo el caso investigado.
SECURITY DEFINER no necesaria: la llama solo el worker (service role).

## 4. Veredicto (schema de `finalizar_investigacion`)

```json
{
  "score": 78,
  "confianza": "media",
  "senales": [
    { "tipo": "actividad_24_7", "descripcion": "...", "peso": 4 },
    { "tipo": "texto_duplicado", "descripcion": "coincide con @otro_caso", "peso": 5 }
  ],
  "cuentas_vinculadas": [
    { "handle": "otra_cuenta", "relacion": "mismo_texto", "razon": "..." }
  ],
  "resumen": "borrador del expediente en markdown",
  "modo_degradado": true
}
```
- `score`: 0-100. `confianza`: baja|media|alta. `peso`: 1-5.
- `relacion`: uno de los valores del enum `link_relation` existente
  (`mismo_texto` | `amplificacion_coordinada` | `mismo_avatar`).
- El runtime añade `parcial: true` si cerró por iteraciones/presupuesto.

### Persistencia al cerrar
- Veredicto completo → `investigation_runs.verdict` + run `needs_review` +
  `iterations`, `tokens_used`, `cost` reales. El runtime añade al jsonb un campo
  `summary` (= `resumen`) por compatibilidad con la UI del detalle de Sub-1, que
  lee `verdict.summary`.
- `score` → `cases.risk_score`; `confianza` → `cases.confidence`
  (baja=0.3, media=0.6, alta=0.9); caso → `needs_review`.
- `cuentas_vinculadas` cuyo handle ya sea un caso (misma plataforma) → arista en
  `case_links` (`relation_type` = relacion, `weight` = peso máx de la señal
  asociada /5 o 0.6 por defecto, `discovered_by: 'agente'`). Las demás quedan
  solo en el veredicto (sin recursión en Fase 1; el activista decide crearlas).
- Resultado de `perfil_x` → `evidence_items` (`type: 'perfil_x'`,
  `source: 'tool'`, payload jsonb).
- Cada vuelta del bucle → `agent_steps` (input/output/reasoning) — ya existente.

## 5. El bucle (runtime)

```
mensajes = [system(prompt es-LA con datos del caso), user("investiga @handle")]
mientras iter < 8 y costo < 0.50:
    resp = llm.create({ model: sonnet, tools, mensajes })   // system con prompt caching
    registrar agent_step + acumular tokens/costo
    si resp llama finalizar_investigacion → cierre normal
    si resp llama otra tool → ejecutarla → push tool_result → continuar
    si resp no llama tools → push recordatorio "debes usar finalizar_investigacion"
al agotar iteraciones/presupuesto:
    última llamada con tool_choice forzado a finalizar_investigacion
    → veredicto con parcial: true
```

## 6. Guardarraíles y errores

1. **Tool falla** (ej. 429 de X) → se devuelve al agente como `tool_result` de
   error; él decide (reintentar / seguir sin el dato / finalizar).
2. **API de Claude falla** → 1 reintento con backoff; si persiste → `failJob`
   (queda en `jobs.last_error`) y run `failed`.
3. **Sin `ANTHROPIC_API_KEY`** → el handler ejecuta el comportamiento stub
   actual (degradación elegante; deploy nunca roto).
4. **Sin `X_BEARER_TOKEN`** → `MockXClient` → `modo_degradado: true`.
5. **Prompt caching** en el system prompt (cache_control) para abaratar el bucle.
6. Config nueva en `worker/src/config.ts`: `ANTHROPIC_API_KEY` (opcional),
   `X_BEARER_TOKEN` (opcional), `AGENT_MAX_ITERATIONS` (default 8),
   `AGENT_BUDGET_USD` (default 0.50).

## 7. Testing

| Qué | Cómo | Costo |
|---|---|---|
| Bucle: orden tools→veredicto, auditoría | FakeLlm guionado (unit) | $0 |
| Corte por iteraciones y por presupuesto | FakeLlm que nunca finaliza; budget unit | $0 |
| `find_similar_cases` / tool similitud | Integración contra Supabase gestionado | $0 |
| `MockXClient` + tool perfil_x | Unit | $0 |
| Handler investigate completo (job → verdict + steps + case_links persistidos) | Integración con FakeLlm inyectado | $0 |
| Smoke real con Claude | 1 test gated por `RUN_REAL_AGENT_TEST=1`, fuera de la suite normal | ~$0.10 |

Convenciones de Sub-1 se mantienen: tests de integración en `worker/test/`,
secuenciales (`fileParallelism: false`), datos `test-*` con limpieza.

## 8. Fuera de alcance
- `RealXClient` (llega cuando el usuario consiga la clave; solo se implementa la
  interfaz + mock).
- Recursión automática de granjas, reverse-image, Perplexity/OSINT (Fase 2).
- UI nueva: el detalle del caso ya muestra el veredicto vía `verdict.summary`;
  una vista rica del veredicto/señales llega con el Sub-3 (expedientes).
- Expedientes/aprobaciones (Sub-3), campañas (Sub-4).
