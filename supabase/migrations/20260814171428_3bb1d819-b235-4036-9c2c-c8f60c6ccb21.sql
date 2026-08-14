ALTER TABLE public.orbit_ai_config
  ADD COLUMN IF NOT EXISTS mixed_payment_handoff jsonb,
  ADD COLUMN IF NOT EXISTS self_introduction_guard jsonb;

COMMENT ON COLUMN public.orbit_ai_config.mixed_payment_handoff IS
  'Tenant-scoped. {enabled:boolean, confirmation_message?:text}. Confirma uma unica vez pagamento misto PIX+cartao e entrega a conversa ao humano. NULL = desligado.';
COMMENT ON COLUMN public.orbit_ai_config.self_introduction_guard IS
  'Tenant-scoped. {enabled:boolean, names?:text[]}. Remove autoapresentacao artificial da persona. NULL = desligado.';

-- Snapshot auditavel e restauravel da config atual da Bullink
INSERT INTO public.orbit_quarantine_backups (empresa_id, batch_label, entity_type, entity_id, snapshot)
SELECT c.empresa_id,
       'bullink-mixed-payment-selfintro-20260815',
       'orbit_ai_config',
       c.id,
       to_jsonb(c)
FROM public.orbit_ai_config c
WHERE c.empresa_id = '4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18';

-- Ativacao exclusiva do tenant Bullink
UPDATE public.orbit_ai_config
SET mixed_payment_handoff = jsonb_build_object(
      'enabled', true,
      'confirmation_message',
      'Sim, dá pra fazer assim: uma parte no PIX e o restante no cartão. Te chamo aqui mesmo para combinarmos os detalhes.'
    ),
    self_introduction_guard = jsonb_build_object(
      'enabled', true,
      'names', jsonb_build_array('Fernando Albuquerque', 'Fernando')
    ),
    updated_at = now()
WHERE empresa_id = '4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18';