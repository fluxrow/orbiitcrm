-- Tenant Operations Center, phase 1: read-only contracts and tenant-scoped
-- feature flag. No operational mutation is introduced by this migration.

CREATE TABLE IF NOT EXISTS public.orbit_tenant_feature_flags (
  empresa_id uuid NOT NULL REFERENCES public.orbit_empresas(id) ON DELETE CASCADE,
  feature_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  enabled_at timestamptz NULL,
  enabled_by uuid NULL REFERENCES auth.users(id),
  rollout_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, feature_key),
  CONSTRAINT orbit_tenant_feature_flags_key_chk
    CHECK (feature_key ~ '^[a-z][a-z0-9_]{2,80}$')
);

COMMENT ON TABLE public.orbit_tenant_feature_flags IS
  'Tenant-scoped rollout flags. Missing rows are disabled by definition.';

ALTER TABLE public.orbit_tenant_feature_flags ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.orbit_tenant_feature_flags FROM PUBLIC, anon;
GRANT SELECT ON TABLE public.orbit_tenant_feature_flags TO authenticated;
GRANT ALL ON TABLE public.orbit_tenant_feature_flags TO service_role;

DROP POLICY IF EXISTS orbit_tenant_feature_flags_select ON public.orbit_tenant_feature_flags;
CREATE POLICY orbit_tenant_feature_flags_select
  ON public.orbit_tenant_feature_flags FOR SELECT TO authenticated
  USING (
    empresa_id = public.get_user_empresa_id((SELECT auth.uid()))
    OR public.has_role((SELECT auth.uid()), 'super_admin'::public.app_role)
  );

-- Writes remain infrastructure-owned. There is intentionally no authenticated
-- INSERT/UPDATE/DELETE policy in phase 1.

CREATE OR REPLACE VIEW public.orbit_tenant_ops_agenda_v
WITH (security_invoker = true)
AS
SELECT
  empresa_id,
  true AS connected,
  CASE
    WHEN google_email IS NULL THEN NULL
    ELSE left(google_email, 2) || '***@' || split_part(google_email, '@', 2)
  END AS google_account_masked,
  CASE
    WHEN calendar_id = 'primary' THEN 'primary'
    WHEN calendar_id IS NULL THEN NULL
    ELSE '***' || right(calendar_id, 6)
  END AS calendar_id_masked,
  timezone,
  availability_start,
  availability_end,
  availability_break_start,
  availability_break_end,
  booking_min_notice_minutes,
  booking_max_horizon_days,
  -- Row existence proves a connected credential record without selecting the
  -- credential columns themselves through this security-invoker view.
  true AS token_present,
  expires_at,
  updated_at
FROM public.orbit_google_tokens;

CREATE OR REPLACE VIEW public.orbit_tenant_ops_whatsapp_v
WITH (security_invoker = true)
AS
SELECT
  z.empresa_id,
  z.ativo,
  z.envio_real_liberado,
  z.instance_offline,
  CASE WHEN z.instance_id IS NULL THEN NULL ELSE '***' || right(z.instance_id, 6) END AS instance_id_masked,
  CASE WHEN z.numero_origem IS NULL THEN NULL ELSE '***' || right(regexp_replace(z.numero_origem, '\D', '', 'g'), 4) END AS source_number_masked,
  z.instance_id IS NOT NULL AS instance_id_present,
  z.token_secret_id IS NOT NULL AS token_present,
  z.client_token_secret_id IS NOT NULL AS client_token_present,
  (z.token_secret_id IS NOT NULL AND z.client_token_secret_id IS NOT NULL) AS vault_backed,
  z.last_status_check_at,
  z.last_online_at,
  z.offline_since,
  z.offline_reason,
  z.canary_mode_enabled,
  cardinality(COALESCE(z.canary_phone_numbers, ARRAY[]::text[])) AS canary_numbers_count,
  COALESCE(s.enabled, false) AS queue_enabled,
  COALESCE(s.outbox_adapter_enabled, false) AS adapter_enabled,
  s.daily_limit,
  s.max_per_minute,
  COALESCE(s.warmup_enabled, false) AS warmup_enabled,
  s.warmup_start_date
FROM public.orbit_zapi_config z
LEFT JOIN public.orbit_whatsapp_sending_config s ON s.empresa_id = z.empresa_id;

CREATE OR REPLACE VIEW public.orbit_tenant_ops_queue_v
WITH (security_invoker = true)
AS
SELECT
  empresa_id,
  status,
  count(*)::bigint AS item_count,
  count(*) FILTER (WHERE created_at < now() - interval '24 hours')::bigint AS over_24h,
  count(*) FILTER (WHERE locked_at IS NOT NULL)::bigint AS active_locks,
  count(*) FILTER (
    WHERE status = 'processing' AND locked_at < now() - interval '10 minutes'
  )::bigint AS possibly_orphaned_locks,
  min(created_at) FILTER (WHERE status = 'pending') AS oldest_pending_at
FROM public.orbit_whatsapp_outbox
GROUP BY empresa_id, status;

