# michis — Documento de Diseño

**Fecha:** 2026-06-04
**Estado:** Diseño aprobado — pendiente de plan de implementación
**Autor(es):** Equipo michis (2-3 personas)

---

## 1. Resumen ejecutivo

**michis** es una plataforma web (PWA responsive) para un colectivo cerrado de
~200 activistas de causas sociales que, asistidos por IA, **investigan,
documentan y denuncian de forma coordinada cuentas bot / contenido sintético**
en redes sociales (X/Twitter primero, TikTok después).

La estrategia es **agéntica progresiva**: un agente de IA (Claude) conduce las
investigaciones usando herramientas enchufables, con la "correa corta" en Fase 1
(acotado, con gates humanos) y mayor autonomía en fases posteriores. Pensada para
**producción temprana**: acotada, sencilla, pero funcional, y diseñada para
crecer sin reescrituras.

### Requisitos guía
- Producción pronto, alcance acotado, complejidad controlada.
- Grupo cerrado (~200), solo por invitación. Datos sensibles (activistas/denuncias).
- Dos roles: **activista** (investiga y denuncia) y **admin** (supervisa y aprueba).
- Web responsive instalable (PWA) con notificaciones push.
- Enfoque elegido: **A+** = humano al frente + Claude como copiloto +
  enriquecimiento dirigido vía API oficial de X.

---

## 2. Arquitectura general

Cuatro bloques. La idea rectora: PWA delgada + núcleo gestionado (Supabase) +
**worker agéntico asíncrono separado** donde vive la inteligencia.

```
USUARIOS (200) — Activistas · Admins (navegador/móvil)
        │ HTTPS
        ▼
(A) FRONTEND / PWA — Next.js + React + TypeScript, responsive, instalable
        │ API REST/RPC + Realtime
        ▼
(B) SUPABASE (gestionado) — Postgres · Auth · RLS · Storage · Realtime · tabla `jobs`
        │ encola / lee-escribe
        ▼
(C) WORKER AGÉNTICO (TypeScript, Docker en VPS)
      Runtime de agente (Claude tool-use, bucle acotado)
        ├─ Tool: API de X
        ├─ Tool: similitud de texto (BD)
        ├─ Tool (Fase 2): reverse-image / GAN
        └─ Tool (Fase 2): web / Perplexity
      + Guardarraíles (límites, presupuesto) + Auditoría
        │ llamadas externas
        ▼
(D) SERVICIOS EXTERNOS — Claude (Anthropic) · API X (Basic) · (F2) Perplexity, Botometer
```

### Responsabilidad de cada bloque
- **(A) Frontend/PWA:** interfaz de activistas y admins. Sin lógica de IA; solo
  muestra y dispara acciones. Depende de Supabase.
- **(B) Supabase:** fuente de verdad. Datos, auth, roles, RLS, storage de
  evidencia, Realtime, y la **cola de trabajos** (tabla `jobs`).
- **(C) Worker agéntico:** el cerebro. Consume `jobs`, corre el bucle del agente,
  enriquece, razona, arma expedientes y **registra cada paso para auditoría**.
  Aloja los guardarraíles. Separado porque las investigaciones tardan y consumen API.
- **(D) Servicios externos:** Claude (razonamiento), API de X (datos reales),
  OSINT de Fase 2.

### Decisiones de arquitectura
1. Worker separado del frontend desde el día 1 (requisito del modelo agéntico
   asíncrono; evita reescritura).
2. Cola de trabajos como **tabla en Postgres**, no Redis/RabbitMQ — menos infra,
   suficiente para la escala. Intercambiable a futuro.
3. El frontend **nunca** llama a Claude ni a la API de X directamente; todo pasa
   por el worker (seguridad, claves, costos, auditoría centralizados).
4. **Auditoría como ciudadano de primera clase**: cada acción del agente se
   persiste, porque una denuncia debe ser defendible.

---

## 3. Modelo de datos (Postgres / Supabase)

Principio: columnas `jsonb` para snapshots y salidas de herramientas (lo externo
va flexible; lo que controlamos va rígido).

```
profiles ──< cases ──< investigation_runs ──< agent_steps   (auditoría)
   │           │              │
   │           │              └──< evidence_items
   │           ├──< dossiers ──< denuncia_campaigns ──< denuncia_actions
   │           └──< case_links >── cases          (grafo de la "granja")
   └── rol: activista | admin
jobs (cola)      tags ──< case_tags
```

### Identidad y trabajo del grupo
| Tabla | Para qué | Campos clave |
|---|---|---|
| `profiles` | Usuario ligado a Supabase Auth | `id`, `role` (activista/admin), `display_name`, `active` |
| `cases` | **Unidad central**: cuenta-objetivo bajo investigación | `platform`, `handle`, `external_id`, `status`, `risk_score`, `confidence`, `created_by`, `assigned_to`, `account_snapshot` (jsonb) |
| `tags` / `case_tags` | Agrupar casos (campañas, narrativas) | `name`, `color` |

