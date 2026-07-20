-- Remover dependências das empresas OUTBOX_SMOKE_% totalmente órfãs de dados de negócio.
WITH synth AS (
  SELECT id FROM public.orbit_empresas e
  WHERE e.nome LIKE 'OUTBOX_SMOKE_%'
    AND NOT EXISTS (SELECT 1 FROM public.orbit_prospects p WHERE p.empresa_id = e.id)
    AND NOT EXISTS (SELECT 1 FROM public.orbit_whatsapp_outbox o WHERE o.empresa_id = e.id)
    AND NOT EXISTS (SELECT 1 FROM public.orbit_campaigns c WHERE c.empresa_id = e.id)
    AND NOT EXISTS (SELECT 1 FROM public.orbit_conversas cv WHERE cv.empresa_id = e.id)
    AND NOT EXISTS (SELECT 1 FROM public.orbit_deals d WHERE d.empresa_id = e.id)
    AND NOT EXISTS (SELECT 1 FROM public.orbit_meetings m WHERE m.empresa_id = e.id)
)
DELETE FROM public.orbit_whatsapp_sending_config WHERE empresa_id IN (SELECT id FROM synth);

DELETE FROM public.orbit_pipeline_stages
WHERE empresa_id IN (
  SELECT e.id FROM public.orbit_empresas e
  WHERE e.nome LIKE 'OUTBOX_SMOKE_%'
    AND NOT EXISTS (SELECT 1 FROM public.orbit_prospects p WHERE p.empresa_id = e.id)
    AND NOT EXISTS (SELECT 1 FROM public.orbit_whatsapp_outbox o WHERE o.empresa_id = e.id)
    AND NOT EXISTS (SELECT 1 FROM public.orbit_campaigns c WHERE c.empresa_id = e.id)
    AND NOT EXISTS (SELECT 1 FROM public.orbit_conversas cv WHERE cv.empresa_id = e.id)
    AND NOT EXISTS (SELECT 1 FROM public.orbit_deals d WHERE d.empresa_id = e.id)
    AND NOT EXISTS (SELECT 1 FROM public.orbit_meetings m WHERE m.empresa_id = e.id)
);

DELETE FROM public.orbit_empresas e
WHERE e.nome LIKE 'OUTBOX_SMOKE_%'
  AND NOT EXISTS (SELECT 1 FROM public.orbit_prospects p WHERE p.empresa_id = e.id)
  AND NOT EXISTS (SELECT 1 FROM public.orbit_whatsapp_outbox o WHERE o.empresa_id = e.id)
  AND NOT EXISTS (SELECT 1 FROM public.orbit_campaigns c WHERE c.empresa_id = e.id)
  AND NOT EXISTS (SELECT 1 FROM public.orbit_conversas cv WHERE cv.empresa_id = e.id)
  AND NOT EXISTS (SELECT 1 FROM public.orbit_deals d WHERE d.empresa_id = e.id)
  AND NOT EXISTS (SELECT 1 FROM public.orbit_meetings m WHERE m.empresa_id = e.id);