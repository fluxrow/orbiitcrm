
-- ============================================================
-- Reconciler v2: transactional apply + drift-aware rollback
-- ============================================================

-- APPLY -----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.orbit_flow_go_live_apply_v2(
  p_operation_id text,
  p_empresa_id uuid,
  p_performed_by uuid,
  p_actions jsonb,     -- [{action_id: uuid}]
  p_snapshots jsonb    -- [{scheduled_id: uuid, proposed_scheduled_for: timestamptz}]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.orbit_flow_go_live_operations%ROWTYPE;
  v_changes jsonb := '[]'::jsonb;
  v_action jsonb;
  v_snap jsonb;
  v_action_id uuid;
  v_scheduled_id uuid;
  v_before jsonb;
  v_after jsonb;
  v_row_cfg jsonb;
  v_row_sched timestamptz;
  v_row_status text;
  v_row_empresa uuid;
  v_new_time timestamptz;
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

  -- Idempotência escopada por empresa
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

  -- 1) Promover actions dry_run=false
  FOR v_action IN SELECT * FROM jsonb_array_elements(COALESCE(p_actions, '[]'::jsonb)) LOOP
    v_action_id := (v_action->>'action_id')::uuid;

    -- Confirma ownership e estado; trava linha
    SELECT fa.action_config, f.empresa_id
      INTO v_row_cfg, v_row_empresa
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

  -- 2) Rebase snapshots
  FOR v_snap IN SELECT * FROM jsonb_array_elements(COALESCE(p_snapshots, '[]'::jsonb)) LOOP
    v_scheduled_id := (v_snap->>'scheduled_id')::uuid;
    v_new_time := (v_snap->>'proposed_scheduled_for')::timestamptz;

    IF v_new_time IS NULL THEN
      RAISE EXCEPTION 'missing_proposed_time:%', v_scheduled_id;
    END IF;
    IF v_new_time < now() THEN
      RAISE EXCEPTION 'proposed_in_past:%', v_scheduled_id;
    END IF;

    SELECT action_config, scheduled_for, status, empresa_id
      INTO v_row_cfg, v_row_sched, v_row_status, v_row_empresa
    FROM public.orbit_flow_scheduled_actions
    WHERE id = v_scheduled_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'snapshot_not_found:%', v_scheduled_id;
    END IF;
    IF v_row_empresa <> p_empresa_id THEN
      RAISE EXCEPTION 'snapshot_cross_tenant:%', v_scheduled_id;
    END IF;
    IF v_row_status <> 'pending' THEN
      RAISE EXCEPTION 'snapshot_not_pending:%', v_scheduled_id;
    END IF;
    IF COALESCE((v_row_cfg->>'enabled')::boolean, true) = false THEN
      RAISE EXCEPTION 'snapshot_disabled:%', v_scheduled_id;
    END IF;
    IF COALESCE((v_row_cfg->>'dry_run')::boolean, false) <> true THEN
      RAISE EXCEPTION 'snapshot_not_dry_run:%', v_scheduled_id;
    END IF;

    v_before := jsonb_build_object('action_config', v_row_cfg, 'scheduled_for', v_row_sched);
    v_after := jsonb_build_object(
      'action_config', v_row_cfg || jsonb_build_object('dry_run', false),
      'scheduled_for', v_new_time
    );

    UPDATE public.orbit_flow_scheduled_actions
      SET action_config = v_row_cfg || jsonb_build_object('dry_run', false),
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
    'outbox_adapter_enabled_touched', false
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
$$;

