-- Phase 0 reconciliation point for Tenant Operations Center phases 1-4.
--
-- The objects below were observed in the Lovable Cloud production catalog on
-- 2026-08-20, while migrations 20260819230541 through 20260820230000 were not
-- present in supabase_migrations.schema_migrations. The original, complete DDL
-- remains versioned in those migrations. This migration is intentionally
-- idempotent: it records the expected canary state, removes excess anonymous
-- privileges, and fails closed if the production contract has drifted.
--
-- It does not re-create or replace the RPC bodies. Any failed assertion must be
-- investigated before deployment instead of silently overwriting production.

BEGIN;

-- Register the rollout baseline without overwriting an existing decision.
INSERT INTO public.orbit_feature_flags (
  empresa_id,
  feature_key,
  enabled,
  enabled_at,
  rollout_metadata
)
SELECT
  e.id,
  'tenant_operations_center_v1',
  true,
  now(),
  jsonb_build_object(
    'canary', true,
    'source', 'phase0_baseline_reconciliation'
  )
FROM public.orbit_empresas e
WHERE e.slug = 'fluxrow'
ON CONFLICT (empresa_id, feature_key) DO NOTHING;

INSERT INTO public.orbit_feature_flags (
  empresa_id,
  feature_key,
  enabled,
  rollout_metadata
)
SELECT
  e.id,
  'tenant_operations_center_v1',
  false,
  jsonb_build_object(
    'protected_tenant', true,
    'source', 'phase0_baseline_reconciliation'
  )
FROM public.orbit_empresas e
WHERE e.slug IN (
  'bullink-negocios',
  'fabrica-de-pesquisadores',
  'viver-semijoias'
)
ON CONFLICT (empresa_id, feature_key) DO NOTHING;

-- Fail closed if an existing rollout decision differs from the approved
-- baseline. This migration never flips an existing feature flag.
DO $phase0$
DECLARE
  v_missing text[];
  v_wrong text[];
BEGIN
  SELECT array_agg(expected.slug ORDER BY expected.slug)
  INTO v_missing
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
   AND f.feature_key = 'tenant_operations_center_v1'
  WHERE e.id IS NULL OR f.empresa_id IS NULL;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'PHASE0_REQUIRED_TENANT_OR_FLAG_MISSING: %', v_missing;
  END IF;

  SELECT array_agg(expected.slug ORDER BY expected.slug)
  INTO v_wrong
  FROM (
    VALUES
      ('fluxrow'::text, true),
      ('bullink-negocios'::text, false),
      ('fabrica-de-pesquisadores'::text, false),
      ('viver-semijoias'::text, false)
  ) AS expected(slug, enabled)
  JOIN public.orbit_empresas e ON e.slug = expected.slug
  JOIN public.orbit_feature_flags f
    ON f.empresa_id = e.id
   AND f.feature_key = 'tenant_operations_center_v1'
  WHERE f.enabled IS DISTINCT FROM expected.enabled;

  IF v_wrong IS NOT NULL THEN
    RAISE EXCEPTION 'PHASE0_FEATURE_FLAG_BASELINE_MISMATCH: %', v_wrong;
  END IF;
END
$phase0$;

-- Remove excess unauthenticated table privileges. RLS remains the row-level
-- boundary, while these revocations reduce the exposed Data API surface.
REVOKE ALL ON TABLE public.orbit_feature_flags FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.orbit_support_sessions FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.orbit_tenant_alert_config FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.orbit_prompt_versions FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.orbit_flow_versions FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.orbit_audit_log FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.orbit_conversas FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.orbit_whatsapp_outbox FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.orbit_ai_knowledge FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.orbit_onboarding_implementation_drafts FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.orbit_google_tokens FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.orbit_zapi_config FROM PUBLIC, anon;

REVOKE ALL ON TABLE public.orbit_tenant_ops_agenda_v FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.orbit_tenant_ops_whatsapp_v FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.orbit_tenant_ops_queue_v FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.orbit_tenant_ops_ai_handoff_v FROM PUBLIC, anon;
REVOKE ALL ON TABLE public.orbit_tenant_ops_media_v FROM PUBLIC, anon;

