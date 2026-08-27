-- Tenant-scoped reminder templates and flows. They are created inactive and
-- cannot enqueue WhatsApp messages before the separate canary activation.

DO $reminders$
DECLARE
  v_empresa_id uuid;
  v_template_24h uuid;
  v_template_5m uuid;
  v_flow_24h uuid;
  v_flow_5m uuid;
BEGIN
  SELECT id INTO v_empresa_id
  FROM public.orbit_empresas
  WHERE slug = 'viver-semijoias';

  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'VIVER_TENANT_NOT_FOUND';
  END IF;

  SELECT id INTO v_template_24h
  FROM public.orbit_message_templates
  WHERE empresa_id = v_empresa_id
    AND nome = 'Viver - Lembrete seguro de reunião 24h'
  ORDER BY created_at
  LIMIT 1;

  IF v_template_24h IS NULL THEN
    INSERT INTO public.orbit_message_templates (
      empresa_id, canal, nome, categoria, corpo_texto, variaveis, ativo
    ) VALUES (
      v_empresa_id,
      'whatsapp',
      'Viver - Lembrete seguro de reunião 24h',
      'reuniao',
      E'Olá, {{nome}}. Passando para confirmar nossa conversa de amanhã às {{meeting.hora}}.\n\nO acesso é este: {{meeting.url}}\n\nSe precisar ajustar, me avise por aqui.',
      ARRAY['nome', 'meeting.hora', 'meeting.url']::text[],
      true
    ) RETURNING id INTO v_template_24h;
  END IF;

  SELECT id INTO v_template_5m
  FROM public.orbit_message_templates
  WHERE empresa_id = v_empresa_id
    AND nome = 'Viver - Lembrete seguro de reunião 5min'
  ORDER BY created_at
  LIMIT 1;

  IF v_template_5m IS NULL THEN
    INSERT INTO public.orbit_message_templates (
      empresa_id, canal, nome, categoria, corpo_texto, variaveis, ativo
    ) VALUES (
      v_empresa_id,
      'whatsapp',
      'Viver - Lembrete seguro de reunião 5min',
      'reuniao',
      E'Olá, {{nome}}. Nossa conversa começa em 5 minutos, às {{meeting.hora}}.\n\nEste é o link de acesso: {{meeting.url}}\n\nQuando puder, pode entrar por aqui.',
      ARRAY['nome', 'meeting.hora', 'meeting.url']::text[],
      true
    ) RETURNING id INTO v_template_5m;
  END IF;

  SELECT id INTO v_flow_24h
  FROM public.orbit_flows
  WHERE empresa_id = v_empresa_id
    AND nome = 'Viver - Lembrete seguro de reunião 24h'
    AND deleted_at IS NULL
  ORDER BY created_at
  LIMIT 1;

  IF v_flow_24h IS NULL THEN
    INSERT INTO public.orbit_flows (
      empresa_id, nome, descricao, trigger_type, trigger_config, condicoes, ativo
    ) VALUES (
      v_empresa_id,
      'Viver - Lembrete seguro de reunião 24h',
      'Lembrete transacional tenant-scoped; permanece inativo até homologação.',
      'meeting_reminder_24h',
      '{}'::jsonb,
      '[]'::jsonb,
      false
    ) RETURNING id INTO v_flow_24h;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.orbit_flow_actions
    WHERE flow_id = v_flow_24h AND ordem = 0
  ) THEN
    INSERT INTO public.orbit_flow_actions (
      flow_id, ordem, action_type, action_config, delay_seconds
    ) VALUES (
      v_flow_24h,
      0,
      'send_whatsapp_template',
      jsonb_build_object('template_id', v_template_24h, 'channel', 'whatsapp'),
      0
    );
  END IF;

  SELECT id INTO v_flow_5m
  FROM public.orbit_flows
  WHERE empresa_id = v_empresa_id
    AND nome = 'Viver - Lembrete seguro de reunião 5min'
    AND deleted_at IS NULL
  ORDER BY created_at
  LIMIT 1;

  IF v_flow_5m IS NULL THEN
    INSERT INTO public.orbit_flows (
      empresa_id, nome, descricao, trigger_type, trigger_config, condicoes, ativo
    ) VALUES (
      v_empresa_id,
      'Viver - Lembrete seguro de reunião 5min',
      'Lembrete transacional tenant-scoped; permanece inativo até homologação.',
      'meeting_reminder_5m',
      '{}'::jsonb,
      '[]'::jsonb,
      false
    ) RETURNING id INTO v_flow_5m;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.orbit_flow_actions
    WHERE flow_id = v_flow_5m AND ordem = 0
  ) THEN
    INSERT INTO public.orbit_flow_actions (
      flow_id, ordem, action_type, action_config, delay_seconds
    ) VALUES (
      v_flow_5m,
      0,
      'send_whatsapp_template',
      jsonb_build_object('template_id', v_template_5m, 'channel', 'whatsapp'),
      0
    );
  END IF;
END
$reminders$;
