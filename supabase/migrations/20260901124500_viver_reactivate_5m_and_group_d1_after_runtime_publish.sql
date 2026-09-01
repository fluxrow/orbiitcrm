-- Reativa somente os fluxos futuros comprovados da Viver após a publicação
-- do runtime corrigido. Não cria eventos, não reprocessa runs e não faz backfill.

DO $viver_reactivate$
DECLARE
  v_empresa_id constant uuid := '36f26579-66ad-4ef1-9788-141e4c727232';
  v_batch constant text := 'viver-reactivate-5m-group-d1-20260901';
  v_reminder_count integer;
  v_followup_count integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.orbit_empresas
    WHERE id = v_empresa_id AND slug = 'viver-semijoias' AND ativo = true
  ) THEN
    RAISE EXCEPTION 'VIVER_TENANT_NOT_READY';
  END IF;

  INSERT INTO public.orbit_quarantine_backups
    (empresa_id, batch_label, entity_type, entity_id, snapshot)
  SELECT f.empresa_id, v_batch, 'orbit_flows', f.id, to_jsonb(f)
  FROM public.orbit_flows f
  WHERE f.empresa_id = v_empresa_id
    AND f.nome = 'Viver - Lembrete seguro de reunião 5min'
    AND f.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.orbit_quarantine_backups b
      WHERE b.empresa_id = v_empresa_id
        AND b.batch_label = v_batch
        AND b.entity_type = 'orbit_flows'
        AND b.entity_id = f.id
    );

  INSERT INTO public.orbit_quarantine_backups
    (empresa_id, batch_label, entity_type, entity_id, snapshot)
  SELECT f.empresa_id, v_batch, 'orbit_flow_actions', a.id, to_jsonb(a)
  FROM public.orbit_flow_actions a
  JOIN public.orbit_flows f ON f.id = a.flow_id
  WHERE f.empresa_id = v_empresa_id
    AND f.nome = 'VIVER - Baixo capital -> Aula Grupo'
    AND f.deleted_at IS NULL
    AND a.action_type = 'send_whatsapp_template'
    AND a.delay_seconds BETWEEN 20 * 60 * 60 AND 28 * 60 * 60
    AND NOT EXISTS (
      SELECT 1 FROM public.orbit_quarantine_backups b
      WHERE b.empresa_id = v_empresa_id
        AND b.batch_label = v_batch
        AND b.entity_type = 'orbit_flow_actions'
        AND b.entity_id = a.id
    );

  UPDATE public.orbit_flows
  SET ativo = true,
      trigger_config = coalesce(trigger_config, '{}'::jsonb) ||
        jsonb_build_object('activation_not_before', now()),
      updated_at = now()
  WHERE empresa_id = v_empresa_id
    AND nome = 'Viver - Lembrete seguro de reunião 5min'
    AND deleted_at IS NULL;
  GET DIAGNOSTICS v_reminder_count = ROW_COUNT;

  UPDATE public.orbit_flow_actions a
  SET action_config = coalesce(a.action_config, '{}'::jsonb) || jsonb_build_object(
        'enabled', true,
        'cancel_on_reply', true,
        'viver_controlled_followup', true,
        'pilot_not_before', now()
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
  GET DIAGNOSTICS v_followup_count = ROW_COUNT;

  IF v_reminder_count <> 1 OR v_followup_count <> 1 THEN
    RAISE EXCEPTION 'VIVER_REACTIVATION_CARDINALITY_MISMATCH reminder=% followup=%',
      v_reminder_count, v_followup_count;
  END IF;

  INSERT INTO public.orbit_audit_log
    (empresa_id, acao, entidade, detalhes)
  VALUES (
    v_empresa_id,
    'viver_safe_automation_reactivated',
    'orbit_flows',
    jsonb_build_object(
      'reminder_5m', true,
      'group_followup_d1', true,
      'backfill', false,
      'manual_send', false,
      'runtime_source_sha', 'bd0e15c0bcc10c20d6a19a6d6cc5226ccb7d7af6',
      'publish_deployment_id', '2f4d174e-e189-43a1-8323-292bd07c0d95',
      'snapshot_batch', v_batch
    )
  );
END
$viver_reactivate$;
