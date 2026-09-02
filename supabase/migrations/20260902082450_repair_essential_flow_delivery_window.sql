-- Defesa em profundidade para entregas essenciais:
-- 1. flow_initial/flow_followup com mais de 24h nunca entram no claim;
-- 2. follow-up válido esperando >=30min recebe aging de prioridade 71,
--    sem ultrapassar flow_stage (75), reunião (90) ou ai_reply (100).
CREATE OR REPLACE FUNCTION public.outbox_claim_batch(
  _empresa_id uuid,
  _batch integer DEFAULT 10,
  _worker_id text DEFAULT NULL::text,
  _lease_seconds integer DEFAULT 120
)
RETURNS SETOF public.orbit_whatsapp_outbox
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _now timestamptz := now();
  _lease_cutoff timestamptz := _now - make_interval(secs => _lease_seconds);
BEGIN
  UPDATE public.orbit_whatsapp_outbox
     SET status = 'pending', locked_at = NULL, locked_by = NULL
   WHERE empresa_id = _empresa_id
     AND status = 'processing'
     AND locked_at IS NOT NULL
     AND locked_at < _lease_cutoff;

  RETURN QUERY
  WITH claimable AS (
    SELECT id
      FROM public.orbit_whatsapp_outbox
     WHERE empresa_id = _empresa_id
       AND status = 'pending'
       AND scheduled_for <= _now
       AND (next_attempt_at IS NULL OR next_attempt_at <= _now)
       AND (public.outbox_hold_until_ts(metadata) IS NULL
            OR public.outbox_hold_until_ts(metadata) <= _now)
       AND NOT (
         empresa_id IN (
           '4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18'::uuid,
           '36f26579-66ad-4ef1-9788-141e4c727232'::uuid
         )
         AND source_type IN ('flow_initial', 'flow_followup')
         AND scheduled_for <= _now - interval '24 hours'
       )
     ORDER BY
       CASE
         WHEN empresa_id IN (
                '4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18'::uuid,
                '36f26579-66ad-4ef1-9788-141e4c727232'::uuid
              )
          AND source_type = 'flow_followup'
          AND scheduled_for <= _now - interval '30 minutes'
          AND scheduled_for > _now - interval '24 hours'
         THEN GREATEST(priority, 71)
         ELSE priority
       END DESC,
       scheduled_for ASC,
       created_at ASC
     LIMIT GREATEST(1, LEAST(_batch, 100))
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.orbit_whatsapp_outbox o
     SET status = 'processing',
         locked_at = _now,
         locked_by = COALESCE(_worker_id, 'worker'),
         attempts = o.attempts + 1
    FROM claimable c
   WHERE o.id = c.id
   RETURNING o.*;
END;
$$;

REVOKE ALL ON FUNCTION public.outbox_claim_batch(uuid, integer, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.outbox_claim_batch(uuid, integer, text, integer) TO service_role;
