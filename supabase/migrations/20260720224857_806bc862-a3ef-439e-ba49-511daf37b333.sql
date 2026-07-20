CREATE OR REPLACE FUNCTION public.orbit_flow_go_live_apply_v3(
  p_operation_id text,
  p_empresa_id uuid,
  p_performed_by uuid,
  p_actions jsonb,
  p_snapshots jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_existing public.orbit_flow_go_live_operations%ROWTYPE;
  v_changes jsonb := '[]'::jsonb;
  v_action jsonb;
  v_snap jsonb;
  v_action_id uuid;
  v_scheduled_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_snap_cfg jsonb;
  v_snap_sched timestamptz;
  v_snap_status text;
  v_snap_empresa uuid;
  v_snap_action_id uuid;
  v_snap_action_type text;
  v_snap_prospect_id uuid;
  v_act_cfg jsonb;
  v_act_type text;
  v_flow_empresa uuid;
  v_flow_ativo boolean;
  v_flow_deleted timestamptz;
  v_prospect_row public.orbit_prospects%ROWTYPE;
  v_last_real_out timestamptz;
  v_new_time timestamptz;
  v_row_cfg jsonb;
  v_row_empresa uuid;
  v_defs_enabled int := 0;
  v_snaps_rebased int := 0;
  v_summary jsonb;
BEGIN
  IF p_operation_id IS NULL OR length(p_operation_id) < 8 THEN
    RAISE EXCEPTION 'invalid_operation_id';
  END IF;
  IF p_empresa_id IS NULL THEN
    RAISE EXCEPTION 'invalid_empresa_id';
  END IF;

  SELECT * INTO v_existing FROM public.orbit_flow_go_live_operations
    WHERE operation_id = p_operation_id;
  IF FOUND THEN
    IF v_existing.empresa_id <> p_empresa_id THEN
      RAISE EXCEPTION 'operation_id_cross_tenant';
    END IF;
    RETURN jsonb_build_object(
      'operation_id', p_operation_id,
      'already_applied', true,
      'summary', v_existing.summary,
      'changes_count', jsonb_array_length(v_existing.changes)
    );
  END IF;

  -- 1) Promote actions (rolled back atomically if any snapshot guard later fails)
  FOR v_action IN SELECT * FROM jsonb_array_elements(COALESCE(p_actions, '[]'::jsonb)) LOOP
    v_action_id := (v_action->>'action_id')::uuid;

    SELECT fa.action_config, f.empresa_id, f.ativo, f.deleted_at
      INTO v_row_cfg, v_row_empresa, v_flow_ativo, v_flow_deleted
    FROM public.orbit_flow_actions fa
    JOIN public.orbit_flows f ON f.id = fa.flow_id
    WHERE fa.id = v_action_id
    FOR UPDATE OF fa;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'action_not_found:%', v_action_id;
    END IF;
    IF v_row_empresa <> p_empresa_id THEN
      RAISE EXCEPTION 'action_cross_tenant:%', v_action_id;
    END IF;
    IF COALESCE(v_flow_ativo, false) <> true OR v_flow_deleted IS NOT NULL THEN
      RAISE EXCEPTION 'action_flow_inactive:%', v_action_id;
    END IF;
    IF COALESCE((v_row_cfg->>'enabled')::boolean, true) = false THEN
      RAISE EXCEPTION 'action_disabled:%', v_action_id;
    END IF;
    IF COALESCE((v_row_cfg->>'dry_run')::boolean, false) <> true THEN
      RAISE EXCEPTION 'action_not_dry_run:%', v_action_id;
    END IF;

    v_before := v_row_cfg;
    v_after := v_row_cfg || jsonb_build_object('dry_run', false);

    UPDATE public.orbit_flow_actions
      SET action_config = v_after, updated_at = now()
    WHERE id = v_action_id;

    v_changes := v_changes || jsonb_build_object(
      'kind', 'action_dry_run_false',
      'action_id', v_action_id,
      'before', v_before,
      'after', v_after
    );
    v_defs_enabled := v_defs_enabled + 1;
  END LOOP;

  -- 2) Rebase snapshots with FULL atomic guard revalidation
  FOR v_snap IN SELECT * FROM jsonb_array_elements(COALESCE(p_snapshots, '[]'::jsonb)) LOOP
    v_scheduled_id := (v_snap->>'scheduled_id')::uuid;
    v_new_time := (v_snap->>'proposed_scheduled_for')::timestamptz;

    -- (10) future scheduled_for
    IF v_new_time IS NULL THEN
      RAISE EXCEPTION 'guard_revalidation_failed:missing_proposed_time:%', v_scheduled_id;
    END IF;
    IF v_new_time <= now() THEN
      RAISE EXCEPTION 'guard_revalidation_failed:proposed_in_past:%', v_scheduled_id;
    END IF;

    -- (1) snapshot ownership / state / type / enabled / dry_run
    SELECT action_config, scheduled_for, status, empresa_id, action_id, action_type, prospect_id
      INTO v_snap_cfg, v_snap_sched, v_snap_status, v_snap_empresa,
           v_snap_action_id, v_snap_action_type, v_snap_prospect_id
    FROM public.orbit_flow_scheduled_actions
    WHERE id = v_scheduled_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'guard_revalidation_failed:snapshot_not_found:%', v_scheduled_id;
    END IF;
    IF v_snap_empresa <> p_empresa_id THEN
      RAISE EXCEPTION 'guard_revalidation_failed:snapshot_cross_tenant:%', v_scheduled_id;
    END IF;
    IF v_snap_status <> 'pending' THEN
      RAISE EXCEPTION 'guard_revalidation_failed:snapshot_not_pending:%', v_scheduled_id;
    END IF;
    IF v_snap_action_type <> 'send_whatsapp_template' THEN
      RAISE EXCEPTION 'guard_revalidation_failed:snapshot_wrong_action_type:%', v_scheduled_id;
    END IF;
    IF COALESCE((v_snap_cfg->>'enabled')::boolean, true) = false THEN
      RAISE EXCEPTION 'guard_revalidation_failed:snapshot_disabled:%', v_scheduled_id;
    END IF;
    IF COALESCE((v_snap_cfg->>'dry_run')::boolean, false) <> true THEN
      RAISE EXCEPTION 'guard_revalidation_failed:snapshot_not_dry_run:%', v_scheduled_id;
    END IF;

    -- (2) action ↔ snapshot integrity + flow ativo + category + cancel_on_reply
    IF v_snap_action_id IS NULL THEN
      RAISE EXCEPTION 'guard_revalidation_failed:snapshot_missing_action_id:%', v_scheduled_id;
    END IF;

    SELECT fa.action_config, fa.action_type,
           f.empresa_id, f.ativo, f.deleted_at
      INTO v_act_cfg, v_act_type, v_flow_empresa, v_flow_ativo, v_flow_deleted
    FROM public.orbit_flow_actions fa
    JOIN public.orbit_flows f ON f.id = fa.flow_id
    WHERE fa.id = v_snap_action_id
    FOR UPDATE OF fa;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'guard_revalidation_failed:action_missing:%', v_scheduled_id;
    END IF;
    IF v_flow_empresa <> p_empresa_id THEN
      RAISE EXCEPTION 'guard_revalidation_failed:action_cross_tenant:%', v_scheduled_id;
    END IF;
    IF COALESCE(v_flow_ativo, false) <> true OR v_flow_deleted IS NOT NULL THEN
      RAISE EXCEPTION 'guard_revalidation_failed:flow_inactive_or_deleted:%', v_scheduled_id;
    END IF;
    IF v_act_type <> 'send_whatsapp_template' THEN
      RAISE EXCEPTION 'guard_revalidation_failed:action_wrong_type:%', v_scheduled_id;
    END IF;
    IF COALESCE((v_act_cfg->>'enabled')::boolean, true) = false THEN
      RAISE EXCEPTION 'guard_revalidation_failed:action_disabled:%', v_scheduled_id;
    END IF;
    IF LOWER(COALESCE(v_act_cfg->>'category','')) NOT IN ('follow_up','followup','nutricao','nurture') THEN
      RAISE EXCEPTION 'guard_revalidation_failed:action_category_invalid:%', v_scheduled_id;
    END IF;
    IF COALESCE((v_act_cfg->>'cancel_on_reply')::boolean, false) <> true THEN
      RAISE EXCEPTION 'guard_revalidation_failed:action_missing_cancel_on_reply:%', v_scheduled_id;
    END IF;

    -- (3) prospect
    IF v_snap_prospect_id IS NULL THEN
      RAISE EXCEPTION 'guard_revalidation_failed:no_prospect:%', v_scheduled_id;
    END IF;
    SELECT * INTO v_prospect_row FROM public.orbit_prospects
      WHERE id = v_snap_prospect_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'guard_revalidation_failed:prospect_missing:%', v_scheduled_id;
    END IF;
    IF v_prospect_row.empresa_id <> p_empresa_id THEN
      RAISE EXCEPTION 'guard_revalidation_failed:prospect_cross_tenant:%', v_scheduled_id;
    END IF;
    IF v_prospect_row.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'guard_revalidation_failed:prospect_deleted:%', v_scheduled_id;
    END IF;
    IF COALESCE(v_prospect_row.optout_whatsapp, false) = true THEN
      RAISE EXCEPTION 'guard_revalidation_failed:optout_whatsapp:%', v_scheduled_id;
    END IF;

    -- (4) handoff/human_talk in conversas
    IF EXISTS (
      SELECT 1 FROM public.orbit_conversas c
      WHERE c.empresa_id = p_empresa_id
        AND c.prospect_id = v_snap_prospect_id
        AND (c.human_talk = true OR c.handoff_sent_at IS NOT NULL)
    ) THEN
      RAISE EXCEPTION 'guard_revalidation_failed:handoff_or_human_talk:%', v_scheduled_id;
    END IF;

    -- (5) orbit_handoffs
    IF EXISTS (
      SELECT 1 FROM public.orbit_handoffs h
      WHERE h.empresa_id = p_empresa_id AND h.prospect_id = v_snap_prospect_id
    ) THEN
      RAISE EXCEPTION 'guard_revalidation_failed:handoff_registered:%', v_scheduled_id;
    END IF;

    -- (6) future meeting
    IF EXISTS (
      SELECT 1 FROM public.orbit_meetings m
      WHERE m.empresa_id = p_empresa_id
        AND m.prospect_id = v_snap_prospect_id
        AND m.scheduled_at > now()
        AND m.status IN ('scheduled','confirmed','pending')
    ) THEN
      RAISE EXCEPTION 'guard_revalidation_failed:future_meeting:%', v_scheduled_id;
    END IF;

    -- (7) terminal deal (is_won OR is_lost)
    IF EXISTS (
      SELECT 1 FROM public.orbit_deals d
      JOIN public.orbit_pipeline_stages s ON s.id = d.etapa_id
      WHERE d.empresa_id = p_empresa_id
        AND d.prospect_id = v_snap_prospect_id
        AND (s.is_won = true OR s.is_lost = true)
    ) THEN
      RAISE EXCEPTION 'guard_revalidation_failed:deal_terminal_stage:%', v_scheduled_id;
    END IF;

    -- (8) at least one real OUT (NULL status treated as unsafe)
    SELECT MAX(m."timestamp") INTO v_last_real_out
    FROM public.orbit_mensagens m
    JOIN public.orbit_conversas c ON c.id = m.conversa_id
    WHERE c.empresa_id = p_empresa_id
      AND c.prospect_id = v_snap_prospect_id
      AND m.direcao = 'OUT'
      AND m.status IS NOT NULL
      AND LOWER(m.status) NOT IN ('simulated','falhou','failed');

    IF v_last_real_out IS NULL THEN
      RAISE EXCEPTION 'guard_revalidation_failed:missing_prior_real_outbound:%', v_scheduled_id;
    END IF;

    -- (9) no IN after last real OUT
    IF EXISTS (
      SELECT 1 FROM public.orbit_mensagens m
      JOIN public.orbit_conversas c ON c.id = m.conversa_id
      WHERE c.empresa_id = p_empresa_id
        AND c.prospect_id = v_snap_prospect_id
        AND m.direcao = 'IN'
        AND m."timestamp" > v_last_real_out
    ) THEN
      RAISE EXCEPTION 'guard_revalidation_failed:in_after_last_real_out:%', v_scheduled_id;
    END IF;

    -- All guards passed → apply UPDATE
    v_before := jsonb_build_object('action_config', v_snap_cfg, 'scheduled_for', v_snap_sched);
    v_after := jsonb_build_object(
      'action_config', v_snap_cfg || jsonb_build_object('dry_run', false),
      'scheduled_for', v_new_time
    );

    UPDATE public.orbit_flow_scheduled_actions
      SET action_config = v_snap_cfg || jsonb_build_object('dry_run', false),
          scheduled_for = v_new_time,
          updated_at = now()
    WHERE id = v_scheduled_id;

    v_changes := v_changes || jsonb_build_object(
      'kind', 'snapshot_rebase',
      'scheduled_id', v_scheduled_id,
      'before', v_before,
      'after', v_after
    );
    v_snaps_rebased := v_snaps_rebased + 1;
  END LOOP;

  v_summary := jsonb_build_object(
    'definitions_enabled', v_defs_enabled,
    'snapshots_rebased', v_snaps_rebased,
    'kill_switches_touched', false,
    'envio_real_liberado_touched', false,
    'outbox_adapter_enabled_touched', false,
    'guard_revalidation', 'atomic_v3'
  );

  INSERT INTO public.orbit_flow_go_live_operations(
    operation_id, empresa_id, performed_by, mode, status, summary, changes
  ) VALUES (
    p_operation_id, p_empresa_id, p_performed_by, 'apply', 'applied', v_summary, v_changes
  );

  RETURN jsonb_build_object(
    'operation_id', p_operation_id,
    'already_applied', false,
    'summary', v_summary,
    'changes_count', jsonb_array_length(v_changes)
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.orbit_flow_go_live_apply_v3(text, uuid, uuid, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.orbit_flow_go_live_apply_v3(text, uuid, uuid, jsonb, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.orbit_flow_go_live_apply_v3(text, uuid, uuid, jsonb, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.orbit_flow_go_live_apply_v3(text, uuid, uuid, jsonb, jsonb) TO service_role;