CREATE OR REPLACE VIEW public.orbit_tenant_ops_ai_handoff_v
WITH (security_invoker = true)
AS
SELECT
  c.empresa_id,
  count(*) FILTER (WHERE COALESCE(c.human_talk, false) = false)::bigint AS ai_active,
  count(*) FILTER (WHERE c.human_talk = true AND c.human_user_id IS NOT NULL)::bigint AS human_owned,
  count(*) FILTER (WHERE c.handoff_sent_at IS NOT NULL AND c.human_user_id IS NULL)::bigint AS awaiting_human,
  count(*) FILTER (WHERE c.handoff_sent_at IS NOT NULL)::bigint AS handoff_sent,
  count(*) FILTER (
    WHERE c.ai_processing = true AND c.updated_at < now() - interval '10 minutes'
       OR c.human_talk = true AND c.human_user_id IS NULL
  )::bigint AS possibly_stuck
FROM public.orbit_conversas c
WHERE c.status = 'aberta' AND c.archived_at IS NULL
GROUP BY c.empresa_id;

CREATE OR REPLACE VIEW public.orbit_tenant_ops_media_v
WITH (security_invoker = true)
AS
SELECT
  empresa_id,
  kind,
  count(*)::bigint AS total,
  count(*) FILTER (WHERE ativo AND aprovado)::bigint AS active,
  count(*) FILTER (WHERE NOT ativo)::bigint AS inactive,
  count(*) FILTER (WHERE storage_path LIKE 'http%')::bigint AS legacy_public_urls,
  sum(uso_count)::bigint AS reference_count
FROM public.orbit_media_library
GROUP BY empresa_id, kind;

REVOKE ALL ON public.orbit_tenant_ops_agenda_v FROM PUBLIC, anon;
REVOKE ALL ON public.orbit_tenant_ops_whatsapp_v FROM PUBLIC, anon;
REVOKE ALL ON public.orbit_tenant_ops_queue_v FROM PUBLIC, anon;
REVOKE ALL ON public.orbit_tenant_ops_ai_handoff_v FROM PUBLIC, anon;
REVOKE ALL ON public.orbit_tenant_ops_media_v FROM PUBLIC, anon;

