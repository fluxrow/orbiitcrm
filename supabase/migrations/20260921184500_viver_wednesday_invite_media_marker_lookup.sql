-- Follow-up to the first reconciliation: resolve the production template by
-- tenant-scoped name instead of assuming its generated UUID.  No message,
-- outbox item, retry, or backfill is created here.
DO $viver_wednesday_media_marker_lookup$
DECLARE
  v_empresa_id uuid := '36f26579-66ad-4ef1-9788-141e4c727232';
  v_flow_id uuid := '9f20eab5-abfe-4998-a8ac-a7afa616f1e6';
  v_template_id uuid;
  v_template_count integer;
  v_action_rows integer := 0;
  v_snapshot_rows integer := 0;
BEGIN
  SELECT count(*)
    INTO v_template_count
  FROM public.orbit_message_templates
  WHERE empresa_id = v_empresa_id
    AND nome = 'Viver - Convite aula em grupo quarta 19h30 (texto)'
    AND ativo = true;

  IF v_template_count <> 1 THEN
    RAISE EXCEPTION 'VIVER_WEDNESDAY_INVITE_TEMPLATE_AMBIGUOUS_OR_MISSING';
  END IF;

  SELECT id
    INTO v_template_id
  FROM public.orbit_message_templates
  WHERE empresa_id = v_empresa_id
    AND nome = 'Viver - Convite aula em grupo quarta 19h30 (texto)'
    AND ativo = true;

  UPDATE public.orbit_flow_actions
  SET action_config = action_config - 'viver_group_invite_audio',
      updated_at = now()
  WHERE flow_id = v_flow_id
    AND ordem = 2
    AND action_type = 'send_whatsapp_template'
    AND action_config->>'template_id' = v_template_id::text
    AND action_config ? 'viver_group_invite_audio';

  GET DIAGNOSTICS v_action_rows = ROW_COUNT;

  UPDATE public.orbit_flow_scheduled_actions
  SET action_config = action_config - 'viver_group_invite_audio',
      updated_at = now()
  WHERE empresa_id = v_empresa_id
    AND flow_id = v_flow_id
    AND ordem = 2
    AND status = 'pending'
    AND action_config->>'template_id' = v_template_id::text
    AND action_config ? 'viver_group_invite_audio';

  GET DIAGNOSTICS v_snapshot_rows = ROW_COUNT;

  INSERT INTO public.orbit_audit_log (empresa_id, acao, entidade, detalhes)
  VALUES (
    v_empresa_id,
    'viver_wednesday_invite_media_marker_reconciled_by_lookup',
    'orbit_flow_actions',
    jsonb_build_object(
      'flow_id', v_flow_id,
      'template_id', v_template_id,
      'action_rows_updated', v_action_rows,
      'pending_snapshot_rows_updated', v_snapshot_rows,
      'message_content_changed', false,
      'outbox_created', false,
      'retry_or_backfill', false,
      'reason', 'Tuesday audio remains disabled; Wednesday invitation is text-only until a matching recording exists'
    )
  );
END
$viver_wednesday_media_marker_lookup$;
