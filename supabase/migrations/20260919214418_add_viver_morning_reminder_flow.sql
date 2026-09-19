-- Viver-only morning reminder for an individual meeting later the same day.
-- Created inactive; activation follows Edge Function rollout and canary checks.
DO $morning_reminder$
DECLARE
  v_empresa_id uuid := '36f26579-66ad-4ef1-9788-141e4c727232';
  v_template_id uuid;
  v_flow_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.orbit_empresas WHERE id = v_empresa_id) THEN
    RAISE EXCEPTION 'VIVER_TENANT_NOT_FOUND';
  END IF;

  SELECT id INTO v_template_id
  FROM public.orbit_message_templates
  WHERE empresa_id = v_empresa_id
    AND nome = 'Viver - Lembrete de manhã para reunião à tarde'
  ORDER BY created_at
  LIMIT 1;

  IF v_template_id IS NULL THEN
    INSERT INTO public.orbit_message_templates (
      empresa_id, canal, nome, categoria, corpo_texto, variaveis, ativo
    ) VALUES (
      v_empresa_id,
      'whatsapp',
      'Viver - Lembrete de manhã para reunião à tarde',
      'reuniao',
      E'Bom dia, {{nome}}. Nossa conversa é hoje às {{hora_reuniao}}.\n\nO acesso é este: {{link_reuniao}}\n\nSe precisar ajustar o horário, me avise por aqui.',
      ARRAY['nome', 'hora_reuniao', 'link_reuniao']::text[],
      true
    ) RETURNING id INTO v_template_id;
  END IF;

  SELECT id INTO v_flow_id
  FROM public.orbit_flows
  WHERE empresa_id = v_empresa_id
    AND nome = 'Viver - Lembrete de manhã para reunião à tarde'
    AND deleted_at IS NULL
  ORDER BY created_at
  LIMIT 1;

  IF v_flow_id IS NULL THEN
    INSERT INTO public.orbit_flows (
      empresa_id, nome, descricao, trigger_type, trigger_config, condicoes, ativo
    ) VALUES (
      v_empresa_id,
      'Viver - Lembrete de manhã para reunião à tarde',
      'Apenas reunião individual no mesmo dia, 13h–17h; emissão 9h–9h10, entrega até 9h30, sem compensação tardia.',
      'meeting_reminder_morning',
      '{}'::jsonb,
      '{"exclude_meeting_kind":"viver_group_class"}'::jsonb,
      false
    ) RETURNING id INTO v_flow_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.orbit_flow_actions
    WHERE flow_id = v_flow_id AND ordem = 0
  ) THEN
    INSERT INTO public.orbit_flow_actions (
      flow_id, ordem, action_type, action_config, delay_seconds
    ) VALUES (
      v_flow_id,
      0,
      'send_whatsapp_template',
      jsonb_build_object(
        'template_id', v_template_id,
        'channel', 'whatsapp',
        'exclude_meeting_kind', 'viver_group_class'
      ),
      0
    );
  END IF;
END
$morning_reminder$;
