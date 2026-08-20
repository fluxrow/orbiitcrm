-- Explicit per-request tenant context for Tenant Operations Center reads.
-- Additive canary rollout: the legacy profile-scoped RPC remains unchanged.

BEGIN;

INSERT INTO public.orbit_feature_flags (
  empresa_id,
  feature_key,
  enabled,
  enabled_at,
  rollout_metadata
)
SELECT
  e.id,
  'tenant_explicit_context_v1',
  e.slug = 'fluxrow',
  CASE WHEN e.slug = 'fluxrow' THEN now() ELSE NULL END,
  jsonb_build_object(
    'canary', e.slug = 'fluxrow',
    'source', 'tenant_explicit_context_canary'
  )
FROM public.orbit_empresas e
WHERE e.slug IN (
  'fluxrow',
  'bullink-negocios',
  'fabrica-de-pesquisadores',
  'viver-semijoias'
)
ON CONFLICT (empresa_id, feature_key) DO NOTHING;

DO $rollout_guard$
DECLARE
  v_invalid text[];
BEGIN
  SELECT array_agg(expected.slug ORDER BY expected.slug)
  INTO v_invalid
  FROM (
    VALUES
      ('fluxrow'::text, true),
      ('bullink-negocios'::text, false),
      ('fabrica-de-pesquisadores'::text, false),
      ('viver-semijoias'::text, false)
  ) AS expected(slug, enabled)
  LEFT JOIN public.orbit_empresas e ON e.slug = expected.slug
  LEFT JOIN public.orbit_feature_flags f
    ON f.empresa_id = e.id
   AND f.feature_key = 'tenant_explicit_context_v1'
  WHERE e.id IS NULL
     OR f.enabled IS DISTINCT FROM expected.enabled;

  IF v_invalid IS NOT NULL THEN
    RAISE EXCEPTION 'TENANT_EXPLICIT_CONTEXT_ROLLOUT_MISMATCH: %', v_invalid;
  END IF;
END
$rollout_guard$;

