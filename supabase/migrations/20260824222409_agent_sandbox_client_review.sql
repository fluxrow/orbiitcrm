-- Client-owned Agent Sandbox validation. Stores only the decision and a short
-- comment; conversations remain stateless and no operational capability is
-- activated by approval.
BEGIN;

INSERT INTO public.orbit_feature_flags(
  empresa_id, feature_key, enabled, enabled_at, rollout_metadata
)
SELECT e.id,
       'tenant_agent_sandbox_review_v1',
       e.slug = 'comunica',
       CASE WHEN e.slug = 'comunica' THEN now() ELSE NULL END,
       jsonb_build_object(
         'canary', e.slug = 'comunica',
         'scope', 'client_owned_agent_validation',
         'activates_runtime', false
       )
FROM public.orbit_empresas e
WHERE e.slug IN (
  'comunica', 'fluxrow', 'bullink-negocios',
  'fabrica-de-pesquisadores', 'viver-semijoias'
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
      ('comunica'::text, true),
      ('fluxrow'::text, false),
      ('bullink-negocios'::text, false),
      ('fabrica-de-pesquisadores'::text, false),
      ('viver-semijoias'::text, false)
  ) AS expected(slug, enabled)
  LEFT JOIN public.orbit_empresas e ON e.slug = expected.slug
  LEFT JOIN public.orbit_feature_flags f
    ON f.empresa_id = e.id
   AND f.feature_key = 'tenant_agent_sandbox_review_v1'
  WHERE e.id IS NULL OR f.enabled IS DISTINCT FROM expected.enabled;

  IF v_invalid IS NOT NULL THEN
    RAISE EXCEPTION 'AGENT_SANDBOX_REVIEW_ROLLOUT_MISMATCH: %', v_invalid;
  END IF;
END
$rollout_guard$;

CREATE TABLE public.orbit_agent_sandbox_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.orbit_empresas(id) ON DELETE CASCADE,
  scenario_key text NOT NULL CHECK (scenario_key IN (
    'initial_approach',
    'qualification',
    'objection_handling',
    'human_handoff',
    'safety_boundaries'
  )),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewer_id uuid REFERENCES auth.users(id),
  comment text,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT orbit_agent_sandbox_reviews_comment_length
    CHECK (comment IS NULL OR char_length(comment) <= 2000),
  UNIQUE (empresa_id, scenario_key)
);

COMMENT ON TABLE public.orbit_agent_sandbox_reviews IS
  'Tenant-client decisions for stateless Agent Sandbox scenarios. No transcript and no runtime activation.';

ALTER TABLE public.orbit_agent_sandbox_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.orbit_agent_sandbox_reviews FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.orbit_agent_sandbox_reviews TO service_role;

CREATE OR REPLACE FUNCTION public.orbit_get_agent_sandbox_review(
  p_tenant_slug text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_empresa_id uuid;
  v_enabled boolean := false;
  v_is_super boolean := false;
  v_can_review boolean := false;
  v_reviews jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'UNAUTHENTICATED';
  END IF;

  SELECT e.id INTO v_empresa_id
  FROM public.orbit_empresas e
  WHERE e.slug = btrim(p_tenant_slug) AND coalesce(e.ativo, false) = true;
  IF v_empresa_id IS NULL OR NOT public.user_has_empresa_access(v_empresa_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TENANT_ACCESS_DENIED';
  END IF;

  SELECT coalesce(f.enabled, false) INTO v_enabled
  FROM public.orbit_feature_flags f
  WHERE f.empresa_id = v_empresa_id
    AND f.feature_key = 'tenant_agent_sandbox_review_v1';

  v_is_super := public.has_role(v_uid, 'super_admin'::public.app_role)
    OR public.pe_is_super_admin(v_uid);

  SELECT (NOT v_is_super) AND (
    (
      public.has_role(v_uid, 'admin'::public.app_role)
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = v_uid AND p.empresa_id = v_empresa_id AND coalesce(p.ativo, false) = true
      )
    )
    OR EXISTS (
      SELECT 1 FROM public.user_empresa_memberships m
      WHERE m.user_id = v_uid AND m.empresa_id = v_empresa_id AND m.role = 'admin'
    )
  ) INTO v_can_review;

  IF v_enabled THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', r.id,
      'scenario_key', r.scenario_key,
      'status', r.status,
      'comment', r.comment,
      'reviewer_id', r.reviewer_id,
      'reviewed_at', r.reviewed_at,
      'updated_at', r.updated_at
    ) ORDER BY r.scenario_key), '[]'::jsonb)
    INTO v_reviews
    FROM public.orbit_agent_sandbox_reviews r
    WHERE r.empresa_id = v_empresa_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'enabled', v_enabled,
    'can_review', v_enabled AND coalesce(v_can_review, false),
    'reviewer_requirement', 'tenant_admin_not_super_admin',
    'reviews', v_reviews
  );