### Investigación agéntica + auditoría
| Tabla | Para qué | Campos clave |
|---|---|---|
| `investigation_runs` | Una ejecución del agente sobre un caso | `case_id`, `status` (queued/running/needs_review/done/failed), `iterations`, `tokens_used`, `cost`, `verdict` (jsonb), `started_at`, `finished_at` |
| `agent_steps` | **Auditoría**: un paso por fila | `run_id`, `step_no`, `tool_name`, `input` (jsonb), `output` (jsonb), `reasoning`, `created_at` |
| `evidence_items` | Señales recolectadas (tools o subidas) | `case_id`, `run_id`, `type`, `source` (tool/manual), `payload` (jsonb), `storage_path`, `captured_at` |

### Expediente y denuncia coordinada
| Tabla | Para qué | Campos clave |
|---|---|---|
| `dossiers` | Expediente compilado y defendible | `case_id`, `content` (markdown/jsonb), `generated_by`, `approved_by`, `status` (draft/approved), `version` |
| `denuncia_campaigns` | Campaña de denuncia masiva | `case_id`, `status` (draft/active/closed), `report_links` (jsonb), `instructions`, `started_by` |
| `denuncia_actions` | Quién ya reportó (conteo) | `campaign_id`, `user_id`, `reported_at`, `proof_path` |

### Grafo de la granja
| Tabla | Para qué | Campos clave |
|---|---|---|
| `case_links` | Aristas entre casos | `source_case`, `target_case`, `relation_type` (mismo_texto / amplificacion_coordinada / mismo_avatar), `weight`, `discovered_by` (agente/manual) |

### Infraestructura
| Tabla | Para qué | Campos clave |
|---|---|---|
| `jobs` | Cola que consume el worker | `type`, `payload` (jsonb), `status`, `attempts`, `locked_at`, `run_after` |

### Decisiones del modelo
1. `cases` es el centro de gravedad: casi todo cuelga de un caso.
2. `investigation_runs` separado de `cases`: un caso puede re-investigarse.
3. `agent_steps` = trazabilidad total → plataforma defendible.
4. Grafo de granjas como aristas en Postgres (consultas recursivas); sin base de
   grafos dedicada en Fase 1 (YAGNI).
5. `denuncia_actions` aparte para conteo individual en tiempo real (Realtime).

---

## 4. Roles, permisos y seguridad

### Roles (Fase 1: dos)
| Rol | Puede | No puede |
|---|---|---|
| **Activista** | Crear casos, lanzar investigaciones, ver/editar sus casos y los compartidos, subir evidencia, participar en denuncias, marcar "ya reporté" | Aprobar expedientes, activar campañas, panel admin, gestionar usuarios |
| **Admin** | Todo lo del activista + supervisar todo, aprobar expedientes, activar campañas, gestionar usuarios, ver métricas y costos | — |

Modelo de roles extensible (campo `role` + tabla de permisos si se requiere) para
añadir roles en Fase 2 sin rediseñar.

### Doble gate humano (clave del modelo agéntico)
```
Agente concluye → [needs_review] → Activista revisa/corrige
       → Expediente listo → [GATE ADMIN] → Admin aprueba → Campaña activa
```
Ningún veredicto de IA dispara una denuncia por sí solo. Siempre activista → admin.

### Seguridad técnica
1. **Auth: Supabase Auth.** Email + contraseña, **2FA obligatorio**, **altas solo
   por invitación del admin** (sin registro público).
2. **Autorización: Row Level Security (RLS)** en Postgres. Las reglas de "quién ve
   qué" se aplican en la base misma. Ej.: activista solo lee sus casos o los
   compartidos; solo admin pasa dossier a `approved` o campaña a `active`; costos
   globales solo para admin.
3. **Secretos solo en el servidor.** Claves de Claude y X solo en el worker (VPS).
   Frontend usa anon key (limitada por RLS); worker usa service key.
4. **Evidencia en Storage privado** con URLs firmadas de corta duración.
5. **Minimización y retención.** Solo datos públicos (OSINT). Política de retención
   para evidencia y datos de activistas. Región de Supabase elegida por jurisdicción.
6. **Auditoría de humanos** además de `agent_steps`: quién aprobó, quién activó campaña.

---

## 5. Flujos clave

### 5.1 Investigación agéntica
1. **Alta del caso:** activista pega `@handle` (+ opcional capturas/notas). Se crea
   `case` y se encola un `job`.
2. **Worker toma el trabajo:** crea `investigation_run` (running). Frontend muestra
   progreso en vivo (Realtime).
3. **Bucle del agente** (Claude tool-use, máx N iteraciones / máx presupuesto):
   consulta tools (API X, similitud de texto), razona, decide si sigue. Cada paso
   → `agent_steps`; cada dato → `evidence_items`.