REVOKE ALL ON FUNCTION public.orbit_flow_go_live_apply_v2(text, uuid, uuid, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.orbit_flow_go_live_apply_v2(text, uuid, uuid, jsonb, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.orbit_flow_go_live_apply_v2(text, uuid, uuid, jsonb, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.orbit_flow_go_live_apply_v2(text, uuid, uuid, jsonb, jsonb) TO service_role;

-- ROLLBACK ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.orbit_flow_go_live_rollback_v2(
  p_operation_id text,
  p_rolled_back_by uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_op public.orbit_flow_go_live_operations%ROWTYPE;
  v_ch jsonb;
  v_kind text;
  v_action_id uuid;
  v_scheduled_id uuid;
  v_expected_after jsonb;
  v_before jsonb;
  v_cur_cfg jsonb;
  v_cur_sched timestamptz;
  v_row_empresa uuid;
  v_restored int := 0;
BEGIN
  SELECT * INTO v_op FROM public.orbit_flow_go_live_operations
    WHERE operation_id = p_operation_id
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'operation_not_found';
  END IF;
  IF v_op.status = 'rolled_back' THEN
    RETURN jsonb_build_object('operation_id', p_operation_id, 'already_rolled_back', true);
  END IF;
  IF v_op.status <> 'applied' THEN
    RAISE EXCEPTION 'invalid_status:%', v_op.status;
  END IF;

  -- Drift detection pass — abort if anything changed since apply
  FOR v_ch IN SELECT * FROM jsonb_array_elements(v_op.changes) LOOP
    v_kind := v_ch->>'kind';
    v_expected_after := v_ch->'after';

    IF v_kind = 'action_dry_run_false' THEN
      v_action_id := (v_ch->>'action_id')::uuid;
      SELECT fa.action_config, f.empresa_id INTO v_cur_cfg, v_row_empresa
        FROM public.orbit_flow_actions fa
        JOIN public.orbit_flows f ON f.id = fa.flow_id
        WHERE fa.id = v_action_id
        FOR UPDATE OF fa;
      IF NOT FOUND OR v_row_empresa <> v_op.empresa_id THEN
        RAISE EXCEPTION 'rollback_conflict:action_missing_or_cross_tenant:%', v_action_id;
      END IF;
      IF v_cur_cfg <> v_expected_after THEN
        RAISE EXCEPTION 'rollback_conflict:action_drift:%', v_action_id;
      END IF;
    ELSIF v_kind = 'snapshot_rebase' THEN
      v_scheduled_id := (v_ch->>'scheduled_id')::uuid;
      SELECT action_config, scheduled_for, empresa_id
        INTO v_cur_cfg, v_cur_sched, v_row_empresa
        FROM public.orbit_flow_scheduled_actions
        WHERE id = v_scheduled_id
        FOR UPDATE;
      IF NOT FOUND OR v_row_empresa <> v_op.empresa_id THEN
        RAISE EXCEPTION 'rollback_conflict:snapshot_missing_or_cross_tenant:%', v_scheduled_id;
      END IF;
      IF v_cur_cfg <> (v_expected_after->'action_config')
         OR v_cur_sched <> ((v_expected_after->>'scheduled_for')::timestamptz) THEN
        RAISE EXCEPTION 'rollback_conflict:snapshot_drift:%', v_scheduled_id;
      END IF;
    ELSE
      RAISE EXCEPTION 'rollback_unknown_kind:%', v_kind;
    END IF;
  END LOOP;

  -- Restore pass
  FOR v_ch IN SELECT * FROM jsonb_array_elements(v_op.changes) LOOP
    v_kind := v_ch->>'kind';
    v_before := v_ch->'before';

    IF v_kind = 'action_dry_run_false' THEN
      v_action_id := (v_ch->>'action_id')::uuid;
      UPDATE public.orbit_flow_actions
        SET action_config = v_before, updated_at = now()
      WHERE id = v_action_id;
      v_restored := v_restored + 1;
    ELSIF v_kind = 'snapshot_rebase' THEN
      v_scheduled_id := (v_ch->>'scheduled_id')::uuid;
      UPDATE public.orbit_flow_scheduled_actions
        SET action_config = v_before->'action_config',
            scheduled_for = (v_before->>'scheduled_for')::timestamptz,
            updated_at = now()
      WHERE id = v_scheduled_id AND empresa_id = v_op.empresa_id;
      v_restored := v_restored + 1;
    END IF;
  END LOOP;

  UPDATE public.orbit_flow_go_live_operations
    SET status = 'rolled_back',
        rolled_back_at = now(),
        rolled_back_by = p_rolled_back_by,
        updated_at = now()
  WHERE operation_id = p_operation_id;

  RETURN jsonb_build_object(
    'operation_id', p_operation_id,
    'restored', v_restored,
    'total', jsonb_array_length(v_op.changes)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.orbit_flow_go_live_rollback_v2(text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.orbit_flow_go_live_rollback_v2(text, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.orbit_flow_go_live_rollback_v2(text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.orbit_flow_go_live_rollback_v2(text, uuid) TO service_role;
