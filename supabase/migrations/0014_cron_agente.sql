-- El agente corre dentro de Supabase: pg_cron dispara cada minuto la Edge
-- Function `procesar-cola` vía pg_net. El secreto del header NO se commitea:
-- se registra invocando programar_cron_agente() con el valor real (service role).
create extension if not exists pg_cron;
create extension if not exists pg_net;

create function public.programar_cron_agente(p_url text, p_secret text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  -- Re-programable: si ya existe el job, quitarlo primero.
  perform cron.unschedule('michis-procesar-cola')
  where exists (select 1 from cron.job where jobname = 'michis-procesar-cola');

  perform cron.schedule(
    'michis-procesar-cola',
    '* * * * *',
    format(
      $cmd$select net.http_post(
        url := %L,
        headers := jsonb_build_object('x-cron-secret', %L, 'Content-Type', 'application/json'),
        body := '{}'::jsonb,
        timeout_milliseconds := 110000
      );$cmd$,
      p_url, p_secret
    )
  );
end;
$$;

-- Solo el backend (service role) puede programarlo.
revoke execute on function public.programar_cron_agente(text, text) from public, anon, authenticated;
