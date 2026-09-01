-- Viver: fail-closed repair for the 2026-09-01 class opt-in wave.
--
-- The first slot reached the outbox without the controlled-pilot metadata and
-- was canceled by the worker before provider acceptance. This migration:
--   1. contains that slot without retrying it or changing its evidence;
--   2. validates and adds the required metadata at the database boundary for
--      only the four remaining tenant-scoped slots;
--   3. preserves the original cutoff and eligibility guards.
--
-- Rollback before a future slot:
--   UPDATE public.orbit_campaigns
--      SET status = 'cancelada', motivo_reprovacao = 'rollback_metadata_guard'
--    WHERE empresa_id = '36f26579-66ad-4ef1-9788-141e4c727232'
--      AND filtros_json->>'class_optin_wave' = '2026-09-01-group-class'
--      AND status = 'agendada';
-- Already accepted provider sends are intentionally irreversible.

CREATE OR REPLACE FUNCTION public.viver_class_optin_expiry_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_filters jsonb;
  v_controlled jsonb;
  v_not_after timestamptz;
  v_slot integer;
  v_invalid boolean := false;
BEGIN
  IF NEW.empresa_id <> '36f26579-66ad-4ef1-9788-141e4c727232'::uuid
     OR NEW.source_type <> 'campaign'
     OR NEW.campaign_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT c.filtros_json
    INTO v_filters
  FROM public.orbit_campaigns c
  WHERE c.id = NEW.campaign_id
    AND c.empresa_id = NEW.empresa_id;

  IF coalesce(v_filters->>'class_optin_wave', '') <> '2026-09-01-group-class' THEN
    RETURN NEW;
  END IF;

  v_controlled := v_filters->'controlled_reengagement';

  BEGIN
    v_not_after := (v_filters->>'not_after')::timestamptz;
    v_slot := (v_controlled->>'slot')::integer;
  EXCEPTION WHEN OTHERS THEN
    v_not_after := NULL;
    v_slot := NULL;
  END;

  v_invalid :=
    jsonb_typeof(v_controlled) IS DISTINCT FROM 'object'
    OR coalesce(v_controlled->>'source_form', '') <> 'typebot'
    OR v_controlled->'requires_day_close_review' IS DISTINCT FROM 'true'::jsonb
    OR v_controlled->'daily_cap' IS DISTINCT FROM '5'::jsonb
    OR coalesce(v_controlled->>'wave', '') <> 'class-optin-2026-09-01'
    OR v_slot NOT BETWEEN 1 AND 5
    OR CASE
      WHEN jsonb_typeof(v_filters->'selected_prospect_ids') = 'array'
        THEN jsonb_array_length(v_filters->'selected_prospect_ids') <> 1
          OR coalesce(v_filters->'selected_prospect_ids'->>0, '') <> NEW.prospect_id::text
      ELSE true
    END
    OR NOT EXISTS (
      SELECT 1
      FROM public.orbit_campaign_recipients r
      WHERE r.id::text = NEW.source_id
        AND r.campaign_id = NEW.campaign_id
        AND r.empresa_id = NEW.empresa_id
        AND r.prospect_id = NEW.prospect_id
        AND r.status = 'pendente'
    );

  IF v_invalid OR v_not_after IS NULL OR now() > v_not_after THEN
    NEW.status := 'canceled';
    NEW.canceled_at := now();
    NEW.canceled_reason := CASE
      WHEN v_invalid THEN 'class_optin_metadata_invalid'
      ELSE 'class_optin_window_closed'
    END;
    NEW.last_error := NULL;
    NEW.metadata := coalesce(NEW.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'class_optin_blocked', true,
        'class_optin_block_reason', NEW.canceled_reason
      );

    UPDATE public.orbit_campaign_recipients
       SET status = 'ignorado',
           ignorado_em = now(),
           ignorado_motivo = NEW.canceled_reason,
           erro = NULL
     WHERE id::text = NEW.source_id
       AND campaign_id = NEW.campaign_id
       AND empresa_id = NEW.empresa_id
       AND status = 'pendente';

    UPDATE public.orbit_campaigns
       SET status = 'cancelada',
           motivo_reprovacao = NEW.canceled_reason,
           updated_at = now()
     WHERE id = NEW.campaign_id
       AND empresa_id = NEW.empresa_id
       AND status NOT IN ('cancelada', 'concluida', 'falha');

    RETURN NEW;
  END IF;

  -- The production campaign producer was behind the local version. Enforce the
  -- exact worker-gate contract at the database boundary for this one wave.
  NEW.metadata := coalesce(NEW.metadata, '{}'::jsonb)
    || jsonb_build_object(
      'viver_controlled_reengagement', true,
      'controlled_reengagement_wave', v_controlled->>'wave',
      'controlled_reengagement_slot', v_slot,
      'class_optin_wave', v_filters->>'class_optin_wave'
    );

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.viver_class_optin_expiry_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.viver_class_optin_expiry_guard() FROM anon;
REVOKE ALL ON FUNCTION public.viver_class_optin_expiry_guard() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.viver_class_optin_expiry_guard() TO service_role;

DO $$
DECLARE
  v_empresa_id CONSTANT uuid := '36f26579-66ad-4ef1-9788-141e4c727232'::uuid;
  v_batch_label CONSTANT text := 'viver_class_optin_metadata_guard_2026-09-01';
  v_campaign_id uuid;
  v_recipient_id uuid;
  v_outbox_id uuid;
  v_future_count integer;
