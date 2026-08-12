UPDATE public.orbit_whatsapp_outbox
SET status = 'canceled',
    canceled_reason = 'recovery_manual_review_handoff',
    updated_at = now()
WHERE id = '2f456f21-38e4-47c8-b7ec-78526cee830b'
  AND empresa_id = '4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18'
  AND status = 'pending';

WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY created_at) - 1 AS idx
  FROM public.orbit_whatsapp_outbox
  WHERE empresa_id = '4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18'
    AND metadata->>'recovery_tag' = 'recovery-fora-horario-20260812b'
    AND status = 'pending'
)
UPDATE public.orbit_whatsapp_outbox o
SET scheduled_for = now() + make_interval(secs => 120 + ordered.idx * 180),
    updated_at = now()
FROM ordered
WHERE o.id = ordered.id;

INSERT INTO public.orbit_audit_log (empresa_id, acao, entidade, detalhes)
VALUES (
  '4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18',
  'whatsapp_recovery_release',
  'orbit_whatsapp_outbox',
  jsonb_build_object(
    'recovery_tag', 'recovery-fora-horario-20260812b',
    'released', 8,
    'cadence_seconds', 180,
    'manual_review', jsonb_build_array('2f456f21-38e4-47c8-b7ec-78526cee830b'),
    'manual_review_reason', 'conversa em handoff humano'
  )
);