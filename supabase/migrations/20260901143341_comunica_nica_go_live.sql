-- Comunica: release Nica for future inbound messages without replaying history.
--
-- The tenant, AI runtime and delivery channel were already live. The only two
-- active conversations with recent inbound traffic were stuck in human mode
-- without a human owner or a recorded handoff. This migration clears only
-- that orphaned ownership state after verifying the complete delivery chain.
--
-- Rollback (only if no new inbound was received after this migration): restore
-- human_talk=true for the two conversation ids recorded in the before snapshot.
-- Never roll back after Nica has claimed a later inbound without first
-- containing that conversation.

DO $$
DECLARE
  v_empresa_id CONSTANT uuid := '3b0894d5-87da-473d-a897-33b2d2f230f5'::uuid;
  v_batch_label CONSTANT text := 'comunica_nica_go_live_2026-09-01';
  v_candidates integer;
  v_updated integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.orbit_empresas e
    JOIN public.orbit_ai_config a ON a.empresa_id = e.id
    WHERE e.id = v_empresa_id
      AND e.slug = 'comunica'
      AND e.ativo = true
      AND a.modo_automatico = true
      AND a.prompt_identidade ILIKE '%nica%'
      AND a.auto_reply_new_leads_from IS NOT NULL
      AND a.auto_reply_new_leads_from <= now()
  ) THEN
    RAISE EXCEPTION 'Comunica Nica release blocked: tenant or AI runtime is not live';
  END IF;

  IF (SELECT count(*)
      FROM public.orbit_zapi_config z
      WHERE z.empresa_id = v_empresa_id
        AND z.ativo = true
        AND z.envio_real_liberado = true
        AND coalesce(z.instance_offline, false) = false
        AND coalesce(z.canary_mode_enabled, false) = false
        AND (z.send_block_until IS NULL OR z.send_block_until <= now())) <> 1 THEN
    RAISE EXCEPTION 'Comunica Nica release blocked: expected one online real-send instance';
  END IF;

  IF (SELECT count(*)
      FROM public.orbit_whatsapp_sending_config s
      WHERE s.empresa_id = v_empresa_id
        AND s.enabled = true
        AND s.outbox_adapter_enabled = true
        AND s.daily_limit = 10
        AND s.max_per_minute = 1
        AND s.batch_size = 1) <> 1 THEN
    RAISE EXCEPTION 'Comunica Nica release blocked: sending guardrails differ';
  END IF;

  CREATE TEMP TABLE _comunica_nica_release (
    conversa_id uuid PRIMARY KEY
  ) ON COMMIT DROP;

  INSERT INTO _comunica_nica_release (conversa_id)
  SELECT c.id
  FROM public.orbit_conversas c
  WHERE c.empresa_id = v_empresa_id
    AND c.status = 'aberta'
    AND c.archived_at IS NULL
    AND c.human_talk IS TRUE
    AND c.human_user_id IS NULL
    AND c.handoff_sent_at IS NULL
    AND c.quarantine_reason IS NULL
    AND coalesce(c.ai_processing, false) = false
    AND c.ultima_mensagem_at >= '2026-08-31T11:35:54-03:00'::timestamptz;

  SELECT count(*) INTO v_candidates FROM _comunica_nica_release;
  IF v_candidates <> 2 THEN
    RAISE EXCEPTION 'Comunica Nica release blocked: expected two orphaned active conversations, found %', v_candidates;
  END IF;

  -- Sanitized before-state snapshot. No message content, phone, URL or PII.
  INSERT INTO public.orbit_quarantine_backups
    (empresa_id, batch_label, entity_type, entity_id, snapshot)
  SELECT
    v_empresa_id,
    v_batch_label,
    'comunica_nica_before',
    c.id,
    jsonb_build_object(
      'conversation_ref', left(c.id::text, 8),
      'status', c.status,
      'human_talk', c.human_talk,
      'has_human_owner', c.human_user_id IS NOT NULL,
      'has_handoff', c.handoff_sent_at IS NOT NULL,
      'ai_processing', coalesce(c.ai_processing, false),
      'archived', c.archived_at IS NOT NULL,
      'quarantined', c.quarantine_reason IS NOT NULL,
      'inbound_count_since_go_live', (
        SELECT count(*)
        FROM public.orbit_mensagens m
        WHERE m.empresa_id = v_empresa_id
          AND m.conversa_id = c.id
          AND m.direcao = 'IN'
          AND m."timestamp" >= '2026-08-31T11:35:54-03:00'::timestamptz
      ),
      'history_replayed', false
    )
  FROM public.orbit_conversas c
  JOIN _comunica_nica_release x ON x.conversa_id = c.id;

  UPDATE public.orbit_conversas c
     SET human_talk = false,
         updated_at = now()
    FROM _comunica_nica_release x
   WHERE c.id = x.conversa_id
     AND c.empresa_id = v_empresa_id
     AND c.human_talk IS TRUE
     AND c.human_user_id IS NULL
     AND c.handoff_sent_at IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 2 THEN
    RAISE EXCEPTION 'Comunica Nica release failed: expected two updates, changed %', v_updated;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.orbit_conversas c
    JOIN _comunica_nica_release x ON x.conversa_id = c.id
    WHERE c.empresa_id <> v_empresa_id
       OR c.human_talk IS TRUE
       OR c.human_user_id IS NOT NULL
       OR c.handoff_sent_at IS NOT NULL
       OR c.ai_processing IS TRUE
  ) THEN
    RAISE EXCEPTION 'Comunica Nica release failed post-write validation';
  END IF;

  INSERT INTO public.orbit_quarantine_backups
    (empresa_id, batch_label, entity_type, entity_id, snapshot)
  SELECT
    v_empresa_id,
    v_batch_label,
    'comunica_nica_after',
    c.id,
    jsonb_build_object(
      'conversation_ref', left(c.id::text, 8),
      'human_talk', c.human_talk,
      'has_human_owner', c.human_user_id IS NOT NULL,
      'has_handoff', c.handoff_sent_at IS NOT NULL,
      'ai_processing', coalesce(c.ai_processing, false),
      'runtime_live', true,
      'delivery_live', true,
      'history_replayed', false,
      'tenant_scoped', true
    )
  FROM public.orbit_conversas c
  JOIN _comunica_nica_release x ON x.conversa_id = c.id;
END
$$;
