ALTER TABLE public.orbit_whatsapp_outbox
  DROP CONSTRAINT orbit_whatsapp_outbox_status_chk;

ALTER TABLE public.orbit_whatsapp_outbox
  ADD CONSTRAINT orbit_whatsapp_outbox_status_chk
  CHECK (status = ANY (ARRAY[
    'pending'::text,
    'processing'::text,
    'sent'::text,
    'failed'::text,
    'canceled'::text,
    'stale_canceled'::text,
    'simulated'::text
  ]));

DROP VIEW public.orbit_tenant_ops_queue_v;

CREATE VIEW public.orbit_tenant_ops_queue_v
WITH (security_invoker = true)
AS
SELECT
  e.id AS empresa_id,
  count(o.id) FILTER (WHERE o.status = 'pending') AS pending_count,
  count(o.id) FILTER (WHERE o.status = 'processing') AS processing_count,
  count(o.id) FILTER (WHERE o.status = 'failed') AS failed_count,
  count(o.id) FILTER (WHERE o.status = 'sent') AS sent_count,
  count(o.id) FILTER (WHERE o.status = 'canceled') AS canceled_count,
  count(o.id) FILTER (WHERE o.status = 'stale_canceled') AS stale_canceled_count,
  count(o.id) FILTER (
    WHERE o.status = 'pending'
      AND o.created_at < now() - interval '24 hours'
  ) AS pending_over_24h,
  extract(epoch FROM (now() - min(o.created_at) FILTER (WHERE o.status = 'pending'))) / 3600.0
    AS oldest_pending_hours,
  count(o.id) FILTER (WHERE o.locked_at IS NOT NULL) AS active_locks,
  count(o.id) FILTER (
    WHERE o.status = 'processing'
      AND o.locked_at < now() - interval '10 minutes'
  ) AS possibly_orphaned_locks,
  NOT coalesce(s.enabled, false) AS paused,
  coalesce(s.outbox_adapter_enabled, false) AS adapter_enabled
FROM public.orbit_empresas e
LEFT JOIN public.orbit_whatsapp_outbox o ON o.empresa_id = e.id
LEFT JOIN public.orbit_whatsapp_sending_config s ON s.empresa_id = e.id
GROUP BY e.id, s.enabled, s.outbox_adapter_enabled;

REVOKE ALL ON public.orbit_tenant_ops_queue_v FROM PUBLIC, anon;
GRANT SELECT ON public.orbit_tenant_ops_queue_v TO authenticated, service_role;

DROP VIEW public.orbit_tenant_ops_whatsapp_v;

CREATE VIEW public.orbit_tenant_ops_whatsapp_v
WITH (security_invoker = true)
AS
SELECT
  z.empresa_id,
  z.ativo,
  z.envio_real_liberado,
  z.instance_offline,
  CASE WHEN z.instance_id IS NULL THEN NULL ELSE '***' || right(z.instance_id, 6) END AS instance_id_masked,
  CASE WHEN z.numero_origem IS NULL THEN NULL ELSE '***' || right(regexp_replace(z.numero_origem, '\D', '', 'g'), 4) END AS source_number_masked,
  nullif(btrim(z.instance_id), '') IS NOT NULL AS instance_id_present,
  z.token_secret_id IS NOT NULL AS token_present,
  z.client_token_secret_id IS NOT NULL AS client_token_present,
  z.token_secret_id IS NOT NULL AND z.client_token_secret_id IS NOT NULL AS vault_backed,
  (
    nullif(btrim(z.instance_id), '') IS NOT NULL
    AND z.token_secret_id IS NOT NULL
    AND z.client_token_secret_id IS NOT NULL
  ) AS credentials_valid,
  z.last_status_check_at,
  z.last_online_at,
  z.offline_since,
  z.offline_reason,
  z.canary_mode_enabled,
  cardinality(coalesce(z.canary_phone_numbers, ARRAY[]::text[])) AS canary_numbers_count,
  coalesce(s.enabled, false) AS queue_enabled,
  coalesce(s.outbox_adapter_enabled, false) AS adapter_enabled,
  s.daily_limit,
  s.max_per_minute,
  coalesce(s.warmup_enabled, false) AS warmup_enabled,
  s.warmup_start_date
