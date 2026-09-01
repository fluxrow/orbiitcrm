-- Viver: one-shot, permission-only invitation for the 2026-09-01 group class.
-- No meeting or link is created by this migration. A prospect must answer SIM
-- explicitly before the existing meeting reminder lifecycle can include them.
--
-- Rollback before dispatch:
--   UPDATE orbit_campaigns SET status='cancelada'
--   WHERE empresa_id='36f26579-66ad-4ef1-9788-141e4c727232'
--     AND filtros_json->>'class_optin_wave'='2026-09-01-group-class';
-- Messages already accepted by the provider are intentionally irreversible.

CREATE OR REPLACE FUNCTION public.viver_class_optin_expiry_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_filters jsonb;
  v_not_after timestamptz;
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

  BEGIN
    v_not_after := (v_filters->>'not_after')::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    v_not_after := NULL;
  END;

  -- Fail closed both for malformed/missing cutoff and for an expired invitation.
  IF v_not_after IS NULL OR now() > v_not_after THEN
    NEW.status := 'canceled';
    NEW.canceled_at := now();
    NEW.canceled_reason := 'class_optin_window_closed';
    NEW.last_error := NULL;
    NEW.metadata := coalesce(NEW.metadata, '{}'::jsonb)
      || jsonb_build_object('class_optin_expired', true);

    UPDATE public.orbit_campaign_recipients
       SET status = 'ignorado',
           ignorado_em = now(),
           ignorado_motivo = 'class_optin_window_closed',
           erro = NULL
     WHERE id::text = NEW.source_id
       AND campaign_id = NEW.campaign_id
       AND empresa_id = NEW.empresa_id
       AND status = 'pendente';

    UPDATE public.orbit_campaigns
       SET status = 'cancelada',
           motivo_reprovacao = 'class_optin_window_closed',
           updated_at = now()
     WHERE id = NEW.campaign_id
       AND empresa_id = NEW.empresa_id
       AND status NOT IN ('cancelada', 'concluida', 'falha');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_viver_class_optin_expiry_guard
  ON public.orbit_whatsapp_outbox;
CREATE TRIGGER trg_viver_class_optin_expiry_guard
BEFORE INSERT ON public.orbit_whatsapp_outbox
FOR EACH ROW
EXECUTE FUNCTION public.viver_class_optin_expiry_guard();

DO $$
DECLARE
  v_empresa_id CONSTANT uuid := '36f26579-66ad-4ef1-9788-141e4c727232'::uuid;
  v_batch_label CONSTANT text := 'viver_class_optin_2026-09-01';
  v_template_name CONSTANT text := 'Viver - Opt-in Aula Grupo 2026-09-01';
  v_message CONSTANT text := 'Oi, {{nome}}! Hoje, às 19h30, teremos uma aula online em grupo da Viver Semijoias sobre como estruturar um negócio com semijoias. Você quer participar e receber o link por aqui? Responda SIM para confirmar.';
  v_not_after CONSTANT timestamptz := '2026-09-01T17:45:00-03:00'::timestamptz;
  v_actor_id uuid;
  v_template_id uuid;
  v_target_count integer;
  v_eligible_count integer;
