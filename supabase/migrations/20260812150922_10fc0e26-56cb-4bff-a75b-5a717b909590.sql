-- Rejeitados na validação determinística → revisão humana, sem envio.
UPDATE public.orbit_whatsapp_outbox
SET status = 'canceled',
    canceled_at = now(),
    canceled_reason = CASE id
      WHEN '4ce66e5b-ae1c-4a24-91f9-e323a0052810' THEN 'recovery_rejected_multiple_questions'
      ELSE 'recovery_rejected_payment_without_closing'
    END,
    updated_at = now()
WHERE id IN ('4ce66e5b-ae1c-4a24-91f9-e323a0052810','74f08c63-f898-4f76-9844-0ec0164e9284')
  AND status = 'pending';

-- Itens de smoke encerrados.
UPDATE public.orbit_whatsapp_outbox
SET status = 'canceled', canceled_at = now(), canceled_reason = 'smoke_cleanup', updated_at = now()
WHERE empresa_id = '4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18'
  AND metadata->>'smoke' = 'true'
  AND status IN ('pending','processing');

-- Aprovados: hold escalonado de 180s (autoridade) + scheduled_for coerente.
WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY created_at) - 1 AS idx
  FROM public.orbit_whatsapp_outbox
  WHERE empresa_id = '4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18'
    AND metadata->>'recovery_tag' = 'recovery-fora-horario-20260812c'
    AND status = 'pending'
    AND id IN (
      'ae1bedec-6a7d-4434-95e9-67ea4ecb82a4',
      '0c5365df-eaea-408d-acc0-ca8853eda1f6',
      'be065a9b-00e3-4357-a3f4-13b6d361bfa5',
      '6319e5e2-b709-4035-b138-bbd7570d73d4',
      '27ff51f1-4d25-4962-bbc9-77be2da46f8d'
    )
)
UPDATE public.orbit_whatsapp_outbox o
SET metadata = jsonb_set(
      o.metadata,
      '{outbox_hold_until}',
      to_jsonb(to_char((now() + make_interval(secs => 120 + ordered.idx * 180)) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
    ),
    scheduled_for = now() + make_interval(secs => 120 + ordered.idx * 180),
    next_attempt_at = NULL,
    last_error = NULL,
    updated_at = now()
FROM ordered
WHERE o.id = ordered.id;

INSERT INTO public.orbit_audit_log (empresa_id, acao, entidade, detalhes)
VALUES (
  '4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18',
  'whatsapp_recovery_release',
  'orbit_whatsapp_outbox',
  jsonb_build_object(
    'recovery_tag', 'recovery-fora-horario-20260812c',
    'released', 5,
    'cadence_seconds', 180,
    'rejected', jsonb_build_array('4ce66e5b-ae1c-4a24-91f9-e323a0052810','74f08c63-f898-4f76-9844-0ec0164e9284'),
    'excluded_handoff', jsonb_build_array('2f456f21-38e4-47c8-b7ec-78526cee830b'),
    'gate', 'metadata.outbox_hold_until + recovery spacing 180s'
  )
);