-- Preserve the intended authenticated read surface.
GRANT SELECT ON TABLE public.orbit_feature_flags TO authenticated;
GRANT SELECT ON TABLE public.orbit_support_sessions TO authenticated;
GRANT SELECT ON TABLE public.orbit_tenant_alert_config TO authenticated;
GRANT SELECT ON TABLE public.orbit_prompt_versions TO authenticated;
GRANT SELECT ON TABLE public.orbit_flow_versions TO authenticated;
GRANT SELECT ON TABLE public.orbit_whatsapp_outbox TO authenticated;
GRANT SELECT ON TABLE public.orbit_tenant_ops_agenda_v TO authenticated;
GRANT SELECT ON TABLE public.orbit_tenant_ops_whatsapp_v TO authenticated;
GRANT SELECT ON TABLE public.orbit_tenant_ops_queue_v TO authenticated;
GRANT SELECT ON TABLE public.orbit_tenant_ops_ai_handoff_v TO authenticated;
GRANT SELECT ON TABLE public.orbit_tenant_ops_media_v TO authenticated;

-- Reassert the callable surface. Helper/wrapper functions remain private as
-- defined by their source migrations.
REVOKE ALL ON FUNCTION public.orbit_tenant_ops_read(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.orbit_tenant_ops_action(text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.orbit_get_tenant_audit_logs(text, text, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.orbit_start_jit_support_session(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.orbit_end_jit_support_session(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.orbit_get_active_jit_support_session(text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.orbit_tenant_ops_read(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.orbit_tenant_ops_action(text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.orbit_get_tenant_audit_logs(text, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.orbit_start_jit_support_session(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.orbit_end_jit_support_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.orbit_get_active_jit_support_session(text) TO authenticated;

-- Validate the observed production contract without replacing function bodies.
DO $phase0$
DECLARE
  v_invalid text[];
BEGIN
  WITH expected(signature, should_be_definer, required_setting) AS (
    VALUES
      ('public.orbit_tenant_ops_read(text)'::regprocedure, false, 'search_path=public, pg_temp'),
      ('public.orbit_tenant_ops_action(text,text,jsonb)'::regprocedure, true, 'search_path=public'),
      ('public.orbit_get_tenant_audit_logs(text,text,integer,integer)'::regprocedure, true, 'search_path=public'),
      ('public.orbit_start_jit_support_session(text,text)'::regprocedure, true, 'search_path=public'),
      ('public.orbit_end_jit_support_session(uuid)'::regprocedure, true, 'search_path=public')
  )
  SELECT array_agg(e.signature::text ORDER BY e.signature::text)
  INTO v_invalid
  FROM expected e
  JOIN pg_catalog.pg_proc p ON p.oid = e.signature
  WHERE p.prosecdef IS DISTINCT FROM e.should_be_definer
     OR NOT (coalesce(p.proconfig, ARRAY[]::text[]) @> ARRAY[e.required_setting]);

  IF v_invalid IS NOT NULL THEN
    RAISE EXCEPTION 'PHASE0_FUNCTION_SECURITY_CONTRACT_MISMATCH: %', v_invalid;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN (
        'orbit_tenant_ops_agenda_v',
        'orbit_tenant_ops_whatsapp_v',
        'orbit_tenant_ops_queue_v',
        'orbit_tenant_ops_ai_handoff_v',
        'orbit_tenant_ops_media_v'
      )
      AND NOT (coalesce(c.reloptions, ARRAY[]::text[]) @> ARRAY['security_invoker=true'])
  ) THEN
    RAISE EXCEPTION 'PHASE0_VIEW_SECURITY_INVOKER_MISMATCH';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint c
    WHERE c.conrelid = 'public.orbit_whatsapp_outbox'::regclass
      AND c.conname = 'orbit_whatsapp_outbox_status_chk'
      AND pg_get_constraintdef(c.oid) LIKE '%stale_canceled%'
  ) THEN
    RAISE EXCEPTION 'PHASE0_STALE_CANCELED_CONSTRAINT_MISSING';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger t
    WHERE t.tgrelid = 'public.orbit_audit_log'::regclass
      AND t.tgname = 'orbit_audit_attach_jit'
      AND NOT t.tgisinternal
  ) THEN
    RAISE EXCEPTION 'PHASE0_JIT_AUDIT_TRIGGER_MISSING';
  END IF;
END
$phase0$;

COMMIT;