FROM public.orbit_zapi_config z
LEFT JOIN public.orbit_whatsapp_sending_config s ON s.empresa_id = z.empresa_id;

REVOKE ALL ON public.orbit_tenant_ops_whatsapp_v FROM PUBLIC, anon;
GRANT SELECT ON public.orbit_tenant_ops_whatsapp_v TO authenticated, service_role;

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
  v_preview_count integer := 0;
  v_message text;
  v_new_state boolean;
  v_enabled boolean;
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
    'clear_pending_queues',
    'toggle_whatsapp_live_send',
    'pause_queue_processing',
    'resume_queue_processing',
    'preview_stale_messages',
    'cancel_stale_messages'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_ACTION_TYPE';
  END IF;

  SELECT e.id INTO v_empresa_id
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
      SET modo_automatico = false, updated_at = now()
      WHERE empresa_id = v_empresa_id
        AND modo_automatico IS DISTINCT FROM false;
      GET DIAGNOSTICS v_affected_rows = ROW_COUNT;
      v_new_state := false;
      v_message := 'IA global pausada com sucesso.';

    WHEN 'resume_tenant_ai' THEN
      UPDATE public.orbit_ai_config
      SET modo_automatico = true, updated_at = now()
      WHERE empresa_id = v_empresa_id
        AND modo_automatico IS DISTINCT FROM true;
      GET DIAGNOSTICS v_affected_rows = ROW_COUNT;
      v_new_state := true;
      v_message := 'IA global retomada com sucesso.';

    WHEN 'retry_failed_queues' THEN
      SELECT count(*)::integer INTO v_preview_count
      FROM public.orbit_whatsapp_outbox
      WHERE empresa_id = v_empresa_id AND status = 'failed';
      IF v_preview_count > 50 AND p_payload->>'confirmation' IS DISTINCT FROM 'CONFIRMAR' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'TYPED_CONFIRMATION_REQUIRED';
      END IF;
      UPDATE public.orbit_whatsapp_outbox
      SET status = 'pending', attempts = 0, locked_at = NULL, locked_by = NULL,
          next_attempt_at = now(), last_error = NULL, updated_at = now()
      WHERE empresa_id = v_empresa_id
        AND status = 'failed';
      GET DIAGNOSTICS v_affected_rows = ROW_COUNT;
      v_message := 'Mensagens com falha devolvidas à fila.';

    WHEN 'clear_pending_queues' THEN
      SELECT count(*)::integer INTO v_preview_count
      FROM public.orbit_whatsapp_outbox
      WHERE empresa_id = v_empresa_id AND status = 'pending';
      IF v_preview_count > 50 AND p_payload->>'confirmation' IS DISTINCT FROM 'CONFIRMAR' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'TYPED_CONFIRMATION_REQUIRED';
      END IF;
      UPDATE public.orbit_whatsapp_outbox
      SET status = 'canceled', canceled_at = now(),
          canceled_reason = 'tenant_ops_manual_clear', locked_at = NULL,
          locked_by = NULL, updated_at = now()
      WHERE empresa_id = v_empresa_id
        AND status = 'pending';
      GET DIAGNOSTICS v_affected_rows = ROW_COUNT;
      v_message := 'Mensagens pendentes canceladas sem exclusão física.';

    WHEN 'toggle_whatsapp_live_send' THEN
      IF jsonb_typeof(p_payload->'enabled') IS DISTINCT FROM 'boolean' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ENABLED_BOOLEAN_REQUIRED';
      END IF;
      v_enabled := (p_payload->>'enabled')::boolean;

      IF v_enabled AND NOT EXISTS (
        SELECT 1
        FROM public.orbit_zapi_config z
        WHERE z.empresa_id = v_empresa_id
          AND nullif(btrim(z.instance_id), '') IS NOT NULL
          AND (z.token_secret_id IS NOT NULL OR nullif(btrim(z.token), '') IS NOT NULL)
          AND (z.client_token_secret_id IS NOT NULL OR nullif(btrim(z.client_token), '') IS NOT NULL)
      ) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'WHATSAPP_CREDENTIALS_INVALID';
      END IF;

      UPDATE public.orbit_zapi_config
      SET envio_real_liberado = v_enabled, updated_at = now()
      WHERE empresa_id = v_empresa_id
        AND envio_real_liberado IS DISTINCT FROM v_enabled;
      GET DIAGNOSTICS v_affected_rows = ROW_COUNT;
      v_new_state := v_enabled;
      v_message := CASE WHEN v_enabled
        THEN 'Envio real do WhatsApp ativado.'
        ELSE 'Envio real do WhatsApp pausado.'
      END;

    WHEN 'pause_queue_processing' THEN
      INSERT INTO public.orbit_whatsapp_sending_config (empresa_id, enabled, updated_at)
      VALUES (v_empresa_id, false, now())
      ON CONFLICT (empresa_id) DO UPDATE
      SET enabled = false, updated_at = now();
      GET DIAGNOSTICS v_affected_rows = ROW_COUNT;
      v_new_state := false;
      v_message := 'Consumo da fila pausado.';

    WHEN 'resume_queue_processing' THEN
      INSERT INTO public.orbit_whatsapp_sending_config (empresa_id, enabled, updated_at)
      VALUES (v_empresa_id, true, now())
      ON CONFLICT (empresa_id) DO UPDATE
      SET enabled = true, updated_at = now();
      GET DIAGNOSTICS v_affected_rows = ROW_COUNT;
      v_new_state := true;
      v_message := 'Consumo da fila retomado.';

    WHEN 'preview_stale_messages' THEN
      SELECT count(*)::integer INTO v_preview_count
      FROM public.orbit_whatsapp_outbox o
      WHERE o.empresa_id = v_empresa_id
        AND o.status = 'pending'
        AND o.created_at < now() - interval '24 hours';
      v_message := 'Prévia do backlog antigo calculada.';

    WHEN 'cancel_stale_messages' THEN
      SELECT count(*)::integer INTO v_preview_count
      FROM public.orbit_whatsapp_outbox
      WHERE empresa_id = v_empresa_id
        AND status = 'pending'
        AND created_at < now() - interval '24 hours';
      IF v_preview_count > 50 AND p_payload->>'confirmation' IS DISTINCT FROM 'CONFIRMAR' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'TYPED_CONFIRMATION_REQUIRED';
      END IF;
      UPDATE public.orbit_whatsapp_outbox
      SET status = 'stale_canceled', canceled_at = now(),
          canceled_reason = 'tenant_ops_stale_over_24h', locked_at = NULL,
          locked_by = NULL, updated_at = now()
      WHERE empresa_id = v_empresa_id
        AND status = 'pending'
        AND created_at < now() - interval '24 hours';
      GET DIAGNOSTICS v_affected_rows = ROW_COUNT;
      v_message := 'Backlog antigo marcado como stale_canceled.';
  END CASE;

  INSERT INTO public.orbit_audit_log
    (empresa_id, user_id, acao, entidade, entidade_id, detalhes)
  VALUES
    (v_empresa_id, v_actor_id, p_action_type, 'tenant_operations', v_empresa_id,
     jsonb_build_object(
       'tenant_slug', p_tenant_slug,
       'affected_rows', v_affected_rows,
       'preview_count', v_preview_count,
       'new_state', v_new_state,
       'payload', coalesce(p_payload, '{}'::jsonb),
       'source', 'tenant_operations_center_v2'
     ));

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'ok', true,
    'action', p_action_type,
    'affected_rows', v_affected_rows,
    'preview_count', v_preview_count,
    'new_state', v_new_state,
    'message', v_message
  ));
END;
$function$;

REVOKE ALL ON FUNCTION public.orbit_tenant_ops_action(text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.orbit_tenant_ops_action(text, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.orbit_tenant_ops_action(text, text, jsonb) TO authenticated;