GRANT SELECT ON public.orbit_tenant_ops_agenda_v TO authenticated, service_role;
GRANT SELECT ON public.orbit_tenant_ops_whatsapp_v TO authenticated, service_role;
GRANT SELECT ON public.orbit_tenant_ops_queue_v TO authenticated, service_role;
GRANT SELECT ON public.orbit_tenant_ops_ai_handoff_v TO authenticated, service_role;
GRANT SELECT ON public.orbit_tenant_ops_media_v TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.orbit_tenant_ops_read(p_section text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_empresa_id uuid;
  v_enabled boolean := false;
  v_role text := 'viewer';
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  SELECT p.empresa_id INTO v_empresa_id
  FROM public.profiles p
  WHERE p.id = v_uid;

  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'tenant_context_missing' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(f.enabled, false) INTO v_enabled
  FROM public.orbit_tenant_feature_flags f
  WHERE f.empresa_id = v_empresa_id
    AND f.feature_key = 'tenant_operations_center_v1';

  v_enabled := COALESCE(v_enabled, false);

  IF public.has_role(v_uid, 'super_admin'::public.app_role) THEN v_role := 'super_admin';
  ELSIF public.has_role(v_uid, 'admin'::public.app_role) OR public.pe_user_is_orbit_admin(v_uid) THEN v_role := 'admin';
  ELSIF public.has_role(v_uid, 'vendedor'::public.app_role) THEN v_role := 'vendedor';
  END IF;

  IF p_section NOT IN ('health', 'capabilities') AND NOT v_enabled THEN
    RAISE EXCEPTION 'feature_disabled' USING ERRCODE = '42501';
  END IF;

  CASE p_section
    WHEN 'health' THEN
      v_result := jsonb_build_object(
        'status', 'healthy', 'api_available', true, 'database_available', true,
        'feature_enabled', v_enabled, 'generated_at', now(),
        'supported_sections', jsonb_build_array('summary','agenda','whatsapp','ai_handoff','queues','media','alerts','audit','capabilities','health')
      );
    WHEN 'capabilities' THEN
      v_result := jsonb_build_object(
        'role', v_role,
        'feature_enabled', v_enabled,
        'impersonation', jsonb_build_object('active', false, 'expires_at', NULL, 'session_id', NULL),
        'read_only', true
      );
    WHEN 'agenda' THEN
      SELECT COALESCE((
        SELECT to_jsonb(a) FROM public.orbit_tenant_ops_agenda_v a
        WHERE a.empresa_id = v_empresa_id LIMIT 1
      ), jsonb_build_object(
        'empresa_id', v_empresa_id, 'connected', false, 'timezone', 'America/Sao_Paulo',
        'availability_start', '09:00', 'availability_end', '18:00',
        'booking_min_notice_minutes', 60, 'booking_max_horizon_days', 60,
        'token_present', false
      )) INTO v_result;
    WHEN 'whatsapp' THEN
      SELECT COALESCE((
        SELECT to_jsonb(w) FROM public.orbit_tenant_ops_whatsapp_v w
        WHERE w.empresa_id = v_empresa_id LIMIT 1
      ), jsonb_build_object(
        'empresa_id', v_empresa_id, 'configured', false, 'ativo', false,
        'envio_real_liberado', false, 'instance_offline', false
      )) INTO v_result;
    WHEN 'queues' THEN
      SELECT jsonb_build_object(
        'stale_status_supported', false,
        'counts', COALESCE(jsonb_object_agg(q.status, q.item_count), '{}'::jsonb),
        'over_24h', COALESCE(sum(q.over_24h), 0),
        'active_locks', COALESCE(sum(q.active_locks), 0),
        'possibly_orphaned_locks', COALESCE(sum(q.possibly_orphaned_locks), 0),
        'oldest_pending_at', min(q.oldest_pending_at)
      ) INTO v_result
      FROM public.orbit_tenant_ops_queue_v q WHERE q.empresa_id = v_empresa_id;
    WHEN 'ai_handoff' THEN
      SELECT COALESCE((
        SELECT to_jsonb(h) FROM public.orbit_tenant_ops_ai_handoff_v h
        WHERE h.empresa_id = v_empresa_id LIMIT 1
      ), jsonb_build_object(
        'empresa_id', v_empresa_id, 'ai_active', 0, 'human_owned', 0,
        'awaiting_human', 0, 'handoff_sent', 0, 'possibly_stuck', 0
      )) || jsonb_build_object(
        'pending_debounce', (SELECT count(*) FROM public.orbit_ai_reply_debounce d WHERE d.empresa_id = v_empresa_id AND d.status = 'pending'),
        'automatic_mode_enabled', COALESCE((SELECT modo_automatico FROM public.orbit_ai_config WHERE empresa_id = v_empresa_id LIMIT 1), false),
        'automation_cutoff', (SELECT auto_reply_new_leads_from FROM public.orbit_ai_config WHERE empresa_id = v_empresa_id LIMIT 1)
      ) INTO v_result;
    WHEN 'media' THEN
      SELECT jsonb_build_object(
        'by_type', COALESCE(jsonb_object_agg(m.kind, m.total), '{}'::jsonb),
        'active', COALESCE(sum(m.active), 0), 'inactive', COALESCE(sum(m.inactive), 0),
        'legacy_public_urls_detected', COALESCE(sum(m.legacy_public_urls), 0),
        'referenced_by_flows', COALESCE(sum(m.reference_count), 0),
        'private_bucket_expected', true, 'signed_url_enabled', true
      ) INTO v_result
      FROM public.orbit_tenant_ops_media_v m WHERE m.empresa_id = v_empresa_id;
    WHEN 'alerts' THEN
      SELECT jsonb_build_object(
        'master_channel_configured', true,
        'critical', count(*) FILTER (WHERE event_type IN ('offline','auth_error')),
        'warning', count(*) FILTER (WHERE event_type NOT IN ('offline','auth_error')),
        'delivery_failed', count(*) FILTER (WHERE alert_attempts > 0 AND NOT alert_sent)
      ) INTO v_result
      FROM public.orbit_zapi_status_events e WHERE e.empresa_id = v_empresa_id;
    WHEN 'audit' THEN
      SELECT jsonb_build_object(
        'retention_days', 365, 'coverage', 'partial',
        'items', COALESCE(jsonb_agg(to_jsonb(x) ORDER BY x.occurred_at DESC), '[]'::jsonb)
      ) INTO v_result
      FROM (
        SELECT a.id, a.created_at AS occurred_at, a.acao AS action,
               a.entidade AS resource_type, a.entidade_id AS resource_id,
               CASE WHEN a.user_id IS NULL THEN 'system' ELSE 'user' END AS actor_type
        FROM public.orbit_audit_log a
        WHERE a.empresa_id = v_empresa_id
        ORDER BY a.created_at DESC LIMIT 50
      ) x;
    WHEN 'summary' THEN
      v_result := jsonb_build_object(
        'feature_enabled', v_enabled,
        'queue', public.orbit_tenant_ops_read('queues'),
        'conversations', public.orbit_tenant_ops_read('ai_handoff'),
        'agenda_configured', EXISTS (SELECT 1 FROM public.orbit_tenant_ops_agenda_v WHERE empresa_id = v_empresa_id),
        'whatsapp_configured', EXISTS (SELECT 1 FROM public.orbit_tenant_ops_whatsapp_v WHERE empresa_id = v_empresa_id)
      );
    ELSE
      RAISE EXCEPTION 'invalid_section' USING ERRCODE = '22023';
  END CASE;

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.orbit_tenant_ops_read(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orbit_tenant_ops_read(text) TO authenticated, service_role;

COMMENT ON FUNCTION public.orbit_tenant_ops_read(text) IS
  'Read-only tenant operations API. Tenant is derived exclusively from auth.uid()/profiles.empresa_id.';