END
$function$;

REVOKE ALL ON FUNCTION public.orbit_get_agent_sandbox_review(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orbit_get_agent_sandbox_review(text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.orbit_save_agent_sandbox_review(
  p_tenant_slug text,
  p_scenario_key text,
  p_status text,
  p_comment text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_empresa_id uuid;
  v_is_super boolean := false;
  v_is_admin boolean := false;
  v_review_id uuid;
  v_comment text := nullif(btrim(coalesce(p_comment, '')), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'UNAUTHENTICATED';
  END IF;
  IF p_scenario_key NOT IN (
    'initial_approach','qualification','objection_handling',
    'human_handoff','safety_boundaries'
  ) OR p_status NOT IN ('pending','approved','rejected') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_SANDBOX_REVIEW';
  END IF;
  IF char_length(coalesce(v_comment, '')) > 2000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'COMMENT_TOO_LONG';
  END IF;
  IF p_status = 'rejected' AND v_comment IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'REJECTION_COMMENT_REQUIRED';
  END IF;

  SELECT e.id INTO v_empresa_id
  FROM public.orbit_empresas e
  JOIN public.orbit_feature_flags f
    ON f.empresa_id = e.id
   AND f.feature_key = 'tenant_agent_sandbox_review_v1'
   AND f.enabled = true
  WHERE e.slug = btrim(p_tenant_slug) AND coalesce(e.ativo, false) = true;
  IF v_empresa_id IS NULL OR NOT public.user_has_empresa_access(v_empresa_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'SANDBOX_REVIEW_FEATURE_DISABLED';
  END IF;

  v_is_super := public.has_role(v_uid, 'super_admin'::public.app_role)
    OR public.pe_is_super_admin(v_uid);
  IF v_is_super THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'CLIENT_REVIEWER_REQUIRED';
  END IF;

  SELECT (
      public.has_role(v_uid, 'admin'::public.app_role)
      AND EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = v_uid AND p.empresa_id = v_empresa_id AND coalesce(p.ativo, false) = true
      )
    )
    OR EXISTS (
      SELECT 1 FROM public.user_empresa_memberships m
      WHERE m.user_id = v_uid AND m.empresa_id = v_empresa_id AND m.role = 'admin'
    )
  INTO v_is_admin;
  IF NOT coalesce(v_is_admin, false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TENANT_ADMIN_REQUIRED';
  END IF;

  INSERT INTO public.orbit_agent_sandbox_reviews(
    empresa_id, scenario_key, status, reviewer_id, comment, reviewed_at
  ) VALUES (
    v_empresa_id, p_scenario_key, p_status, v_uid, v_comment,
    CASE WHEN p_status = 'pending' THEN NULL ELSE now() END
  )
  ON CONFLICT (empresa_id, scenario_key) DO UPDATE SET
    status = excluded.status,
    reviewer_id = excluded.reviewer_id,
    comment = excluded.comment,
    reviewed_at = excluded.reviewed_at,
    updated_at = now()
  RETURNING id INTO v_review_id;

  INSERT INTO public.orbit_audit_log(
    empresa_id, user_id, acao, entidade, entidade_id, detalhes
  ) VALUES (
    v_empresa_id, v_uid, 'agent_sandbox_scenario_reviewed',
    'orbit_agent_sandbox_reviews', v_review_id,
    jsonb_build_object(
      'scenario_key', p_scenario_key,
      'status', p_status,
      'has_comment', v_comment IS NOT NULL,
      'comment_length', char_length(coalesce(v_comment, '')),
      'activates_runtime', false
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'review_id', v_review_id,
    'scenario_key', p_scenario_key,
    'status', p_status,
    'activates_runtime', false
  );
END
$function$;

REVOKE ALL ON FUNCTION public.orbit_save_agent_sandbox_review(text,text,text,text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orbit_save_agent_sandbox_review(text,text,text,text)
  TO authenticated;

COMMIT;
