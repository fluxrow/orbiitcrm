-- Ativação controlada das automações comprovadas da Viver.
-- Não cria campanhas, não reprocessa eventos e não ressuscita ações antigas.
-- O activation_not_before evita qualquer lembrete retroativo do dia da publicação.

DO $viver_safe_automation$
DECLARE
  v_empresa_id uuid;
  v_activation timestamptz := '2026-08-29 00:00:00 America/Sao_Paulo';
  v_low_capital_d1 integer;
  v_qualified_d1 integer;
BEGIN
  SELECT id INTO v_empresa_id
  FROM public.orbit_empresas
  WHERE slug = 'viver-semijoias';

  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'VIVER_TENANT_NOT_FOUND';
  END IF;

  UPDATE public.orbit_message_templates
  SET corpo_texto = E'Olá, {{nome}}. Passando para confirmar nossa conversa de amanhã às {{hora_reuniao}}.\n\nO acesso é este: {{link_reuniao}}\n\nSe precisar ajustar, me avise por aqui.',
      variaveis = ARRAY['nome', 'hora_reuniao', 'link_reuniao']::text[],
      updated_at = now()
  WHERE empresa_id = v_empresa_id
    AND nome = 'Viver - Lembrete seguro de reunião 24h';

  UPDATE public.orbit_message_templates
  SET corpo_texto = E'Olá, {{nome}}. Nossa conversa começa em 5 minutos, às {{hora_reuniao}}.\n\nEste é o link de acesso: {{link_reuniao}}\n\nQuando puder, pode entrar por aqui.',
      variaveis = ARRAY['nome', 'hora_reuniao', 'link_reuniao']::text[],
      updated_at = now()
  WHERE empresa_id = v_empresa_id
    AND nome = 'Viver - Lembrete seguro de reunião 5min';

  UPDATE public.orbit_flows
  SET ativo = true,
      trigger_config = coalesce(trigger_config, '{}'::jsonb) ||
        jsonb_build_object('activation_not_before', v_activation),
      descricao = 'Lembrete transacional tenant-scoped com revalidação autoritativa e ativação sem retroatividade.',
      updated_at = now()
  WHERE empresa_id = v_empresa_id
    AND nome IN (
      'Viver - Lembrete seguro de reunião 24h',
      'Viver - Lembrete seguro de reunião 5min'
    )
    AND deleted_at IS NULL;

  -- Piloto D+1 apenas. D+3/D+7/D+14 continuam desligados.
  UPDATE public.orbit_flow_actions a
  SET action_config = coalesce(a.action_config, '{}'::jsonb) || jsonb_build_object(
        'enabled', true,
        'cancel_on_reply', true,
        'viver_controlled_followup', true,
        'pilot_not_before', v_activation
      ),
      updated_at = now()
  FROM public.orbit_flows f
  WHERE a.flow_id = f.id
    AND f.empresa_id = v_empresa_id
    AND f.nome = 'VIVER - Baixo capital -> Aula Grupo'
    AND f.ativo = true
    AND f.deleted_at IS NULL
    AND a.action_type = 'send_whatsapp_template'
    AND a.delay_seconds BETWEEN 20 * 60 * 60 AND 28 * 60 * 60;
  GET DIAGNOSTICS v_low_capital_d1 = ROW_COUNT;

  UPDATE public.orbit_flow_actions a
  SET action_config = coalesce(a.action_config, '{}'::jsonb) || jsonb_build_object(
        'enabled', true,
        'cancel_on_reply', true,
        'viver_controlled_followup', true,
        'pilot_not_before', v_activation
      ),
      updated_at = now()
  FROM public.orbit_flows f
  WHERE a.flow_id = f.id
    AND f.empresa_id = v_empresa_id
    AND f.nome = 'VIVER - Qualificado -> Call Individual'
    AND f.ativo = true
    AND f.deleted_at IS NULL
    AND a.action_type = 'send_whatsapp_template'
    AND a.delay_seconds BETWEEN 20 * 60 * 60 AND 28 * 60 * 60;
  GET DIAGNOSTICS v_qualified_d1 = ROW_COUNT;

  IF (SELECT count(*) FROM public.orbit_flows
      WHERE empresa_id = v_empresa_id
        AND nome IN ('Viver - Lembrete seguro de reunião 24h', 'Viver - Lembrete seguro de reunião 5min')
        AND ativo = true AND deleted_at IS NULL) <> 2 THEN
    RAISE EXCEPTION 'VIVER_REMINDER_FLOWS_NOT_READY';
  END IF;

  IF v_low_capital_d1 <> 1 OR v_qualified_d1 <> 1 THEN
    RAISE EXCEPTION 'VIVER_D1_ACTION_CARDINALITY_MISMATCH low=% qualified=%',
      v_low_capital_d1, v_qualified_d1;
  END IF;
END
$viver_safe_automation$;
