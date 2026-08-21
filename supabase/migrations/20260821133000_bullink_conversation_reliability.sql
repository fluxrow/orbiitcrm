-- Snapshot auditável antes da ativação das travas prospectivas do Bullink.
INSERT INTO public.orbit_quarantine_backups
  (empresa_id, batch_label, entity_type, entity_id, snapshot)
SELECT
  c.empresa_id,
  'bullink-conversation-reliability-20260821',
  'orbit_ai_config',
  c.id,
  to_jsonb(c)
FROM public.orbit_ai_config c
WHERE c.empresa_id = '4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18';

-- Ativa somente no Bullink:
-- 1) não repetir preço já informado sem novo pedido explícito;
-- 2) toda inbound nova abre claim sem herdar max_attempts/erro antigo;
-- 3) contenção de lock não gasta tentativa de provider.
UPDATE public.orbit_ai_config
SET
  primary_offer_lock = jsonb_set(
    coalesce(primary_offer_lock, '{}'::jsonb),
    '{anti_repetition_enabled}',
    'true'::jsonb,
    true
  ),
  ai_reply_debounce = jsonb_set(
    jsonb_set(
      coalesce(ai_reply_debounce, '{}'::jsonb),
      '{fresh_claim_reset}',
      'true'::jsonb,
      true
    ),
    '{lock_busy_does_not_consume_attempt}',
    'true'::jsonb,
    true
  ),
  updated_at = now()
WHERE empresa_id = '4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18';