CREATE OR REPLACE FUNCTION public.orbit_tenant_ops_read_scoped(
  p_tenant_slug text,
  p_section text DEFAULT 'summary'::text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_empresa_id uuid;
  v_authorized boolean := false;
  v_ops_enabled boolean := false;
  v_explicit_context_enabled boolean := false;
  v_queue_data jsonb;
  v_ai_handoff_data jsonb;
  v_whatsapp_data jsonb;
  v_agenda_data jsonb;
  v_media_data jsonb;
  v_content_data jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'UNAUTHENTICATED';
  END IF;

  IF nullif(btrim(p_tenant_slug), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'TENANT_CONTEXT_MISSING';
  END IF;

  IF p_section NOT IN (
    'summary', 'agenda', 'whatsapp', 'ai_handoff', 'queues', 'media',
    'prompts_flows', 'alerts', 'audit', 'capabilities', 'health'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_SECTION';
  END IF;

  SELECT e.id
  INTO v_empresa_id
  FROM public.orbit_empresas e
  WHERE e.slug = btrim(p_tenant_slug)
    AND coalesce(e.ativo, false) = true;

  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'TENANT_NOT_FOUND';
  END IF;

  SELECT
    public.has_role(v_uid, 'super_admin'::public.app_role)
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = v_uid
        AND p.empresa_id = v_empresa_id
        AND p.ativo = true
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_empresa_memberships m
      WHERE m.user_id = v_uid
        AND m.empresa_id = v_empresa_id
    )
  INTO v_authorized;

  IF NOT coalesce(v_authorized, false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TENANT_ACCESS_DENIED';
  END IF;

  SELECT
    coalesce(bool_or(f.enabled) FILTER (
      WHERE f.feature_key = 'tenant_operations_center_v1'
    ), false),
    coalesce(bool_or(f.enabled) FILTER (
      WHERE f.feature_key = 'tenant_explicit_context_v1'
    ), false)
  INTO v_ops_enabled, v_explicit_context_enabled
  FROM public.orbit_feature_flags f
  WHERE f.empresa_id = v_empresa_id
    AND f.feature_key IN (
      'tenant_operations_center_v1',
      'tenant_explicit_context_v1'
    );

  IF NOT v_ops_enabled THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TENANT_OPERATIONS_FEATURE_DISABLED';
  END IF;

  IF NOT v_explicit_context_enabled THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TENANT_EXPLICIT_CONTEXT_FEATURE_DISABLED';
  END IF;

  SELECT jsonb_build_object(
    'pending_count', count(*) FILTER (WHERE o.status = 'pending'),
    'processing_count', count(*) FILTER (WHERE o.status = 'processing'),
    'sent_count', count(*) FILTER (WHERE o.status = 'sent'),
    'failed_count', count(*) FILTER (WHERE o.status = 'failed'),
    'canceled_count', count(*) FILTER (WHERE o.status = 'canceled'),
    'stale_canceled_count', count(*) FILTER (WHERE o.status = 'stale_canceled'),
    'pending_over_24h', count(*) FILTER (
      WHERE o.status = 'pending' AND o.created_at < now() - interval '24 hours'
    ),
    'active_locks', count(*) FILTER (WHERE o.locked_at IS NOT NULL),
    'possibly_orphaned_locks', count(*) FILTER (
      WHERE o.status = 'processing'
        AND o.locked_at < now() - interval '10 minutes'
    ),
    'paused', NOT coalesce((
      SELECT s.enabled
      FROM public.orbit_whatsapp_sending_config s
      WHERE s.empresa_id = v_empresa_id
    ), false),
    'adapter_enabled', coalesce((
      SELECT s.outbox_adapter_enabled
      FROM public.orbit_whatsapp_sending_config s
      WHERE s.empresa_id = v_empresa_id
    ), false)
  )
  INTO v_queue_data
  FROM public.orbit_whatsapp_outbox o
  WHERE o.empresa_id = v_empresa_id;

  SELECT coalesce(
    (SELECT to_jsonb(h) - 'empresa_id'
     FROM public.orbit_tenant_ops_ai_handoff_v h
     WHERE h.empresa_id = v_empresa_id),
    jsonb_build_object(
      'ai_active', 0, 'human_owned', 0, 'awaiting_human', 0,
      'handoff_sent', 0, 'possibly_stuck', 0
    )
  ) || jsonb_build_object(
    'automatic_mode_enabled', coalesce((
      SELECT a.modo_automatico
      FROM public.orbit_ai_config a
      WHERE a.empresa_id = v_empresa_id
      ORDER BY a.updated_at DESC NULLS LAST
      LIMIT 1
    ), false),
    'pending_debounce', (
      SELECT count(*)
      FROM public.orbit_ai_reply_debounce d
      WHERE d.empresa_id = v_empresa_id
        AND d.status = 'pending'
    )
  )
  INTO v_ai_handoff_data;

  SELECT coalesce(
    (SELECT to_jsonb(w) - 'empresa_id'
     FROM public.orbit_tenant_ops_whatsapp_v w
     WHERE w.empresa_id = v_empresa_id),
    jsonb_build_object(
      'configured', false, 'ativo', false, 'envio_real_liberado', false,
      'instance_offline', false, 'credentials_valid', false
    )
  )
  INTO v_whatsapp_data;

  SELECT coalesce(
    (SELECT to_jsonb(a) - 'empresa_id'
     FROM public.orbit_tenant_ops_agenda_v a
     WHERE a.empresa_id = v_empresa_id),
    jsonb_build_object(
      'connected', false, 'timezone', 'America/Sao_Paulo',
      'availability_start', '09:00', 'availability_end', '18:00',
      'booking_min_notice_minutes', 60, 'booking_max_horizon_days', 60,
      'meeting_duration_default_minutes', 60, 'token_present', false
    )
  ) || jsonb_build_object(
    'exceptions', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', x.id,
        'exception_date', x.exception_date,
        'reason', x.reason,
        'is_available', x.is_available,
        'created_at', x.created_at
      ) ORDER BY x.exception_date)
      FROM public.orbit_agenda_date_exceptions x
      WHERE x.empresa_id = v_empresa_id
        AND x.exception_date >= current_date
    ), '[]'::jsonb)
  )
  INTO v_agenda_data;

  SELECT coalesce(
    (SELECT to_jsonb(m) - 'empresa_id'
     FROM public.orbit_tenant_ops_media_v m
     WHERE m.empresa_id = v_empresa_id),
    jsonb_build_object(
      'media_count', 0, 'active_count', 0, 'soft_deleted_count', 0,
      'total_storage_mb', 0, 'by_type', '{}'::jsonb
    )
  ) || jsonb_build_object(
    'referenced_by_flows', coalesce((
      SELECT sum(public.orbit_media_active_flow_reference_count(ml.empresa_id, ml.id))
      FROM public.orbit_media_library ml
      WHERE ml.empresa_id = v_empresa_id
        AND ml.deleted_at IS NULL
    ), 0),
    'items', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', ml.id,
        'name', ml.nome,
        'kind', ml.kind,
        'purpose', ml.purpose,
        'mime', ml.mime,
        'size_bytes', coalesce(ml.size_bytes, 0),
        'active', ml.ativo,
        'approved', ml.aprovado,
        'deleted_at', ml.deleted_at,
        'active_flow_references',
          public.orbit_media_active_flow_reference_count(ml.empresa_id, ml.id),
        'created_at', ml.created_at
      ) ORDER BY (ml.deleted_at IS NOT NULL), ml.created_at DESC)
      FROM (
        SELECT *
        FROM public.orbit_media_library
        WHERE empresa_id = v_empresa_id
        ORDER BY created_at DESC
        LIMIT 200
      ) ml
    ), '[]'::jsonb)
  )
  INTO v_media_data;

  v_content_data := public.orbit_tenant_ops_prompts_flows_read(v_empresa_id);

  RETURN jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'tenant_id', v_empresa_id,
      'tenant_slug', btrim(p_tenant_slug),
      'section', p_section,
      'generated_at', now(),
      'overall_status', 'healthy',
      'feature_enabled', true,
      'explicit_context', true,
      'queue', v_queue_data,
      'ai_handoff', v_ai_handoff_data,
      'whatsapp', v_whatsapp_data,
      'agenda', v_agenda_data,
      'media', v_media_data,
      'prompts_flows', v_content_data
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.orbit_tenant_ops_read_scoped(text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orbit_tenant_ops_read_scoped(text, text)
  TO authenticated;

COMMENT ON FUNCTION public.orbit_tenant_ops_read_scoped(text, text) IS
  'Canary tenant-operations read using an explicit, server-resolved and authorized tenant slug.';

COMMIT;
