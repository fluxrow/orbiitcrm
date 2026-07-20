WITH synth AS (
  SELECT id FROM public.orbit_empresas WHERE nome LIKE 'OUTBOX_SMOKE_%'
)
DELETE FROM public.orbit_whatsapp_outbox WHERE empresa_id IN (SELECT id FROM synth);

DELETE FROM public.orbit_whatsapp_sending_config
WHERE empresa_id IN (SELECT id FROM public.orbit_empresas WHERE nome LIKE 'OUTBOX_SMOKE_%');

DELETE FROM public.orbit_meetings
WHERE empresa_id IN (SELECT id FROM public.orbit_empresas WHERE nome LIKE 'OUTBOX_SMOKE_%');

DELETE FROM public.orbit_mensagens
WHERE empresa_id IN (SELECT id FROM public.orbit_empresas WHERE nome LIKE 'OUTBOX_SMOKE_%');

DELETE FROM public.orbit_conversas
WHERE empresa_id IN (SELECT id FROM public.orbit_empresas WHERE nome LIKE 'OUTBOX_SMOKE_%');

DELETE FROM public.orbit_deals
WHERE empresa_id IN (SELECT id FROM public.orbit_empresas WHERE nome LIKE 'OUTBOX_SMOKE_%');

DELETE FROM public.orbit_pipeline_stages
WHERE empresa_id IN (SELECT id FROM public.orbit_empresas WHERE nome LIKE 'OUTBOX_SMOKE_%');

DELETE FROM public.orbit_prospects
WHERE empresa_id IN (SELECT id FROM public.orbit_empresas WHERE nome LIKE 'OUTBOX_SMOKE_%');

DELETE FROM public.orbit_empresas WHERE nome LIKE 'OUTBOX_SMOKE_%';