BEGIN
  CREATE TEMP TABLE _viver_class_optin_wave (
    prospect_ref text PRIMARY KEY,
    target_name text NOT NULL UNIQUE,
    scheduled_at timestamptz NOT NULL UNIQUE,
    slot integer NOT NULL UNIQUE,
    prospect_id uuid,
    campaign_id uuid NOT NULL DEFAULT gen_random_uuid(),
    recipient_id uuid NOT NULL DEFAULT gen_random_uuid()
  ) ON COMMIT DROP;

  INSERT INTO _viver_class_optin_wave
    (prospect_ref, target_name, scheduled_at, slot)
  VALUES
    ('38b41eb8', 'VIVER - Opt-in Aula Grupo 01 - 2026-09-01', '2026-09-01T11:15:00-03:00', 1),
    ('f2187b6a', 'VIVER - Opt-in Aula Grupo 02 - 2026-09-01', '2026-09-01T12:00:00-03:00', 2),
    ('bad21d6c', 'VIVER - Opt-in Aula Grupo 03 - 2026-09-01', '2026-09-01T14:15:00-03:00', 3),
    ('275ed1a8', 'VIVER - Opt-in Aula Grupo 04 - 2026-09-01', '2026-09-01T15:15:00-03:00', 4),
    ('5fc39010', 'VIVER - Opt-in Aula Grupo 05 - 2026-09-01', '2026-09-01T16:15:00-03:00', 5);

  UPDATE _viver_class_optin_wave w
     SET prospect_id = p.id
    FROM public.orbit_prospects p
   WHERE p.empresa_id = v_empresa_id
     AND left(p.id::text, 8) = w.prospect_ref;

  IF (SELECT count(*) FROM _viver_class_optin_wave WHERE prospect_id IS NOT NULL) <> 5
     OR (SELECT count(DISTINCT prospect_id) FROM _viver_class_optin_wave) <> 5 THEN
    RAISE EXCEPTION 'Viver class opt-in blocked: target references are not five unique tenant prospects';
  END IF;

  SELECT count(*)
    INTO v_target_count
  FROM public.orbit_campaigns c
  JOIN _viver_class_optin_wave w ON w.target_name = c.nome
  JOIN public.orbit_campaign_recipients r
    ON r.campaign_id = c.id
   AND r.empresa_id = v_empresa_id
   AND r.prospect_id = w.prospect_id
  WHERE c.empresa_id = v_empresa_id
    AND c.template_id IN (
      SELECT id FROM public.orbit_message_templates
      WHERE empresa_id = v_empresa_id AND nome = v_template_name
    )
    AND c.agendada_para = w.scheduled_at;

  IF v_target_count = 5 THEN
    RETURN;
  ELSIF v_target_count > 0 OR EXISTS (
    SELECT 1
    FROM public.orbit_campaigns c
    JOIN _viver_class_optin_wave w ON w.target_name = c.nome
    WHERE c.empresa_id = v_empresa_id
  ) THEN
    RAISE EXCEPTION 'Viver class opt-in blocked: partial target wave detected';
  END IF;

  IF EXISTS (
    SELECT 1 FROM _viver_class_optin_wave
    WHERE scheduled_at <= now() + interval '5 minutes'
  ) THEN
    RAISE EXCEPTION 'Viver class opt-in blocked: a cadence slot is no longer safely in the future';
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
    RAISE EXCEPTION 'Viver class opt-in blocked: sending config differs from approved guardrails';
  END IF;

  SELECT count(*)
    INTO v_eligible_count
  FROM _viver_class_optin_wave w
  JOIN public.orbit_prospects p
    ON p.id = w.prospect_id
   AND p.empresa_id = v_empresa_id
  WHERE p.origem_lead = 'lead_source:typebot'
    AND p.deleted_at IS NULL
    AND coalesce(p.optout_whatsapp, false) = false
    AND coalesce(nullif(p.whatsapp, ''), nullif(p.telefone, '')) IS NOT NULL
    AND NOT (
      coalesce(lower(p.nome_razao), '') LIKE '%smoke%'
      OR coalesce(lower(p.nome_contato), '') LIKE '%smoke%'
      OR coalesce(lower(p.nome_fantasia), '') LIKE '%smoke%'
      OR coalesce(lower(p.email_principal), '') ~ '(^fbcfarias\\+fabrica-|@example\\.(com|org|net)$)'
      OR EXISTS (
        SELECT 1 FROM unnest(coalesce(p.tags, ARRAY[]::text[])) tag
        WHERE lower(tag) LIKE ANY (ARRAY['%smoke%', '%teste%', '%synthetic%'])
      )
    )
    AND EXISTS (
      SELECT 1
      FROM public.orbit_flow_runs fr
      JOIN public.orbit_flows f
        ON f.id = fr.flow_id
       AND f.empresa_id = v_empresa_id
      WHERE fr.empresa_id = v_empresa_id
        AND fr.entity_id = p.id
        AND f.nome = 'VIVER - Baixo capital -> Aula Grupo'
        AND fr.created_at >= '2026-08-31T00:00:00-03:00'::timestamptz
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.orbit_conversas cv
      JOIN public.orbit_mensagens msg ON msg.conversa_id = cv.id
      WHERE cv.empresa_id = v_empresa_id
        AND cv.prospect_id = p.id
        AND msg.direcao = 'IN'
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
      WHERE m.empresa_id = v_empresa_id
        AND m.prospect_id = p.id
        AND m.status IN ('scheduled', 'rescheduled', 'active')
        AND m.scheduled_at >= now()
    );

  IF v_eligible_count <> 5 THEN
    RAISE EXCEPTION 'Viver class opt-in blocked: expected five clean prospects, found %', v_eligible_count;
  END IF;

  SELECT c.aprovado_por
    INTO v_actor_id
  FROM public.orbit_campaigns c
  WHERE c.empresa_id = v_empresa_id
    AND c.aprovacao_status = 'aprovada'
    AND c.aprovado_por IS NOT NULL
  ORDER BY c.aprovado_em DESC NULLS LAST
  LIMIT 1;

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Viver class opt-in blocked: no tenant approver available';
  END IF;

  SELECT id
    INTO v_template_id
  FROM public.orbit_message_templates
  WHERE empresa_id = v_empresa_id
    AND nome = v_template_name;

  IF v_template_id IS NULL THEN
    v_template_id := gen_random_uuid();
    INSERT INTO public.orbit_message_templates (
      id, canal, nome, categoria, assunto_email, corpo_html, corpo_texto,
      variaveis, ativo, created_at, updated_at, empresa_id, imagem_url,
      whatsapp_cta_enabled
    ) VALUES (
      v_template_id, 'whatsapp', v_template_name, 'marketing', NULL, NULL,
      v_message, ARRAY['nome']::text[], true, now(), now(), v_empresa_id,
      NULL, false
    );
  ELSIF NOT EXISTS (
    SELECT 1
    FROM public.orbit_message_templates
    WHERE id = v_template_id
      AND empresa_id = v_empresa_id
      AND canal = 'whatsapp'
      AND ativo = true
      AND corpo_texto = v_message
      AND coalesce(whatsapp_cta_enabled, false) = false
  ) THEN
    RAISE EXCEPTION 'Viver class opt-in blocked: template name exists with divergent content';
  END IF;

  -- Sanitized before-state snapshot: no names, phones, messages, URLs or PII.
  INSERT INTO public.orbit_quarantine_backups
    (empresa_id, batch_label, entity_type, entity_id, snapshot)
  SELECT
    v_empresa_id,
    v_batch_label,
    'class_optin_before',
    w.prospect_id,
    jsonb_build_object(
      'prospect_id', w.prospect_id,
      'prospect_ref', w.prospect_ref,
      'deleted', p.deleted_at IS NOT NULL,
      'optout', coalesce(p.optout_whatsapp, false),
      'consent', coalesce(p.consentimento_whatsapp, false),
      'inbound_count', (
        SELECT count(*)
        FROM public.orbit_conversas cv
        JOIN public.orbit_mensagens msg ON msg.conversa_id = cv.id
        WHERE cv.empresa_id = v_empresa_id
          AND cv.prospect_id = p.id
          AND msg.direcao = 'IN'
      ),
      'future_meeting_count', (
        SELECT count(*)
        FROM public.orbit_meetings m
        WHERE m.empresa_id = v_empresa_id
          AND m.prospect_id = p.id
          AND m.scheduled_at >= now()
          AND m.status IN ('scheduled', 'rescheduled', 'active')
      ),
      'manual_send', false
    )
  FROM _viver_class_optin_wave w
  JOIN public.orbit_prospects p ON p.id = w.prospect_id;

  INSERT INTO public.orbit_campaigns (
    id, canal, nome, publico_origem, filtros_json, template_id, status,
    agendada_para, total_destinatarios, enviados, falhas, aberturas,
    cliques, respostas, aprovacao_status, aprovado_por, aprovado_em,
    motivo_reprovacao, created_by, created_at, updated_at, empresa_id,
    whatsapp_cta_override, whatsapp_cta_enabled, ignorados
  )
  SELECT
    w.campaign_id,
    'whatsapp',
    w.target_name,
    'manual_selection',
    jsonb_build_object(
      'selected_prospect_ids', jsonb_build_array(w.prospect_id::text),
      'consent_strategy', 'permission_request_only',
      'class_optin_wave', '2026-09-01-group-class',
      'class_occurrence_key', '2026-09-01T19:30:00-03:00',
      'operational_date', '2026-09-01',
      'timezone', 'America/Sao_Paulo',
      'not_after', v_not_after,
      'one_message_only', true,
      'link_before_explicit_acceptance', false,
      'campaign_safety', jsonb_build_object(
        'skip_if_contacted', false,
        'skip_if_replied', true,
        'skip_if_handoff', true,
        'skip_if_future_meeting', true,
        'skip_if_terminal', true,
        'skip_if_deleted', true,
        'skip_if_optout', true,
        'skip_if_synthetic', true
      ),
      'controlled_reengagement', jsonb_build_object(
        'daily_cap', 5,
        'requires_day_close_review', true,
        'slot', w.slot,
        'source_form', 'typebot',
        'wave', 'class-optin-2026-09-01'
      )
    ),
    v_template_id,
    'agendada',
    w.scheduled_at,
    1, 0, 0, 0, 0, 0,
    'aprovada',
    v_actor_id,
    now(),
    NULL,
    v_actor_id,
    now(),
    now(),
    v_empresa_id,
    false,
    false,
    0
  FROM _viver_class_optin_wave w;

  INSERT INTO public.orbit_campaign_recipients (
    id, campaign_id, prospect_id, telefone, email, status, erro,
    enviado_em, created_at, empresa_id, resend_email_id, delivered_at,
    opened_at, clicked_at, bounced_at, complained_at, engagement_status,
    ignorado_em, ignorado_motivo
  )
  SELECT
    w.recipient_id,
    w.campaign_id,
    p.id,
    coalesce(nullif(p.whatsapp, ''), nullif(p.telefone, '')),
    p.email_principal,
    'pendente',
    NULL, NULL, now(), v_empresa_id,
    NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
  FROM _viver_class_optin_wave w
  JOIN public.orbit_prospects p ON p.id = w.prospect_id;

  INSERT INTO public.orbit_campaign_approvals
    (id, campaign_id, empresa_id, acao, user_id, motivo, created_at)
  SELECT
    gen_random_uuid(),
    w.campaign_id,
    v_empresa_id,
    'aprovada',
    v_actor_id,
    'Pedido único de permissão para aula em grupo, autorizado em 2026-09-01; sem link antes de aceite explícito.',
    now()
  FROM _viver_class_optin_wave w;

  SELECT count(*)
    INTO v_target_count
  FROM public.orbit_campaigns c
  JOIN _viver_class_optin_wave w ON w.campaign_id = c.id
  JOIN public.orbit_campaign_recipients r
    ON r.campaign_id = c.id
   AND r.empresa_id = v_empresa_id
   AND r.prospect_id = w.prospect_id
   AND r.status = 'pendente'
  WHERE c.empresa_id = v_empresa_id
    AND c.status = 'agendada'
    AND c.aprovacao_status = 'aprovada'
    AND c.agendada_para = w.scheduled_at
    AND c.template_id = v_template_id;

  IF v_target_count <> 5 THEN
    RAISE EXCEPTION 'Viver class opt-in failed validation: expected five scheduled campaigns, found %', v_target_count;
  END IF;

  INSERT INTO public.orbit_quarantine_backups
    (empresa_id, batch_label, entity_type, entity_id, snapshot)
  SELECT
    v_empresa_id,
    v_batch_label,
    'class_optin_after',
    w.campaign_id,
    jsonb_build_object(
      'campaign_id', w.campaign_id,
      'recipient_id', w.recipient_id,
      'prospect_ref', w.prospect_ref,
      'status', 'agendada',
      'approval_status', 'aprovada',
      'scheduled_at', w.scheduled_at,
      'not_after', v_not_after,
      'slot', w.slot,
      'daily_cap', 5,
      'tenant_scoped', true,
      'one_message_only', true,
      'link_in_message', false,
      'manual_send', false
    )
  FROM _viver_class_optin_wave w;
END
$$;
