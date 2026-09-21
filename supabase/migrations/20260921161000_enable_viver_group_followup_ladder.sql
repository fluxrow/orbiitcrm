-- Completa a cadência da esteira de baixo capital da Viver.
-- D+3 e D+7 passam a avançar a conversa sem repetir a pergunta do D0.
-- Para runs atuais, agenda apenas datas futuras ancoradas em entrega inicial
-- comprovada, sem resposta posterior, intervenção humana ou compensação tardia.
DO $viver_group_followup$
DECLARE
  v_empresa_id uuid := '36f26579-66ad-4ef1-9788-141e4c727232';
  v_flow_id uuid := '9f20eab5-abfe-4998-a8ac-a7afa616f1e6';
  v_d3_template_id uuid := '0c8d81db-5a58-4922-aa5e-37b968dac25d';
  v_d7_template_id uuid := '7f54ec9b-ea0e-483a-9231-af2c42a5975c';
  v_rows integer;
BEGIN
  UPDATE public.orbit_message_templates
  SET corpo_texto = E'{{nome}}, começar com pouco capital não precisa virar trava.\n\nNa aula de quarta, às 19h30, eu mostro como organizar os primeiros passos com semijoias e revendedoras. Quer que eu reserve seu acesso?',
      ativo = true,
      updated_at = now()
  WHERE id = v_d3_template_id AND empresa_id = v_empresa_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'VIVER_GROUP_D3_TEMPLATE_NOT_FOUND'; END IF;

  UPDATE public.orbit_message_templates
  SET corpo_texto = E'{{nome}}, se a aula em grupo não fizer sentido agora, tenho um material de entrada para você organizar as primeiras vendas no seu ritmo. Quer que eu envie?',
      ativo = true,
      updated_at = now()
  WHERE id = v_d7_template_id AND empresa_id = v_empresa_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN RAISE EXCEPTION 'VIVER_GROUP_D7_TEMPLATE_NOT_FOUND'; END IF;

  UPDATE public.orbit_flow_actions
  SET action_config = action_config || jsonb_build_object(
        'enabled', true,
        'dry_run', false,
        'cancel_on_reply', true,
        'category', 'nutricao',
        'viver_controlled_followup', true,
        'pilot_not_before', '2026-09-21T03:00:00Z'
      )
  WHERE flow_id = v_flow_id AND ordem IN (3, 4)
    AND action_type = 'send_whatsapp_template';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 2 THEN RAISE EXCEPTION 'VIVER_GROUP_D3_D7_ACTIONS_NOT_FOUND'; END IF;

  WITH eligible AS (
    SELECT DISTINCT ON (d1.run_id)
      d1.run_id,
      d1.flow_id,
      d1.empresa_id,
      d1.prospect_id,
      d1.deal_id,
      d1.context,
      io.sent_at AS anchor_sent_at,
      c.id AS conversa_id
    FROM public.orbit_flow_scheduled_actions d1
    JOIN LATERAL (
      SELECT o.sent_at
      FROM public.orbit_whatsapp_outbox o
      WHERE o.empresa_id = d1.empresa_id
        AND o.flow_run_id = d1.run_id
        AND o.prospect_id = d1.prospect_id
        AND o.source_type = 'flow_initial'
        AND lower(o.status) IN ('sent', 'delivered', 'read')
        AND o.sent_at IS NOT NULL
        AND nullif(o.provider_message_id, '') IS NOT NULL
      ORDER BY o.sent_at
      LIMIT 1
    ) io ON true
    JOIN public.orbit_conversas c
      ON c.empresa_id = d1.empresa_id AND c.prospect_id = d1.prospect_id
    JOIN public.orbit_prospects p
      ON p.empresa_id = d1.empresa_id AND p.id = d1.prospect_id
    WHERE d1.empresa_id = v_empresa_id
      AND d1.flow_id = v_flow_id
      AND d1.ordem = 2
      AND d1.status = 'pending'
      AND coalesce(c.human_talk, false) = false
      AND c.handoff_sent_at IS NULL
      AND p.deleted_at IS NULL
      AND coalesce(p.optout_whatsapp, false) = false
      AND NOT EXISTS (
        SELECT 1 FROM public.orbit_mensagens m
        WHERE m.empresa_id = d1.empresa_id
          AND m.conversa_id = c.id
          AND m.timestamp > io.sent_at
          AND (
            upper(m.direcao) = 'IN'
            OR (upper(m.direcao) = 'OUT' AND (
              m.sent_by_user_id IS NOT NULL
              OR lower(coalesce(m.sender_type, '')) IN ('human', 'user', 'agent_human')
            ))
          )
      )
    ORDER BY d1.run_id, d1.created_at
  ), inserted AS (
    INSERT INTO public.orbit_flow_scheduled_actions (
      empresa_id, run_id, flow_id, action_id, ordem, action_type,
      action_config, context, prospect_id, deal_id, scheduled_for,
      status, attempts, cadence_key
    )
    SELECT
      e.empresa_id, e.run_id, e.flow_id, a.id, a.ordem, a.action_type,
      a.action_config,
      e.context || jsonb_build_object(
        'delivery_anchor_sent_at', e.anchor_sent_at,
        'delivery_anchor_source', 'flow_initial_provider_accepted'
      ),
      e.prospect_id, e.deal_id,
      e.anchor_sent_at + make_interval(secs => a.delay_seconds),
      'pending', 0,
      'cad:swt:' || e.empresa_id::text || ':' || e.prospect_id::text || ':' || e.flow_id::text || ':' || a.id::text
    FROM eligible e
    CROSS JOIN public.orbit_flow_actions a
    WHERE a.flow_id = v_flow_id
      AND a.ordem IN (3, 4)
      AND a.action_type = 'send_whatsapp_template'
      AND a.action_config->>'enabled' = 'true'
      AND e.anchor_sent_at + make_interval(secs => a.delay_seconds) > now()
      AND NOT EXISTS (
        SELECT 1 FROM public.orbit_flow_scheduled_actions existing
        WHERE existing.run_id = e.run_id AND existing.action_id = a.id
      )
    ON CONFLICT (cadence_key) WHERE cadence_key IS NOT NULL AND status IN ('pending', 'running')
    DO NOTHING
    RETURNING id
  )
  INSERT INTO public.orbit_audit_log (empresa_id, acao, entidade, detalhes)
  SELECT v_empresa_id, 'viver_group_followup_ladder_enabled', 'orbit_flow_actions',
         jsonb_build_object(
           'flow_id', v_flow_id,
           'enabled_orders', jsonb_build_array(3, 4),
           'existing_future_actions_added', count(*),
           'no_compensatory_backlog', true
         )
  FROM inserted;
END
$viver_group_followup$;