4. **Veredicto estructurado:** score (0-100) + confianza + razones con peso +
   cuentas vinculadas sugeridas (`case_links`) + borrador de expediente. Run pasa a
   `needs_review`; Realtime avisa al activista.
5. **Gate humano 1 (activista):** revisa, corrige/añade evidencia, descarta,
   re-investiga o aprueba el expediente.
6. **Gate humano 2 (admin):** supervisa y aprueba → habilita la denuncia.

**Guardarraíles Fase 1:** límite duro de iteraciones, tope de gasto por caso, rate
limiting de la API de X (tier Basic). Si llega al límite, devuelve "investigación
parcial". **Acotado:** investiga una cuenta a la vez; sugiere vínculos pero **no**
lanza sub-investigaciones recursivas (eso lo dispara el activista manualmente).

### 5.2 Denuncia coordinada masiva
1. **Admin activa la campaña** sobre un caso con expediente aprobado: crea
   `denuncia_campaign` (active) con instrucciones + links de reporte.
2. **Notificación al grupo:** in-app (Realtime) + **push de PWA** a los 200.
3. **Cada activista reporta:** abre la campaña, ve resumen del expediente, botón
   directo al mecanismo de reporte de la red, reporta y marca "Ya reporté"
   (+ captura opcional). Se crea fila en `denuncia_actions`.
4. **Conteo en tiempo real:** barra de progreso "147 / 200". Admin sigue el avance.
5. **Cierre:** admin marca `closed` (+ resultado). Queda historial completo.

---

## 6. Stack tecnológico y despliegue

| Bloque | Tecnología |
|---|---|
| Frontend / PWA | Next.js + React + TypeScript, Tailwind, `next-pwa` (instalable + push) |
| Núcleo | Supabase gestionado (Postgres, Auth, RLS, Storage, Realtime) |
| Worker agéntico | **TypeScript (Node)**, Docker, en VPS |
| Runtime de agente | SDK de Anthropic (Claude) con tool use nativo |
| Datos externos | API de X (Basic); Fase 2: Perplexity, reverse-image, Botometer |

**Decisión worker:** TypeScript en Fase 1 (stack unificado, equipo cómodo, Fase 1
es orquestación + APIs). **Python entra en Fase 2** como microservicio separado
para ML/datos (GAN, imágenes, grafos), invocado por el worker como una tool más.

### Despliegue
- **Frontend:** Vercel al inicio (simple) o el VPS; migrable fácil.
- **Worker:** VPS, Docker, detrás de Caddy/Nginx (TLS). Sondea la tabla `jobs`. Un
  worker alcanza; escalar = más réplicas.
- **Supabase:** gestionado; se elige la región por jurisdicción.

### Costos aproximados (mensual, orden de magnitud)
Supabase Pro ~$25 · VPS ~$5–20 · Vercel $0–20 · API X Basic ~$100–200 · Claude
variable (controlado por guardarraíles de presupuesto). El mayor costo controlable
es Claude → topes por caso son parte del diseño.

---

## 7. Fases y Roadmap

**Principio rector:** nada de lo construido en una fase se tira en la siguiente. El
agente acotado de Fase 1 es el mismo que se suelta en Fase 2.

### Fase 0 — Cimientos (semana 1)
Esquema de datos + RLS base; Auth con invitaciones + 2FA + 2 roles; cascarón PWA
(login, layout, navegación); worker dockerizado leyendo `jobs` (sin agente aún).
**Entregable:** login con roles + worker procesando trabajos de prueba.

### Fase 1 — MVP agéntico acotado (el grueso) ⭐
Alta de casos; agente investigador acotado con 2 tools (API X + similitud de texto);
guardarraíles; veredicto estructurado + auditoría + evidencia; doble gate humano +
expedientes; denuncia coordinada (campañas, push PWA, conteo en vivo); sugerencia
no recursiva de vínculos (grafo básico). **Entregable:** ciclo completo investigar →
revisar → aprobar → denunciar, **en producción**.

### Fase 2 — Inteligencia OSINT + agente suelto
Más tools/enrichers (reverse-image + GAN, Perplexity/OSINT, Botometer) → entra el
microservicio Python; agente con descubrimiento recursivo de granjas; grafo rico con
visualización; TikTok como segunda plataforma.

### Fase 3 — Escala y multi-agente (futuro)
Multi-agente (Investigador · Analista de Patrones · Redactor · OSINT); tier Pro de X
si se justifica; métricas y paneles de impacto avanzados.

---

## 8. Fuera de alcance (Fase 1)
- Enriquecimiento automático masivo / escaneo amplio (requiere tier Pro de X).
- Scraping no oficial (frágil y contra ToS).
- Detección recursiva automática de granjas.
- Análisis de imágenes / detección de rostros GAN (Fase 2, Python).
- OSINT vía Perplexity y bases externas (Botometer) (Fase 2).
- TikTok (Fase 2).
- Más de dos roles.
