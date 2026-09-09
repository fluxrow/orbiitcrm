-- Controlled Viver ramp requested by Fernanda: 5, then 8, then 10 untouched
-- Typebot leads. One recipient per campaign preserves profile-specific audio,
-- idempotency and the existing one-message-at-a-time worker gates.

DO $$
DECLARE
  v_empresa_id CONSTANT uuid := '36f26579-66ad-4ef1-9788-141e4c727232'::uuid;
  v_batch_label CONSTANT text := 'viver_fernanda_audio_ramp_5_8_10_2026-09-09';
  v_actor uuid;
  v_existing integer;
  v_eligible integer;
  v_inserted integer;
BEGIN
  SELECT coalesce(c.aprovado_por,c.created_by)
    INTO v_actor
  FROM public.orbit_campaigns c
  WHERE c.empresa_id=v_empresa_id
    AND coalesce(c.aprovado_por,c.created_by) IS NOT NULL
  ORDER BY c.aprovado_em DESC NULLS LAST,c.created_at DESC
  LIMIT 1;

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Viver audio ramp blocked: no tenant approval authority found';
  END IF;

  SELECT count(*) INTO v_existing
  FROM public.orbit_campaigns c
  WHERE c.empresa_id=v_empresa_id
    AND c.filtros_json->>'batch_label'=v_batch_label;

  IF v_existing=23 THEN
    IF (SELECT count(*) FROM public.orbit_campaign_recipients r
        JOIN public.orbit_campaigns c ON c.id=r.campaign_id
        WHERE c.empresa_id=v_empresa_id AND c.filtros_json->>'batch_label'=v_batch_label) <> 23 THEN
      RAISE EXCEPTION 'Viver audio ramp blocked: complete campaign set has incomplete recipients';
    END IF;
    RETURN;
  ELSIF v_existing>0 THEN
    RAISE EXCEPTION 'Viver audio ramp blocked: partial target batch detected (% campaigns)',v_existing;
  END IF;

  IF now() >= '2026-09-10T09:20:00-03:00'::timestamptz THEN
    RAISE EXCEPTION 'Viver audio ramp blocked: first slot is no longer safely in the future';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.orbit_whatsapp_sending_config s
    WHERE s.empresa_id=v_empresa_id
      AND s.enabled=true
      AND s.outbox_adapter_enabled=true
      AND s.daily_limit=15
      AND s.max_per_minute=1
      AND s.batch_size=1
      AND s.warmup_enabled=true
  ) THEN
    RAISE EXCEPTION 'Viver audio ramp blocked: sending configuration differs from approved baseline';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.orbit_zapi_config z
    WHERE z.empresa_id=v_empresa_id
      AND z.ativo=true
      AND z.envio_real_liberado=true
      AND coalesce(z.instance_offline,false)=false
      AND (z.send_block_until IS NULL OR z.send_block_until<=now())
  ) THEN
    RAISE EXCEPTION 'Viver audio ramp blocked: WhatsApp provider is not safely online';
  END IF;

  IF (SELECT count(*) FROM public.orbit_message_templates t
      WHERE t.empresa_id=v_empresa_id AND t.ativo=true AND t.audio_url IS NOT NULL
        AND t.id IN (
          '5fef6b29-a669-4586-829f-64a5d76e7cf9','3cbb58d9-adaf-4301-9f9e-a4ad6197ea3b',
          'df29b44b-d91a-4626-97b8-6d22a59093ab','42fb9934-9663-4ea4-8163-523682dcdce3'
        )) <> 4 THEN
    RAISE EXCEPTION 'Viver audio ramp blocked: opening audio templates are incomplete';
  END IF;

  CREATE TEMP TABLE _viver_audio_targets (
    global_slot integer PRIMARY KEY,
    day_number integer NOT NULL,
    day_slot integer NOT NULL,
    daily_cap integer NOT NULL,
    operational_date date NOT NULL,
    scheduled_at timestamptz NOT NULL,
    campaign_id uuid NOT NULL DEFAULT gen_random_uuid(),
    recipient_id uuid NOT NULL DEFAULT gen_random_uuid(),
    prospect_id uuid NOT NULL UNIQUE,
    template_id uuid NOT NULL,
    profile text NOT NULL,
    telefone text NOT NULL,
    email text
  ) ON COMMIT DROP;

  INSERT INTO _viver_audio_targets
    (global_slot,day_number,day_slot,daily_cap,operational_date,scheduled_at,
     prospect_id,template_id,profile,telefone,email)
  WITH raw_candidates AS (
    SELECT DISTINCT ON (e.entity_id)
      e.entity_id AS prospect_id,
      e.payload->'raw'->>'momento_negocio' AS profile,
      e.created_at,
      coalesce(nullif(p.whatsapp,''),nullif(p.telefone,'')) AS telefone,
      p.email_principal AS email,
      CASE e.payload->'raw'->>'momento_negocio'
        WHEN 'Já trabalho com semijoias  e tenho estoque' THEN '5fef6b29-a669-4586-829f-64a5d76e7cf9'::uuid
        WHEN 'Já trabalho com semijoias e tenho estoque' THEN '5fef6b29-a669-4586-829f-64a5d76e7cf9'::uuid
        WHEN 'Já tenho revendedoras e quero aumentar a equipe' THEN '3cbb58d9-adaf-4301-9f9e-a4ad6197ea3b'::uuid
        WHEN 'Quero começar a trabalhar com revendedoras' THEN 'df29b44b-d91a-4626-97b8-6d22a59093ab'::uuid
        WHEN 'Já tentei trabalhar com revendedoras e não deu certo' THEN '42fb9934-9663-4ea4-8163-523682dcdce3'::uuid
      END AS template_id
    FROM public.orbit_flow_events e
    JOIN public.orbit_prospects p
      ON p.id=e.entity_id AND p.empresa_id=e.empresa_id
    WHERE e.empresa_id=v_empresa_id
      AND e.event_type::text='lead_recebido'
      AND e.entity_type='prospect'
      AND e.payload->>'source_id'='a56d2fb5-b186-4129-ae4f-8c7e3304c7e4'
      AND e.payload->>'source_tipo'='typebot'
      AND e.created_at>=now()-interval '90 days'
      AND e.created_at<date_trunc('day',now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'
      AND e.payload->'raw'->>'momento_negocio' IN (
        'Já trabalho com semijoias  e tenho estoque','Já trabalho com semijoias e tenho estoque',
        'Já tenho revendedoras e quero aumentar a equipe',
        'Quero começar a trabalhar com revendedoras',
        'Já tentei trabalhar com revendedoras e não deu certo'
      )
      AND coalesce(nullif(p.whatsapp,''),nullif(p.telefone,'')) IS NOT NULL
      AND p.origem_lead='lead_source:typebot'
      AND p.deleted_at IS NULL
      AND coalesce(p.optout_whatsapp,false)=false
      AND NOT EXISTS (
        SELECT 1 FROM unnest(coalesce(p.tags,ARRAY[]::text[])) tag
        WHERE lower(tag) LIKE ANY (ARRAY['%smoke%','%teste%','%synthetic%'])
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.orbit_conversas cv
        WHERE cv.empresa_id=v_empresa_id AND cv.prospect_id=p.id
          AND (cv.human_talk IS TRUE OR cv.human_user_id IS NOT NULL)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.orbit_conversas cv
        JOIN public.orbit_mensagens m ON m.conversa_id=cv.id AND m.empresa_id=cv.empresa_id
        WHERE cv.empresa_id=v_empresa_id AND cv.prospect_id=p.id
          AND (m.direcao='IN' OR (m.direcao='OUT' AND m.status IN ('queued','enviada','sent','entregue','delivered')))
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.orbit_whatsapp_outbox o
        WHERE o.empresa_id=v_empresa_id AND o.prospect_id=p.id
          AND o.status IN ('pending','processing','sent')
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.orbit_campaign_recipients r
        JOIN public.orbit_campaigns c ON c.id=r.campaign_id AND c.empresa_id=v_empresa_id
        WHERE r.empresa_id=v_empresa_id AND r.prospect_id=p.id
          AND r.status IN ('enviado','simulated')
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.orbit_meetings m
        WHERE m.empresa_id=v_empresa_id AND m.prospect_id=p.id
          AND m.status IN ('scheduled','rescheduled')
          AND m.scheduled_at+make_interval(mins=>coalesce(m.duration_minutes,60))>now()
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.orbit_deals d
        LEFT JOIN public.orbit_pipeline_stages s ON s.id=d.etapa_id
        WHERE d.empresa_id=v_empresa_id AND d.prospect_id=p.id
          AND (d.deleted_at IS NOT NULL OR lower(coalesce(d.status,'')) IN ('won','lost','ganho','perdido','deleted') OR s.is_won IS TRUE OR s.is_lost IS TRUE)
      )
    ORDER BY e.entity_id,e.created_at DESC
  ), ranked_profiles AS (
    SELECT r.*,
      row_number() OVER (PARTITION BY template_id ORDER BY created_at,prospect_id) AS profile_slot,
      CASE template_id
        WHEN '5fef6b29-a669-4586-829f-64a5d76e7cf9'::uuid THEN 1
        WHEN '3cbb58d9-adaf-4301-9f9e-a4ad6197ea3b'::uuid THEN 2
        WHEN 'df29b44b-d91a-4626-97b8-6d22a59093ab'::uuid THEN 3
        ELSE 4
      END AS profile_order
    FROM raw_candidates r
  ), selected AS (
    SELECT *,row_number() OVER (ORDER BY profile_slot,profile_order,created_at,prospect_id)::integer AS global_slot
    FROM ranked_profiles
    ORDER BY profile_slot,profile_order,created_at,prospect_id
    LIMIT 23
  ), planned AS (
    SELECT s.*,
      CASE WHEN global_slot<=5 THEN 1 WHEN global_slot<=13 THEN 2 ELSE 3 END AS day_number,
      CASE WHEN global_slot<=5 THEN global_slot WHEN global_slot<=13 THEN global_slot-5 ELSE global_slot-13 END AS day_slot,
      CASE WHEN global_slot<=5 THEN 5 WHEN global_slot<=13 THEN 8 ELSE 10 END AS daily_cap,
      CASE WHEN global_slot<=5 THEN '2026-09-10'::date WHEN global_slot<=13 THEN '2026-09-11'::date ELSE '2026-09-14'::date END AS operational_date
    FROM selected s
  )
  SELECT global_slot,day_number,day_slot,daily_cap,operational_date,
    ((operational_date+time '09:30')+
      make_interval(mins=>CASE daily_cap WHEN 5 THEN (day_slot-1)*120 WHEN 8 THEN (day_slot-1)*68 ELSE (day_slot-1)*53 END)
    ) AT TIME ZONE 'America/Sao_Paulo',
    prospect_id,template_id,profile,telefone,email
  FROM planned;

  SELECT count(*) INTO v_eligible FROM _viver_audio_targets;
  IF v_eligible<>23 THEN
    RAISE EXCEPTION 'Viver audio ramp blocked: expected 23 safe recipients, selected %',v_eligible;
  END IF;

  INSERT INTO public.orbit_campaigns (
    id,canal,nome,publico_origem,filtros_json,template_id,status,agendada_para,
    total_destinatarios,enviados,falhas,aberturas,cliques,respostas,
    aprovacao_status,aprovado_por,aprovado_em,created_by,empresa_id,ignorados
  )
  SELECT campaign_id,'whatsapp',
    format('VIVER - Áudio Fernanda D%s-%s - %s',day_number,lpad(day_slot::text,2,'0'),operational_date),
    'typebot',
    jsonb_build_object(
      'batch_label',v_batch_label,
      'operational_date',operational_date::text,
      'timezone','America/Sao_Paulo',
      'selected_prospect_ids',jsonb_build_array(prospect_id),
      'audio_profile',profile,
      'skip_if_contacted',true,
      'skip_if_replied',true,
      'skip_if_optout',true,
      'skip_if_handoff',true,
      'skip_if_meeting',true,
      'skip_if_terminal',true,
      'controlled_reengagement',jsonb_build_object(
        'daily_cap',daily_cap,
        'requires_day_close_review',true,
        'slot',day_slot,
        'source_form','typebot',
        'wave','fernanda-audio-5-8-10-2026-09-09'
      )
    ),
    template_id,'agendada',scheduled_at,1,0,0,0,0,0,
    'aprovada',v_actor,now(),v_actor,v_empresa_id,0
  FROM _viver_audio_targets;

  INSERT INTO public.orbit_campaign_recipients
    (id,campaign_id,prospect_id,telefone,email,status,created_at,empresa_id)
  SELECT recipient_id,campaign_id,prospect_id,telefone,email,'pendente',now(),v_empresa_id
  FROM _viver_audio_targets;

  INSERT INTO public.orbit_campaign_approvals
    (campaign_id,empresa_id,acao,user_id,motivo,created_at)
  SELECT campaign_id,v_empresa_id,'aprovada',v_actor,
    'Rampa de áudio Fernanda 5/8/10 explicitamente autorizada; seleção sem contato, resposta, opt-out, handoff, reunião ou etapa terminal.',
    now()
  FROM _viver_audio_targets;

  INSERT INTO public.orbit_quarantine_backups
    (empresa_id,batch_label,entity_type,entity_id,snapshot)
  SELECT v_empresa_id,v_batch_label,'campaign_audio_ramp_after',campaign_id,
    jsonb_build_object(
      'campaign_id',campaign_id,
      'recipient_id',recipient_id,
      'prospect_id',prospect_id,
      'day',day_number,
      'slot',day_slot,
      'daily_cap',daily_cap,
      'scheduled_at',scheduled_at,
      'template_id',template_id,
      'tenant_scoped',true,
      'manual_send',false
    )
  FROM _viver_audio_targets;

  SELECT count(*) INTO v_inserted
  FROM public.orbit_campaigns c
  JOIN public.orbit_campaign_recipients r ON r.campaign_id=c.id AND r.empresa_id=v_empresa_id
  WHERE c.empresa_id=v_empresa_id
    AND c.filtros_json->>'batch_label'=v_batch_label
    AND c.status='agendada'
    AND c.aprovacao_status='aprovada'
    AND r.status='pendente';

  IF v_inserted<>23 THEN
    RAISE EXCEPTION 'Viver audio ramp validation failed: expected 23 scheduled recipient rows, found %',v_inserted;
  END IF;

  IF EXISTS (
    SELECT 1 FROM (
      SELECT (c.filtros_json->>'operational_date')::date d,count(*) n
      FROM public.orbit_campaigns c
      WHERE c.empresa_id=v_empresa_id AND c.filtros_json->>'batch_label'=v_batch_label
      GROUP BY 1
    ) x
    WHERE (d='2026-09-10' AND n<>5) OR (d='2026-09-11' AND n<>8) OR (d='2026-09-14' AND n<>10)
  ) THEN
    RAISE EXCEPTION 'Viver audio ramp validation failed: daily distribution differs from 5/8/10';
  END IF;
END $$;
