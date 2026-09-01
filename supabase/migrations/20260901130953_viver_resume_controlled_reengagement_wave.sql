-- Resume the Viver controlled re-engagement campaign from a fresh, future-only
-- schedule. This intentionally does not reopen the historical paused campaigns:
-- one of them already has a canceled outbox row and campaign idempotency would
-- otherwise suppress a legitimate new attempt.
--
-- Rollback before dispatch: set the five campaigns created below to `cancelada`.
-- Messages already accepted by the provider are intentionally not reversible.

DO $$
DECLARE
  v_empresa_id CONSTANT uuid := '36f26579-66ad-4ef1-9788-141e4c727232'::uuid;
  v_batch_label CONSTANT text := 'viver_controlled_reengagement_resume_2026-09-01';
  v_source_count integer;
  v_eligible_count integer;
  v_target_count integer;
BEGIN
  CREATE TEMP TABLE _viver_campaign_wave (
    source_name text PRIMARY KEY,
    target_name text NOT NULL UNIQUE,
    scheduled_at timestamptz NOT NULL,
    operational_date date NOT NULL,
    slot integer NOT NULL,
    target_campaign_id uuid NOT NULL DEFAULT gen_random_uuid(),
    target_recipient_id uuid NOT NULL DEFAULT gen_random_uuid()
  ) ON COMMIT DROP;

  INSERT INTO _viver_campaign_wave
    (source_name, target_name, scheduled_at, operational_date, slot)
  VALUES
    (
      'VIVER - Reengajamento controlado D1-01 - 2026-08-28',
      'VIVER - Reengajamento autorizado D1R-02 - 2026-09-01',
      '2026-09-01T13:30:00-03:00'::timestamptz,
      '2026-09-01'::date,
      2
    ),
    (
      'VIVER - Reengajamento controlado D1-02 - 2026-08-28',
      'VIVER - Reengajamento autorizado D1R-03 - 2026-09-01',
      '2026-09-01T17:30:00-03:00'::timestamptz,
      '2026-09-01'::date,
      3
    ),
    (
      'VIVER - Reengajamento controlado D1-03 - 2026-08-28',
      'VIVER - Reengajamento autorizado D1R-01 - 2026-09-02',
      '2026-09-02T09:30:00-03:00'::timestamptz,
      '2026-09-02'::date,
      1
    ),
    (
      'VIVER - Reengajamento controlado D1R-02 - 2026-08-31',
      'VIVER - Reengajamento autorizado D1R-02 - 2026-09-02',
      '2026-09-02T13:30:00-03:00'::timestamptz,
      '2026-09-02'::date,
      2
    ),
    (
      'VIVER - Reengajamento controlado D1R-03 - 2026-08-31',
      'VIVER - Reengajamento autorizado D1R-03 - 2026-09-02',
      '2026-09-02T17:30:00-03:00'::timestamptz,
      '2026-09-02'::date,
      3
    );

  -- Lovable Cloud can apply a checked-in migration after the same guarded SQL
  -- has already been executed operationally. Treat an exact complete wave as a
  -- successful no-op; reject partial state.
  SELECT count(*)
    INTO v_target_count
  FROM public.orbit_campaigns c
  JOIN _viver_campaign_wave w ON w.target_name = c.nome
  JOIN public.orbit_campaign_recipients r
    ON r.campaign_id = c.id
   AND r.empresa_id = v_empresa_id
  WHERE c.empresa_id = v_empresa_id
    AND c.aprovacao_status = 'aprovada'
    AND c.agendada_para = w.scheduled_at;

  IF v_target_count = 5 THEN
    RETURN;
  ELSIF v_target_count > 0 OR EXISTS (
    SELECT 1
    FROM public.orbit_campaigns c
    JOIN _viver_campaign_wave w ON w.target_name = c.nome
    WHERE c.empresa_id = v_empresa_id
  ) THEN
    RAISE EXCEPTION 'Viver campaign resume blocked: partial target wave detected';
  END IF;

  SELECT count(*)
    INTO v_source_count
  FROM _viver_campaign_wave w
  JOIN public.orbit_campaigns c
    ON c.empresa_id = v_empresa_id
   AND c.nome = w.source_name
   AND c.canal = 'whatsapp'
   AND c.status = 'pausada'
   AND c.aprovacao_status = 'aprovada'
  JOIN public.orbit_message_templates t
    ON t.id = c.template_id
   AND t.empresa_id = v_empresa_id
   AND t.canal = 'whatsapp'
   AND t.ativo = true
  JOIN public.orbit_campaign_recipients r
    ON r.campaign_id = c.id
   AND r.empresa_id = v_empresa_id
   AND r.status = 'pendente';

  IF v_source_count <> 5 THEN
    RAISE EXCEPTION 'Viver campaign resume blocked: expected 5 approved paused source rows, found %', v_source_count;
  END IF;

  IF EXISTS (SELECT 1 FROM _viver_campaign_wave WHERE scheduled_at <= now() + interval '5 minutes') THEN
    RAISE EXCEPTION 'Viver campaign resume blocked: one or more schedule slots are no longer safely in the future';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.orbit_whatsapp_sending_config cfg
    WHERE cfg.empresa_id = v_empresa_id
      AND cfg.enabled = true
      AND cfg.outbox_adapter_enabled = true
      AND cfg.daily_limit = 10
      AND cfg.max_per_minute = 1
      AND cfg.batch_size = 1
      AND cfg.warmup_enabled = true
  ) THEN
    RAISE EXCEPTION 'Viver campaign resume blocked: sending config differs from the approved guardrails';
  END IF;

  WITH source_rows AS (
    SELECT c.id AS campaign_id, r.id AS recipient_id, r.prospect_id
    FROM _viver_campaign_wave w
    JOIN public.orbit_campaigns c
      ON c.empresa_id = v_empresa_id
     AND c.nome = w.source_name
    JOIN public.orbit_campaign_recipients r
      ON r.campaign_id = c.id
     AND r.empresa_id = v_empresa_id
     AND r.status = 'pendente'
  ), eligible AS (
    SELECT s.*
    FROM source_rows s
    JOIN public.orbit_prospects p
      ON p.id = s.prospect_id
     AND p.empresa_id = v_empresa_id
    WHERE p.deleted_at IS NULL
      AND coalesce(p.optout_whatsapp, false) = false
      AND NOT (
        coalesce(lower(p.nome_razao), '') LIKE '%smoke%'
        OR coalesce(lower(p.nome_contato), '') LIKE '%smoke%'
        OR coalesce(lower(p.nome_fantasia), '') LIKE '%smoke%'
        OR coalesce(lower(p.email_principal), '') ~ '(^fbcfarias\\+fabrica-|@example\\.(com|org|net)$)'
        OR EXISTS (
          SELECT 1
          FROM unnest(coalesce(p.tags, ARRAY[]::text[])) tag
          WHERE lower(tag) LIKE ANY (ARRAY['%smoke%', '%teste%', '%synthetic%'])
        )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.orbit_deals d
        LEFT JOIN public.orbit_pipeline_stages ps ON ps.id = d.etapa_id
        WHERE d.empresa_id = v_empresa_id
          AND d.prospect_id = p.id
          AND (
            d.deleted_at IS NOT NULL
            OR lower(coalesce(d.status, '')) IN ('won', 'lost', 'ganho', 'perdido', 'deleted')
            OR ps.is_won IS TRUE
            OR ps.is_lost IS TRUE
          )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.orbit_meetings m
        WHERE m.prospect_id = p.id
          AND m.status IN ('scheduled', 'rescheduled')
          AND m.scheduled_at >= now()
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.orbit_conversas cv
        WHERE cv.empresa_id = v_empresa_id
          AND cv.prospect_id = p.id
          AND (cv.human_talk IS TRUE OR cv.human_user_id IS NOT NULL)
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.orbit_conversas cv
        JOIN public.orbit_mensagens msg ON msg.conversa_id = cv.id
        WHERE cv.empresa_id = v_empresa_id
          AND cv.prospect_id = p.id
          AND msg.direcao = 'OUT'
          AND msg.status IN ('enviada', 'sent', 'entregue', 'delivered')
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.orbit_conversas cv
        JOIN public.orbit_mensagens msg ON msg.conversa_id = cv.id
        WHERE cv.empresa_id = v_empresa_id
          AND cv.prospect_id = p.id
          AND msg.direcao = 'IN'
      )
  )
  SELECT count(DISTINCT prospect_id)
    INTO v_eligible_count
  FROM eligible;

  IF v_eligible_count <> 5 THEN
    RAISE EXCEPTION 'Viver campaign resume blocked: expected 5 currently eligible distinct prospects, found %', v_eligible_count;
  END IF;

  -- Sanitized before-state snapshot: no phone, email, names, message body or URL.
  INSERT INTO public.orbit_quarantine_backups
    (empresa_id, batch_label, entity_type, entity_id, snapshot)
  SELECT
    v_empresa_id,
    v_batch_label,
    'campaign_resume_before',
    c.id,
    jsonb_build_object(
      'campaign_id', c.id,
      'campaign_status', c.status,
      'approval_status', c.aprovacao_status,
      'scheduled_at', c.agendada_para,
      'recipient_id', r.id,
      'prospect_id', r.prospect_id,
      'recipient_status', r.status,
      'outbox_count', (
        SELECT count(*) FROM public.orbit_whatsapp_outbox o
        WHERE o.empresa_id = v_empresa_id AND o.campaign_id = c.id
      ),
      'message_count', (
        SELECT count(*) FROM public.orbit_mensagens m
        WHERE m.empresa_id = v_empresa_id AND m.campaign_id = c.id
      )
    )
  FROM _viver_campaign_wave w
  JOIN public.orbit_campaigns c
    ON c.empresa_id = v_empresa_id AND c.nome = w.source_name
  JOIN public.orbit_campaign_recipients r
    ON r.campaign_id = c.id AND r.empresa_id = v_empresa_id AND r.status = 'pendente';

  INSERT INTO public.orbit_campaigns (
    id, canal, nome, publico_origem, filtros_json, template_id, status,
    agendada_para, total_destinatarios, enviados, falhas, aberturas,
    cliques, respostas, aprovacao_status, aprovado_por, aprovado_em,
    motivo_reprovacao, created_by, created_at, updated_at, empresa_id,
    whatsapp_cta_override, whatsapp_cta_enabled, whatsapp_cta_numero,
    whatsapp_cta_texto_botao, whatsapp_cta_mensagem_inicial,
    whatsapp_cta_posicao, ignorados
  )
  SELECT
    w.target_campaign_id,
    c.canal,
    w.target_name,
    c.publico_origem,
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              coalesce(c.filtros_json, '{}'::jsonb),
              '{consent_strategy}',
              '"permission_request_only"'::jsonb,
              true
            ),
            '{operational_date}',
            to_jsonb(w.operational_date::text),
            true
          ),
          '{prepared_on}',
          to_jsonb('2026-09-01'::text),
          true
        ),
        '{timezone}',
        '"America/Sao_Paulo"'::jsonb,
        true
      ),
      '{controlled_reengagement}',
      jsonb_build_object(
        'daily_cap', 3,
        'requires_day_close_review', true,
        'slot', w.slot,
        'source_form', 'typebot',
        'wave', 'D1R-2026-09-01-authorized'
      ),
      true
    ),
    c.template_id,
    'agendada',
    w.scheduled_at,
    1,
    0,
    0,
    0,
    0,
    0,
    'aprovada',
    c.aprovado_por,
    now(),
    NULL,
    c.created_by,
    now(),
    now(),
    v_empresa_id,
    c.whatsapp_cta_override,
    c.whatsapp_cta_enabled,
    c.whatsapp_cta_numero,
    c.whatsapp_cta_texto_botao,
    c.whatsapp_cta_mensagem_inicial,
    c.whatsapp_cta_posicao,
    0
  FROM _viver_campaign_wave w
  JOIN public.orbit_campaigns c
    ON c.empresa_id = v_empresa_id AND c.nome = w.source_name;

  INSERT INTO public.orbit_campaign_recipients (
    id, campaign_id, prospect_id, telefone, email, status, erro,
    enviado_em, created_at, empresa_id, resend_email_id, delivered_at,
    opened_at, clicked_at, bounced_at, complained_at, engagement_status,
    ignorado_em, ignorado_motivo
  )
  SELECT
    w.target_recipient_id,
    w.target_campaign_id,
    r.prospect_id,
    r.telefone,
    r.email,
    'pendente',
    NULL,
    NULL,
    now(),
    v_empresa_id,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL
  FROM _viver_campaign_wave w
  JOIN public.orbit_campaigns c
    ON c.empresa_id = v_empresa_id AND c.nome = w.source_name
  JOIN public.orbit_campaign_recipients r
    ON r.campaign_id = c.id AND r.empresa_id = v_empresa_id AND r.status = 'pendente';

  INSERT INTO public.orbit_campaign_approvals
    (id, campaign_id, empresa_id, acao, user_id, motivo, created_at)
  SELECT
    gen_random_uuid(),
    w.target_campaign_id,
    v_empresa_id,
    'aprovada',
    c.aprovado_por,
    'Retomada futura e controlada autorizada explicitamente em 2026-09-01; sem backlog ou retry manual.',
    now()
  FROM _viver_campaign_wave w
  JOIN public.orbit_campaigns c
    ON c.empresa_id = v_empresa_id AND c.nome = w.source_name;

  SELECT count(*)
    INTO v_target_count
  FROM public.orbit_campaigns c
  JOIN _viver_campaign_wave w ON w.target_campaign_id = c.id
  JOIN public.orbit_campaign_recipients r
    ON r.campaign_id = c.id
   AND r.empresa_id = v_empresa_id
   AND r.status = 'pendente'
  WHERE c.empresa_id = v_empresa_id
    AND c.status = 'agendada'
    AND c.aprovacao_status = 'aprovada'
    AND c.agendada_para = w.scheduled_at;

  IF v_target_count <> 5 THEN
    RAISE EXCEPTION 'Viver campaign resume failed validation: expected 5 scheduled targets, found %', v_target_count;
  END IF;

  -- Sanitized after-state audit. The old paused campaigns remain unchanged.
  INSERT INTO public.orbit_quarantine_backups
    (empresa_id, batch_label, entity_type, entity_id, snapshot)
  SELECT
    v_empresa_id,
    v_batch_label,
    'campaign_resume_after',
    w.target_campaign_id,
    jsonb_build_object(
      'campaign_id', w.target_campaign_id,
      'recipient_id', w.target_recipient_id,
      'status', 'agendada',
      'approval_status', 'aprovada',
      'scheduled_at', w.scheduled_at,
      'operational_date', w.operational_date,
      'slot', w.slot,
      'daily_cap', 3,
      'tenant_scoped', true,
      'manual_send', false,
      'historical_campaign_mutated', false
    )
  FROM _viver_campaign_wave w;
END
$$;
