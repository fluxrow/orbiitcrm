-- Reserva ATÔMICA de vaga de campanha da Viver Semijoias.
-- Substitui a eleição pelo menor id (que não era exclusão mútua) por um
-- advisory lock transacional por tenant. Aditiva: `outbox_claim_batch` e o
-- comportamento de outros tenants/origens permanecem intactos.
-- Rollback: supabase/rollback/20260911124500_viver_campaign_slot_atomic_reservation_down.sql
CREATE OR REPLACE FUNCTION public.viver_campaign_slot_try_acquire(
  _empresa_id uuid,
  _outbox_id uuid,
  _lease_seconds integer DEFAULT 120,
  _min_gap_seconds integer DEFAULT 1800
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _viver constant uuid := '36f26579-66ad-4ef1-9788-141e4c727232';
  _now timestamptz := now();
  _lease_cutoff timestamptz := now() - make_interval(secs => _lease_seconds);
  _row public.orbit_whatsapp_outbox;
  _last_sent timestamptz;
  _wait integer;
BEGIN
  -- Outros tenants nunca são afetados.
  IF _empresa_id IS DISTINCT FROM _viver THEN
    RETURN jsonb_build_object('acquired', true, 'reason', 'not_applicable');
  END IF;

  -- Exclusão mútua real: a verificação e a decisão ocorrem sob o mesmo lock.
  IF NOT pg_try_advisory_xact_lock(hashtext('viver_campaign_slot:' || _viver::text)) THEN
    RETURN jsonb_build_object('acquired', false, 'reason', 'slot_lock_contended');
  END IF;

  SELECT * INTO _row
    FROM public.orbit_whatsapp_outbox
   WHERE id = _outbox_id AND empresa_id = _viver
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('acquired', false, 'reason', 'item_not_found');
  END IF;

  -- ai_reply / follow-ups / flows da Viver seguem sem restrição de vaga.
  IF _row.source_type IS DISTINCT FROM 'campaign' THEN
    RETURN jsonb_build_object('acquired', true, 'reason', 'not_applicable');
  END IF;

  IF _row.status IS DISTINCT FROM 'processing' THEN
    RETURN jsonb_build_object('acquired', false, 'reason', 'item_not_processing');
  END IF;

  -- Cap de 1 campanha simultânea enquanto existir lease válida.
  IF EXISTS (
    SELECT 1 FROM public.orbit_whatsapp_outbox
     WHERE empresa_id = _viver
       AND source_type = 'campaign'
       AND status = 'processing'
       AND id <> _row.id
       AND locked_at IS NOT NULL
       AND locked_at >= _lease_cutoff
  ) THEN
    RETURN jsonb_build_object('acquired', false, 'reason', 'slot_locked');
  END IF;

  -- Espaçamento real mínimo de 30 min medido pelo último envio aceito.
  SELECT max(sent_at) INTO _last_sent
    FROM public.orbit_whatsapp_outbox
   WHERE empresa_id = _viver AND source_type = 'campaign' AND status = 'sent';
  IF _last_sent IS NOT NULL AND _last_sent > _now - make_interval(secs => _min_gap_seconds) THEN
    _wait := CEIL(EXTRACT(EPOCH FROM (_last_sent + make_interval(secs => _min_gap_seconds) - _now)))::integer;
    RETURN jsonb_build_object('acquired', false, 'reason', 'min_gap', 'wait_seconds', GREATEST(1, _wait));
  END IF;

  RETURN jsonb_build_object('acquired', true, 'reason', 'acquired');
END;
$fn$;

REVOKE ALL ON FUNCTION public.viver_campaign_slot_try_acquire(uuid, uuid, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.viver_campaign_slot_try_acquire(uuid, uuid, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.viver_campaign_slot_try_acquire(uuid, uuid, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.viver_campaign_slot_try_acquire(uuid, uuid, integer, integer) TO service_role;