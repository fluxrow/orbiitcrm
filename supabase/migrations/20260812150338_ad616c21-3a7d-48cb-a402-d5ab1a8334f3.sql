-- Leitura segura de metadata.outbox_hold_until (NULL quando ausente/inválido).
CREATE OR REPLACE FUNCTION public.outbox_hold_until_ts(_metadata jsonb)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  _raw text := nullif(btrim(coalesce(_metadata->>'outbox_hold_until', '')), '');
BEGIN
  IF _raw IS NULL THEN
    RETURN NULL;
  END IF;
  BEGIN
    RETURN _raw::timestamptz;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.outbox_hold_until_ts(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.outbox_hold_until_ts(jsonb) TO service_role;

-- Claim nunca seleciona item com hold futuro (defesa em profundidade no banco).
CREATE OR REPLACE FUNCTION public.outbox_claim_batch(_empresa_id uuid, _batch integer DEFAULT 10, _worker_id text DEFAULT NULL::text, _lease_seconds integer DEFAULT 120)
RETURNS SETOF orbit_whatsapp_outbox
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
     ORDER BY priority DESC, scheduled_for ASC, created_at ASC
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