BEGIN
  SELECT c.id, r.id, o.id
    INTO v_campaign_id, v_recipient_id, v_outbox_id
  FROM public.orbit_campaigns c
  JOIN public.orbit_campaign_recipients r
    ON r.campaign_id = c.id
   AND r.empresa_id = v_empresa_id
  JOIN public.orbit_whatsapp_outbox o
    ON o.campaign_id = c.id
   AND o.empresa_id = v_empresa_id
   AND o.source_id = r.id::text
  WHERE c.empresa_id = v_empresa_id
    AND left(c.id::text, 8) = 'b7ede604'
    AND c.filtros_json->>'class_optin_wave' = '2026-09-01-group-class'
    AND c.filtros_json->'controlled_reengagement'->>'slot' = '1'
    AND o.status = 'canceled'
    AND o.canceled_reason = 'PILOT_SOURCE_BLOCKED'
    AND o.attempts = 1
    AND o.provider_message_id IS NULL;

  IF v_campaign_id IS NULL OR v_recipient_id IS NULL OR v_outbox_id IS NULL THEN
    RAISE EXCEPTION 'Viver metadata repair blocked: exact failed slot evidence not found';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.orbit_mensagens m
    WHERE m.empresa_id = v_empresa_id
      AND m.direcao = 'OUT'
      AND m.campaign_id = v_campaign_id
  ) THEN
    RAISE EXCEPTION 'Viver metadata repair blocked: failed slot has outbound message evidence';
  END IF;

  INSERT INTO public.orbit_quarantine_backups
    (empresa_id, batch_label, entity_type, entity_id, snapshot)
  VALUES (
    v_empresa_id,
    v_batch_label,
    'class_optin_incident_before',
    v_campaign_id,
    jsonb_build_object(
      'campaign_ref', left(v_campaign_id::text, 8),
      'recipient_ref', left(v_recipient_id::text, 8),
      'outbox_ref', left(v_outbox_id::text, 8),
      'campaign_status', (
        SELECT status FROM public.orbit_campaigns WHERE id = v_campaign_id
      ),
      'recipient_status', (
        SELECT status FROM public.orbit_campaign_recipients WHERE id = v_recipient_id
      ),
      'outbox_status', 'canceled',
      'canceled_reason', 'PILOT_SOURCE_BLOCKED',
      'attempts', 1,
      'provider_accepted', false,
      'manual_retry', false
    )
  );

  UPDATE public.orbit_campaigns
     SET status = 'cancelada',
         motivo_reprovacao = 'PILOT_SOURCE_BLOCKED_NO_RETRY',
         updated_at = now()
   WHERE id = v_campaign_id
     AND empresa_id = v_empresa_id
     AND status <> 'cancelada';

  UPDATE public.orbit_campaign_recipients
     SET status = 'ignorado',
         ignorado_em = now(),
         ignorado_motivo = 'PILOT_SOURCE_BLOCKED_NO_RETRY',
         erro = NULL
   WHERE id = v_recipient_id
     AND empresa_id = v_empresa_id
     AND status = 'pendente';

  SELECT count(*)
    INTO v_future_count
  FROM public.orbit_campaigns c
  JOIN public.orbit_campaign_recipients r
    ON r.campaign_id = c.id
   AND r.empresa_id = v_empresa_id
   AND r.status = 'pendente'
  WHERE c.empresa_id = v_empresa_id
    AND c.filtros_json->>'class_optin_wave' = '2026-09-01-group-class'
    AND (c.filtros_json->'controlled_reengagement'->>'slot')::integer BETWEEN 2 AND 5
    AND c.status = 'agendada'
    AND c.aprovacao_status = 'aprovada'
    AND c.agendada_para > now();

  IF v_future_count <> 4 THEN
    RAISE EXCEPTION 'Viver metadata repair blocked: expected four untouched future slots, found %', v_future_count;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.orbit_campaigns c
    JOIN public.orbit_campaign_recipients r
      ON r.campaign_id = c.id
     AND r.empresa_id = v_empresa_id
    WHERE c.id = v_campaign_id
      AND c.empresa_id = v_empresa_id
      AND c.status = 'cancelada'
      AND c.motivo_reprovacao = 'PILOT_SOURCE_BLOCKED_NO_RETRY'
      AND r.id = v_recipient_id
      AND r.status = 'ignorado'
      AND r.ignorado_motivo = 'PILOT_SOURCE_BLOCKED_NO_RETRY'
  ) THEN
    RAISE EXCEPTION 'Viver metadata repair failed containment validation';
  END IF;

  INSERT INTO public.orbit_quarantine_backups
    (empresa_id, batch_label, entity_type, entity_id, snapshot)
  VALUES (
    v_empresa_id,
    v_batch_label,
    'class_optin_incident_after',
    v_campaign_id,
    jsonb_build_object(
      'campaign_ref', left(v_campaign_id::text, 8),
      'recipient_ref', left(v_recipient_id::text, 8),
      'outbox_ref', left(v_outbox_id::text, 8),
      'campaign_status', 'cancelada',
      'recipient_status', 'ignorado',
      'outbox_history_changed', false,
      'retry_performed', false,
      'future_slots_validated', v_future_count,
      'tenant_scoped', true
    )
  );
END
$$;
