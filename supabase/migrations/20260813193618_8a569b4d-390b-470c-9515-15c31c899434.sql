-- Tick de recuperação do debounce (a cada minuto). Só assume jobs cuja janela
-- venceu e que continuam pendentes; nunca reprocessa histórico.
SELECT cron.unschedule('orbit-ai-reply-debounce-tick')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'orbit-ai-reply-debounce-tick');

SELECT cron.schedule(
  'orbit-ai-reply-debounce-tick',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://oqsnzwkiwgqwopuaugxj.supabase.co/functions/v1/orbit-ai-reply-debounce-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  );
  $$
);