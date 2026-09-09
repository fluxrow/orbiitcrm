-- Fernanda's third individual-call attempt plus class-only audio reminders.
-- No outbox row or campaign is created here. All sends remain event-driven and
-- are revalidated by the executor immediately before enqueueing.

DO $setup$
DECLARE
  v_empresa_id CONSTANT uuid := '36f26579-66ad-4ef1-9788-141e4c727232'::uuid;
  v_template_10 CONSTANT uuid := 'f8d144b9-8275-4c7a-8484-7bfbdb35dc87'::uuid;
  v_audio_08 CONSTANT uuid := '099885b8-6759-4666-ab8e-ba60fa29e406'::uuid;
  v_audio_09 CONSTANT uuid := 'e7a42dcc-a0bf-466e-8e8e-18b9204dae05'::uuid;
  v_qualified_flow uuid;
  v_review_action uuid;
  v_class_1h_flow CONSTANT uuid := '0c788d3f-0469-424f-a204-891847e704ea'::uuid;
  v_class_15m_flow CONSTANT uuid := 'cf534fb5-6269-45a6-8d2a-183a0b021a6b'::uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.orbit_empresas WHERE id = v_empresa_id
  ) THEN
    RAISE EXCEPTION 'Viver tenant not found';
  END IF;

  INSERT INTO public.orbit_message_templates
    (id, empresa_id, canal, nome, categoria, corpo_texto, ativo, imagem_url, audio_url)
  VALUES (
    v_template_10,
    v_empresa_id,
    'whatsapp',
    'Viver Áudio 10 - Terceira tentativa de call sem agendamento',
    'vendas',
    'Faz sentido para você faturar R$ 50 mil por mês com semijoias? Se sim, me passa o melhor dia e horário para a gente conversar.',
    true,
    NULL,
    'https://orbiitcrm.lovable.app/media/viver/fernanda/10-call-terceira-tentativa-sem-agendamento.mp3'
  )
  ON CONFLICT (id) DO UPDATE SET
    nome = EXCLUDED.nome,
    categoria = EXCLUDED.categoria,
    corpo_texto = EXCLUDED.corpo_texto,
    ativo = true,
    imagem_url = NULL,
    audio_url = EXCLUDED.audio_url,
    updated_at = now()
  WHERE public.orbit_message_templates.empresa_id = EXCLUDED.empresa_id;

  INSERT INTO public.orbit_audio_library
    (id, empresa_id, nome, descricao, url, storage_path, contexto, tags, duracao_ms, ativo)
  VALUES (
    v_template_10,
    v_empresa_id,
    '10 - Terceira tentativa de call sem agendamento',
    'Terceiro e último contato, somente sem resposta e sem reunião agendada.',
    'https://orbiitcrm.lovable.app/media/viver/fernanda/10-call-terceira-tentativa-sem-agendamento.mp3',
    NULL,
    'agendamento',
    ARRAY['fernanda','call','followup'],
    7974,
    true
  )
  ON CONFLICT (id) DO UPDATE SET
    nome = EXCLUDED.nome,
    descricao = EXCLUDED.descricao,
    url = EXCLUDED.url,
    storage_path = NULL,
    contexto = EXCLUDED.contexto,
    tags = EXCLUDED.tags,
    duracao_ms = EXCLUDED.duracao_ms,
    ativo = true,
    updated_at = now()
  WHERE public.orbit_audio_library.empresa_id = EXCLUDED.empresa_id;

  SELECT id INTO STRICT v_qualified_flow
  FROM public.orbit_flows
  WHERE empresa_id = v_empresa_id
    AND nome = 'VIVER - Qualificado -> Call Individual'
    AND ativo = true
    AND deleted_at IS NULL;

  SELECT id INTO STRICT v_review_action
  FROM public.orbit_flow_actions
  WHERE flow_id = v_qualified_flow
    AND ordem = 4
    AND action_type::text = 'create_task'
    AND coalesce((action_config->>'enabled')::boolean, false) = false;

  INSERT INTO public.orbit_quarantine_backups
    (empresa_id, batch_label, entity_type, entity_id, snapshot)
  SELECT v_empresa_id,
    'viver_fernanda_third_call_and_class_reminders_2026-09-09',
    'orbit_flow_action_before',
    a.id,
    to_jsonb(a)
  FROM public.orbit_flow_actions a
  WHERE a.id = v_review_action
    AND NOT EXISTS (
      SELECT 1 FROM public.orbit_quarantine_backups b
      WHERE b.empresa_id = v_empresa_id
        AND b.batch_label = 'viver_fernanda_third_call_and_class_reminders_2026-09-09'
        AND b.entity_type = 'orbit_flow_action_before'
        AND b.entity_id = a.id
    );

  UPDATE public.orbit_flow_actions
  SET ordem = 5, updated_at = now()
  WHERE id = v_review_action;

  IF NOT EXISTS (
    SELECT 1 FROM public.orbit_flow_actions
    WHERE flow_id = v_qualified_flow AND ordem = 4
  ) THEN
    INSERT INTO public.orbit_flow_actions
      (id, flow_id, ordem, action_type, action_config, delay_seconds)
    VALUES (
      'a39e88e2-fe44-453a-a48e-0449830e9ee1'::uuid,
      v_qualified_flow,
      4,
      'send_whatsapp_template',
      jsonb_build_object(
        'template_id', v_template_10,
        'enabled', true,
        'cancel_on_reply', true,
        'dry_run', false,
        'category', 'follow_up',
        'viver_controlled_followup', true,
        'viver_third_call_attempt', true,
        'pilot_not_before', '2026-09-09T03:00:00Z'
      ),
      604800
    );
  END IF;

  -- Generic individual-meeting reminders must not duplicate Fernanda's
  -- class-only audio sequence.
  INSERT INTO public.orbit_quarantine_backups
    (empresa_id, batch_label, entity_type, entity_id, snapshot)
  SELECT v_empresa_id,
    'viver_fernanda_third_call_and_class_reminders_2026-09-09',
    'orbit_flow_before',
    f.id,
    to_jsonb(f)
  FROM public.orbit_flows f
  WHERE f.empresa_id = v_empresa_id
    AND f.nome IN (
      'Viver - Lembrete seguro de reunião 24h',
      'Viver - Lembrete seguro de reunião 5min'
    )
    AND f.ativo = true
    AND f.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.orbit_quarantine_backups b
      WHERE b.empresa_id = v_empresa_id
        AND b.batch_label = 'viver_fernanda_third_call_and_class_reminders_2026-09-09'
        AND b.entity_type = 'orbit_flow_before'
        AND b.entity_id = f.id
    );

  INSERT INTO public.orbit_quarantine_backups
    (empresa_id, batch_label, entity_type, entity_id, snapshot)
  SELECT v_empresa_id,
    'viver_fernanda_third_call_and_class_reminders_2026-09-09',
    'orbit_flow_action_before',
    a.id,
    to_jsonb(a)
  FROM public.orbit_flow_actions a
  JOIN public.orbit_flows f ON f.id = a.flow_id
  WHERE f.empresa_id = v_empresa_id
    AND f.nome IN (
      'Viver - Lembrete seguro de reunião 24h',
      'Viver - Lembrete seguro de reunião 5min'
    )
    AND f.ativo = true
    AND f.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.orbit_quarantine_backups b
      WHERE b.empresa_id = v_empresa_id
        AND b.batch_label = 'viver_fernanda_third_call_and_class_reminders_2026-09-09'
        AND b.entity_type = 'orbit_flow_action_before'
        AND b.entity_id = a.id
    );

  UPDATE public.orbit_flows
  SET condicoes = CASE
        WHEN jsonb_typeof(condicoes) = 'object' THEN condicoes
        ELSE '{}'::jsonb
      END ||
        jsonb_build_object('exclude_meeting_kind', 'viver_group_class'),
      updated_at = now()
  WHERE empresa_id = v_empresa_id
    AND nome IN (
      'Viver - Lembrete seguro de reunião 24h',
      'Viver - Lembrete seguro de reunião 5min'
    )
    AND ativo = true
    AND deleted_at IS NULL;

  UPDATE public.orbit_flow_actions a
  SET action_config = coalesce(a.action_config, '{}'::jsonb) ||
        jsonb_build_object('exclude_meeting_kind', 'viver_group_class'),
      updated_at = now()
  FROM public.orbit_flows f
  WHERE f.id = a.flow_id
    AND f.empresa_id = v_empresa_id
    AND f.nome IN (
      'Viver - Lembrete seguro de reunião 24h',
      'Viver - Lembrete seguro de reunião 5min'
    )
    AND f.ativo = true
    AND f.deleted_at IS NULL;

  INSERT INTO public.orbit_flows
    (id, empresa_id, nome, descricao, trigger_type, trigger_config, condicoes, ativo)
  VALUES
    (
      v_class_1h_flow,
      v_empresa_id,
      'Viver - Aula em grupo - Áudio 1h',
      'Lembrete da aula de terça, exclusivamente para presença confirmada.',
      'meeting_reminder_1h',
      '{}'::jsonb,
      jsonb_build_object('meeting_kind', 'viver_group_class'),
      true
    ),
    (
      v_class_15m_flow,
      v_empresa_id,
      'Viver - Aula em grupo - Áudio 15min',
      'Último lembrete da aula de terça, exclusivamente para presença confirmada.',
      'meeting_reminder_15m',
      '{}'::jsonb,
      jsonb_build_object('meeting_kind', 'viver_group_class'),
      true
    )
  ON CONFLICT (id) DO UPDATE SET
    nome = EXCLUDED.nome,
    descricao = EXCLUDED.descricao,
    trigger_type = EXCLUDED.trigger_type,
    trigger_config = EXCLUDED.trigger_config,
    condicoes = EXCLUDED.condicoes,
    ativo = true,
    deleted_at = NULL,
    updated_at = now()
  WHERE public.orbit_flows.empresa_id = EXCLUDED.empresa_id;

  INSERT INTO public.orbit_flow_actions
    (id, flow_id, ordem, action_type, action_config, delay_seconds)
  VALUES
    (
      '6533b829-2bdd-45e6-a2a4-71aaad564e62'::uuid,
      v_class_1h_flow,
      0,
      'send_whatsapp_template',
      jsonb_build_object(
        'template_id', v_audio_08,
        'channel', 'whatsapp',
        'enabled', true,
        'dry_run', false,
        'required_meeting_kind', 'viver_group_class'
      ),
      0
    ),
    (
      '2805af68-2a16-4b24-a70b-3fa63c6beb10'::uuid,
      v_class_15m_flow,
      0,
      'send_whatsapp_template',
      jsonb_build_object(
        'template_id', v_audio_09,
        'channel', 'whatsapp',
        'enabled', true,
        'dry_run', false,
        'required_meeting_kind', 'viver_group_class'
      ),
      0
    )
  ON CONFLICT (id) DO UPDATE SET
    flow_id = EXCLUDED.flow_id,
    ordem = EXCLUDED.ordem,
    action_type = EXCLUDED.action_type,
    action_config = EXCLUDED.action_config,
    delay_seconds = EXCLUDED.delay_seconds,
    updated_at = now();

  IF NOT EXISTS (
    SELECT 1
    FROM public.orbit_flow_actions
    WHERE flow_id = v_qualified_flow
      AND ordem = 4
      AND delay_seconds = 604800
      AND action_config->>'template_id' = v_template_10::text
      AND action_config->>'cancel_on_reply' = 'true'
      AND action_config->>'enabled' = 'true'
  ) THEN
    RAISE EXCEPTION 'Viver third call attempt validation failed';
  END IF;

  IF (
    SELECT count(*)
    FROM public.orbit_flows f
    JOIN public.orbit_flow_actions a ON a.flow_id = f.id
    WHERE f.empresa_id = v_empresa_id
      AND f.id IN (v_class_1h_flow, v_class_15m_flow)
      AND f.ativo = true
      AND f.condicoes->>'meeting_kind' = 'viver_group_class'
      AND a.action_config->>'required_meeting_kind' = 'viver_group_class'
      AND a.action_config->>'enabled' = 'true'
  ) <> 2 THEN
    RAISE EXCEPTION 'Viver class reminder validation failed';
  END IF;
END
$setup$;
