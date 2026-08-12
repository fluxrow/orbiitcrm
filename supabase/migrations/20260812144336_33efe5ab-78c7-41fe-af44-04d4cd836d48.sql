-- Congelamento auditável dos 9 itens pendentes da recuperação recovery-fora-horario-20260812
-- (tenant Bullink apenas). Nada é deletado: os itens ficam cancelados com motivo e
-- carimbo de auditoria no metadata, impedindo envio automático futuro.
WITH alvo AS (
  SELECT id FROM public.orbit_whatsapp_outbox
  WHERE empresa_id = '4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18'
    AND status = 'pending'
    AND source_type = 'ai_reply'
    AND metadata->>'recovery_tag' = 'recovery-fora-horario-20260812'
)
UPDATE public.orbit_whatsapp_outbox o
SET status = 'canceled',
    canceled_at = now(),
    canceled_reason = 'recovery_frozen_superseded_by_recovery-fora-horario-20260812b',
    locked_at = NULL,
    locked_by = NULL,
    next_attempt_at = NULL,
    metadata = o.metadata || jsonb_build_object(
      'frozen', jsonb_build_object(
        'at', now(),
        'by', 'operator_authorized_controlled_send',
        'reason', 'superseded_by_recovery-fora-horario-20260812b'
      )
    )
FROM alvo
WHERE o.id = alvo.id;

-- Marca as linhas visuais correspondentes como canceladas (sem apagar histórico).
UPDATE public.orbit_mensagens m
SET status = 'cancelada'
WHERE m.empresa_id = '4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18'
  AND m.status = 'queued'
  AND m.id IN (
    SELECT (o.metadata->>'orbit_message_id')::uuid
    FROM public.orbit_whatsapp_outbox o
    WHERE o.empresa_id = '4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18'
      AND o.metadata->>'recovery_tag' = 'recovery-fora-horario-20260812'
      AND o.status = 'canceled'
      AND o.metadata->>'orbit_message_id' IS NOT NULL
  );

INSERT INTO public.orbit_audit_log (empresa_id, acao, entidade, detalhes)
VALUES (
  '4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18',
  'recovery_batch_frozen',
  'orbit_whatsapp_outbox',
  jsonb_build_object(
    'recovery_tag', 'recovery-fora-horario-20260812',
    'superseded_by', 'recovery-fora-horario-20260812b',
    'motivo', 'envio controlado autorizado com cadencia de 180s'
  )
);