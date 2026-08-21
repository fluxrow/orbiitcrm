-- Snapshot auditável antes de ativar o handoff de comprovante no Bullink.
INSERT INTO public.orbit_quarantine_backups
  (empresa_id, batch_label, entity_type, entity_id, snapshot)
SELECT
  c.empresa_id,
  'bullink-payment-receipt-handoff-20260821',
  'orbit_ai_config',
  c.id,
  to_jsonb(c)
FROM public.orbit_ai_config c
WHERE c.empresa_id = '4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18'
  AND NOT EXISTS (
    SELECT 1 FROM public.orbit_quarantine_backups b
    WHERE b.empresa_id = c.empresa_id
      AND b.batch_label = 'bullink-payment-receipt-handoff-20260821'
      AND b.entity_type = 'orbit_ai_config'
      AND b.entity_id = c.id
  );

-- Configuração estritamente tenant-scoped. Nos demais tenants, a chave ausente
-- mantém o código completamente desligado.
UPDATE public.orbit_ai_config
SET mixed_payment_handoff = jsonb_set(
      coalesce(mixed_payment_handoff, '{}'::jsonb),
      '{receipt_handoff}',
      '{"enabled":true,"target_stage_name":"Negociação"}'::jsonb,
      true
    ),
    updated_at = now()
WHERE empresa_id = '4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18';
