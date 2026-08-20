CREATE OR REPLACE VIEW public.orbit_tenant_ops_ai_handoff_v
WITH (security_invoker = true)
AS
SELECT
  c.empresa_id,
  count(*) FILTER (WHERE coalesce(c.human_talk, false) = false) AS ai_active,
  count(*) FILTER (WHERE c.human_talk = true AND c.human_user_id IS NOT NULL) AS human_owned,
  count(*) FILTER (WHERE c.handoff_sent_at IS NOT NULL AND c.human_user_id IS NULL) AS awaiting_human,
  count(*) FILTER (WHERE c.handoff_sent_at IS NOT NULL) AS handoff_sent,
  count(*) FILTER (
    WHERE (c.ai_processing = true AND c.updated_at < now() - interval '10 minutes')
       OR (c.human_talk = true AND c.human_user_id IS NULL)
  ) AS possibly_stuck,
  coalesce((
    SELECT a.modo_automatico
    FROM public.orbit_ai_config a
    WHERE a.empresa_id = c.empresa_id
    ORDER BY a.updated_at DESC NULLS LAST
    LIMIT 1
  ), false) AS automatic_mode_enabled
FROM public.orbit_conversas c
WHERE c.status = 'aberta'
  AND c.archived_at IS NULL
GROUP BY c.empresa_id;

CREATE OR REPLACE FUNCTION public.orbit_tenant_ops_action(
  p_tenant_slug text,
  p_action_type text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_actor_id uuid := auth.uid();
  v_empresa_id uuid;
  v_affected_rows integer := 0;
  v_message text;
  v_is_authorized boolean := false;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'UNAUTHENTICATED';
  END IF;

  IF p_tenant_slug IS NULL OR btrim(p_tenant_slug) = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'TENANT_SLUG_REQUIRED';
  END IF;

  IF p_action_type NOT IN (
    'pause_tenant_ai',
    'resume_tenant_ai',
    'retry_failed_queues',
    'clear_pending_queues'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_ACTION_TYPE';
  END IF;

  SELECT e.id
    INTO v_empresa_id
  FROM public.orbit_empresas e
  WHERE e.slug = p_tenant_slug
    AND e.ativo = true;

  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'TENANT_NOT_FOUND';
  END IF;

  SELECT
    public.has_role(v_actor_id, 'super_admin'::public.app_role)
    OR (
      public.has_role(v_actor_id, 'admin'::public.app_role)
      AND EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = v_actor_id
          AND p.empresa_id = v_empresa_id
          AND p.ativo = true
      )
    )
    INTO v_is_authorized;

  IF NOT coalesce(v_is_authorized, false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TENANT_ACTION_FORBIDDEN';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.orbit_feature_flags f
    WHERE f.empresa_id = v_empresa_id
      AND f.feature_key = 'tenant_operations_center_v1'
      AND f.enabled = true
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TENANT_OPERATIONS_FEATURE_DISABLED';
  END IF;

  CASE p_action_type
    WHEN 'pause_tenant_ai' THEN
      UPDATE public.orbit_ai_config
      SET modo_automatico = false,
          updated_at = now()
      WHERE empresa_id = v_empresa_id
        AND modo_automatico IS DISTINCT FROM false;
      GET DIAGNOSTICS v_affected_rows = ROW_COUNT;
      v_message := 'IA global pausada com sucesso.';

    WHEN 'resume_tenant_ai' THEN
      UPDATE public.orbit_ai_config
      SET modo_automatico = true,
          updated_at = now()
      WHERE empresa_id = v_empresa_id
        AND modo_automatico IS DISTINCT FROM true;
      GET DIAGNOSTICS v_affected_rows = ROW_COUNT;
      v_message := 'IA global retomada com sucesso.';

    WHEN 'retry_failed_queues' THEN
      UPDATE public.orbit_whatsapp_outbox
      SET status = 'pending',
          attempts = 0,
          locked_at = NULL,
          locked_by = NULL,
          next_attempt_at = now(),
          last_error = NULL,
          updated_at = now()
      WHERE empresa_id = v_empresa_id
        AND status = 'failed';
      GET DIAGNOSTICS v_affected_rows = ROW_COUNT;
      v_message := 'Mensagens com falha devolvidas à fila.';

    WHEN 'clear_pending_queues' THEN
      UPDATE public.orbit_whatsapp_outbox
      SET status = 'canceled',
          canceled_at = now(),
          canceled_reason = 'tenant_ops_manual_clear',
          locked_at = NULL,
          locked_by = NULL,
          updated_at = now()
      WHERE empresa_id = v_empresa_id
        AND status = 'pending';
      GET DIAGNOSTICS v_affected_rows = ROW_COUNT;
      v_message := 'Mensagens pendentes canceladas sem exclusão física.';
  END CASE;

  INSERT INTO public.orbit_audit_log (
    empresa_id,
    user_id,
    acao,
    entidade,
    entidade_id,
    detalhes
  ) VALUES (
    v_empresa_id,
    v_actor_id,
    p_action_type,
    'tenant_operations',
    v_empresa_id,
    jsonb_build_object(
      'tenant_slug', p_tenant_slug,
      'affected_rows', v_affected_rows,
      'payload', coalesce(p_payload, '{}'::jsonb),
      'source', 'tenant_operations_center_v2'
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'action', p_action_type,
    'affected_rows', v_affected_rows,
    'message', v_message
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.orbit_tenant_ops_action(text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.orbit_tenant_ops_action(text, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.orbit_tenant_ops_action(text, text, jsonb) TO authenticated;

COMMENT ON FUNCTION public.orbit_tenant_ops_action(text, text, jsonb) IS
  'Executes audited, tenant-scoped operational actions for enabled Tenant Operations Center tenants.';
