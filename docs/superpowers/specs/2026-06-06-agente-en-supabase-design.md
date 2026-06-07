# michis — Agente dentro de Supabase (Edge Function + Cron) — Diseño y Plan

**Fecha:** 2026-06-06 · **Estado:** aprobado (opción B elegida por el usuario)
**Objetivo:** el agente corre 24/7 SIN servidores propios: una Edge Function de
Supabase procesa la cola, disparada por pg_cron cada minuto. El worker Node
queda solo para desarrollo/tests locales.

## Arquitectura
```
pg_cron (cada minuto, dentro de Postgres)
  └─ net.http_post → Edge Function `procesar-cola` (Deno)
        └─ bucle acotado (~100s máx por invocación):
             claim_job() → agente (Gemini vía OpenAI-compat) → persistencia
             (idéntica al worker: runs/steps/evidence/dossier/case_links)
```
- **Seguridad de la función:** se despliega `--no-verify-jwt` pero exige header
  `x-cron-secret` == env `CRON_SECRET` (rechaza 401 si no).
- **Secretos:** `LLM_*` y `CRON_SECRET` como secrets de la función;
  `SUPABASE_URL`/`SERVICE_ROLE_KEY` los inyecta el runtime de Supabase.
- **El secreto NUNCA va al repo:** la migración 0014 crea (extensiones pg_cron y
  pg_net +) una función SQL `programar_cron(p_url, p_secret)` SECURITY DEFINER
  ejecutable solo por service_role; un script one-off la invoca con el secreto
  real para registrar el cron. El SQL committeado no contiene secretos.
- **Código:** `supabase/functions/procesar-cola/index.ts` autocontenido (port
  fiel de budget/llmOpenAiCompat/prompt/tools/runtime/investigate del worker;
  `fetch` nativo de Deno; supabase-js vía `npm:`). Fuente de verdad de la
  LÓGICA siguen siendo los módulos del worker y sus 51 tests; la función es el
  mismo algoritmo en runtime Deno (divergencia controlada: cambios futuros se
  aplican en ambos o se extrae lib compartida si duele).
- **Convivencia:** claim_job es atómico (skip locked) → cron y worker local
  pueden coexistir sin procesar dos veces.

## Plan
1. Escribir la Edge Function (port completo, autocontenido).
2. Migración 0014 (pg_cron, pg_net, programar_cron + des/programar) → db push.
3. **Usuario:** crear Personal Access Token en supabase.com/dashboard/account/tokens
   (necesario una sola vez: `functions deploy` usa la Management API, no la BD).
4. Deploy de la función + `secrets set` (LLM_*, CRON_SECRET generado).
5. Registrar el cron vía RPC con el secreto; verificación E2E: encolar caso real
   → esperar ~1 min → veredicto persistido sin worker local corriendo.
6. Documentar: worker local = solo dev; producción = Supabase.

## Fuera de alcance
Mover el envío de push/notificaciones (futuro) · compartir código worker↔función
como paquete (se evalúa si la dualidad duele).
