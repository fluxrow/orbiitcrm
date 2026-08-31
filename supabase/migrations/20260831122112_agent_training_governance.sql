BEGIN;

ALTER TABLE public.orbit_ai_config
  ADD COLUMN IF NOT EXISTS conversion_guidance text;

COMMENT ON COLUMN public.orbit_ai_config.conversion_guidance IS
  'Published tenant-owned conversion guidance. It is injected before protected runtime guardrails.';

INSERT INTO public.orbit_feature_flags(
  empresa_id, feature_key, enabled, enabled_at, rollout_metadata
)
SELECT e.id,
       'tenant_agent_training_governance_v1',
       rollout.enabled,
       CASE WHEN rollout.enabled THEN now() ELSE NULL END,
       jsonb_build_object(
         'scope', 'tenant_owned_conversion_guidance',
         'protected_base_prompts', true,
         'required_scenarios', jsonb_build_array(
           'initial_approach', 'qualification', 'objection_handling',
           'human_handoff', 'safety_boundaries'
         )
       )
FROM (
  VALUES
    ('fluxrow', false),
    ('comunica', false),
    ('bullink-negocios', true),
    ('fabrica-de-pesquisadores', false),
    ('viver-semijoias', false)
) AS rollout(slug, enabled)
JOIN public.orbit_empresas e ON e.slug = rollout.slug
ON CONFLICT (empresa_id, feature_key) DO UPDATE SET
  enabled = excluded.enabled,
  enabled_at = CASE
    WHEN excluded.enabled AND public.orbit_feature_flags.enabled = false THEN now()
    ELSE public.orbit_feature_flags.enabled_at
  END,
  rollout_metadata = excluded.rollout_metadata;

CREATE TABLE public.orbit_agent_training_drafts (
  empresa_id uuid PRIMARY KEY REFERENCES public.orbit_empresas(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '' CHECK (char_length(content) <= 12000),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{32}$'),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.orbit_agent_training_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.orbit_empresas(id) ON DELETE CASCADE,
  draft_fingerprint text NOT NULL CHECK (draft_fingerprint ~ '^[0-9a-f]{32}$'),
  scenario_key text NOT NULL CHECK (scenario_key IN (
    'initial_approach', 'qualification', 'objection_handling',
    'human_handoff', 'safety_boundaries'
  )),
  status text NOT NULL CHECK (status IN ('approved', 'rejected')),
  comment text CHECK (comment IS NULL OR char_length(comment) <= 2000),
  reviewer_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, draft_fingerprint, scenario_key)
);

CREATE TABLE public.orbit_agent_training_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.orbit_empresas(id) ON DELETE CASCADE,
  version_number integer NOT NULL CHECK (version_number > 0),
  content text NOT NULL CHECK (char_length(content) <= 12000),
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{32}$'),
  changelog text NOT NULL CHECK (char_length(btrim(changelog)) BETWEEN 1 AND 1000),
  is_active boolean NOT NULL DEFAULT false,
  published_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id, version_number)
);

CREATE UNIQUE INDEX orbit_agent_training_versions_one_active_idx
  ON public.orbit_agent_training_versions(empresa_id)
  WHERE is_active;
CREATE INDEX orbit_agent_training_reviews_current_idx
  ON public.orbit_agent_training_reviews(empresa_id, draft_fingerprint, scenario_key);

ALTER TABLE public.orbit_agent_training_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orbit_agent_training_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orbit_agent_training_versions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.orbit_agent_training_drafts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.orbit_agent_training_reviews FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.orbit_agent_training_versions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.orbit_agent_training_drafts TO service_role;
GRANT ALL ON TABLE public.orbit_agent_training_reviews TO service_role;
GRANT ALL ON TABLE public.orbit_agent_training_versions TO service_role;

CREATE OR REPLACE FUNCTION public.orbit_agent_training_version_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $function$
BEGIN
  IF to_jsonb(NEW) - 'is_active' IS DISTINCT FROM to_jsonb(OLD) - 'is_active' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'IMMUTABLE_TRAINING_VERSION';
  END IF;
  RETURN NEW;
END
$function$;

CREATE TRIGGER orbit_agent_training_versions_immutable
BEFORE UPDATE ON public.orbit_agent_training_versions
FOR EACH ROW EXECUTE FUNCTION public.orbit_agent_training_version_immutable();

REVOKE ALL ON FUNCTION public.orbit_agent_training_version_immutable()
  FROM PUBLIC, anon, authenticated;

INSERT INTO public.orbit_agent_training_drafts(
  empresa_id, content, revision, fingerprint
)
SELECT f.empresa_id,
       coalesce(a.conversion_guidance, ''),
       1,
       md5(coalesce(a.conversion_guidance, ''))
FROM public.orbit_feature_flags f
JOIN public.orbit_ai_config a ON a.empresa_id = f.empresa_id
WHERE f.feature_key = 'tenant_agent_training_governance_v1'
ON CONFLICT (empresa_id) DO NOTHING;

INSERT INTO public.orbit_agent_training_versions(
  empresa_id, version_number, content, fingerprint, changelog, is_active
)
SELECT d.empresa_id, 1, d.content, d.fingerprint,
       'Baseline da orientação de conversão', true
FROM public.orbit_agent_training_drafts d
JOIN public.orbit_feature_flags f ON f.empresa_id = d.empresa_id
WHERE f.feature_key = 'tenant_agent_training_governance_v1'
ON CONFLICT (empresa_id, version_number) DO NOTHING;

CREATE OR REPLACE FUNCTION public.orbit_agent_training_is_admin(
  p_user_id uuid,
  p_empresa_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT p_user_id IS NOT NULL
    AND public.user_has_empresa_access(p_empresa_id)
    AND (
      public.has_role(p_user_id, 'super_admin'::public.app_role)
      OR public.pe_is_super_admin(p_user_id)
      OR public.pe_user_is_orbit_admin(p_user_id)
      OR EXISTS (
        SELECT 1 FROM public.user_empresa_memberships m
        WHERE m.user_id = p_user_id
          AND m.empresa_id = p_empresa_id
          AND m.role = 'admin'
      )
    );
$function$;

REVOKE ALL ON FUNCTION public.orbit_agent_training_is_admin(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.orbit_agent_training_read(
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
  v_can_admin boolean := false;
  v_result jsonb;
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
    AND f.feature_key = 'tenant_agent_training_governance_v1';

  v_can_admin := public.orbit_agent_training_is_admin(v_uid, v_empresa_id);
  IF NOT v_enabled THEN
    RETURN jsonb_build_object(
      'ok', true, 'enabled', false, 'can_edit', false, 'can_publish', false,
      'required_scenarios', jsonb_build_array(
        'initial_approach', 'qualification', 'objection_handling',
        'human_handoff', 'safety_boundaries'
      )
    );
  END IF;

  SELECT jsonb_build_object(
    'ok', true,
    'enabled', true,
    'can_edit', v_can_admin,
    'can_publish', v_can_admin,
    'required_scenarios', jsonb_build_array(
      'initial_approach', 'qualification', 'objection_handling',
      'human_handoff', 'safety_boundaries'
    ),
    'draft', jsonb_build_object(
      'content', d.content,
      'revision', d.revision,
      'fingerprint', d.fingerprint,
      'updated_at', d.updated_at
    ),
    'active', jsonb_build_object(
      'version_id', av.id,
      'version_number', av.version_number,
      'content', coalesce(av.content, ''),
      'fingerprint', av.fingerprint,
      'published_at', av.published_at
    ),
    'reviews', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', r.id,
        'scenario_key', r.scenario_key,
        'status', r.status,
        'comment', r.comment,
        'reviewer_id', r.reviewer_id,
        'reviewed_at', r.reviewed_at
      ) ORDER BY r.scenario_key)
      FROM public.orbit_agent_training_reviews r
      WHERE r.empresa_id = v_empresa_id
        AND r.draft_fingerprint = d.fingerprint
    ), '[]'::jsonb),
    'versions', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', v.id,
        'version_number', v.version_number,
        'fingerprint', v.fingerprint,
        'changelog', v.changelog,
        'is_active', v.is_active,
        'published_by', v.published_by,
        'published_at', v.published_at
      ) ORDER BY v.version_number DESC)
      FROM public.orbit_agent_training_versions v
      WHERE v.empresa_id = v_empresa_id
    ), '[]'::jsonb)
  ) INTO v_result
  FROM public.orbit_agent_training_drafts d
  LEFT JOIN public.orbit_agent_training_versions av
    ON av.empresa_id = d.empresa_id AND av.is_active = true
  WHERE d.empresa_id = v_empresa_id;

  RETURN coalesce(v_result, jsonb_build_object(
    'ok', true, 'enabled', true, 'can_edit', v_can_admin, 'can_publish', v_can_admin,
    'draft', jsonb_build_object('content', '', 'revision', 0, 'fingerprint', md5('')),
    'reviews', '[]'::jsonb, 'versions', '[]'::jsonb
  ));
END
$function$;

REVOKE ALL ON FUNCTION public.orbit_agent_training_read(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orbit_agent_training_read(text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.orbit_agent_training_action(
  p_tenant_slug text,
  p_action text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_empresa_id uuid;
  v_content text;
  v_fingerprint text;
  v_expected_fingerprint text;
  v_scenario text;
  v_status text;
  v_comment text;
  v_changelog text;
  v_target_version uuid;
  v_version_number integer;
  v_audit_action text;
  v_entity_id uuid;
  v_details jsonb := '{}'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'UNAUTHENTICATED';
  END IF;

  SELECT e.id INTO v_empresa_id
  FROM public.orbit_empresas e
  JOIN public.orbit_feature_flags f
    ON f.empresa_id = e.id
   AND f.feature_key = 'tenant_agent_training_governance_v1'
   AND f.enabled = true
  WHERE e.slug = btrim(p_tenant_slug) AND coalesce(e.ativo, false) = true;

  IF v_empresa_id IS NULL OR NOT public.user_has_empresa_access(v_empresa_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TRAINING_GOVERNANCE_DISABLED';
  END IF;
  IF NOT public.orbit_agent_training_is_admin(v_uid, v_empresa_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TENANT_ADMIN_REQUIRED';
  END IF;

  CASE p_action
    WHEN 'save_draft' THEN
      v_content := coalesce(p_payload->>'content', '');
      IF char_length(v_content) > 12000 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'TRAINING_CONTENT_TOO_LONG';
      END IF;
      v_fingerprint := md5(v_content);

      INSERT INTO public.orbit_agent_training_drafts(
        empresa_id, content, revision, fingerprint, updated_by, updated_at
      ) VALUES (
        v_empresa_id, v_content, 1, v_fingerprint, v_uid, now()
      )
      ON CONFLICT (empresa_id) DO UPDATE SET
        content = excluded.content,
        revision = CASE
          WHEN public.orbit_agent_training_drafts.fingerprint = excluded.fingerprint
            THEN public.orbit_agent_training_drafts.revision
          ELSE public.orbit_agent_training_drafts.revision + 1
        END,
        fingerprint = excluded.fingerprint,
        updated_by = excluded.updated_by,
        updated_at = now()
      RETURNING empresa_id INTO v_entity_id;

      v_audit_action := 'orbit_agent_training_draft_saved';
      v_details := jsonb_build_object(
        'fingerprint', v_fingerprint,
        'content_length', char_length(v_content),
        'changes_runtime', false
      );

    WHEN 'review' THEN
      v_expected_fingerprint := nullif(p_payload->>'draft_fingerprint', '');
      v_scenario := p_payload->>'scenario_key';
      v_status := p_payload->>'status';
      v_comment := nullif(btrim(coalesce(p_payload->>'comment', '')), '');

      SELECT d.fingerprint INTO v_fingerprint
      FROM public.orbit_agent_training_drafts d
      WHERE d.empresa_id = v_empresa_id;
      IF v_fingerprint IS NULL OR v_expected_fingerprint IS DISTINCT FROM v_fingerprint THEN
        RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'TRAINING_DRAFT_CHANGED';
      END IF;
      IF v_scenario NOT IN (
        'initial_approach', 'qualification', 'objection_handling',
        'human_handoff', 'safety_boundaries'
      ) OR v_status NOT IN ('approved', 'rejected') THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_TRAINING_REVIEW';
      END IF;
      IF v_status = 'rejected' AND v_comment IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'REJECTION_COMMENT_REQUIRED';
      END IF;
      IF char_length(coalesce(v_comment, '')) > 2000 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'COMMENT_TOO_LONG';
      END IF;

      INSERT INTO public.orbit_agent_training_reviews(
        empresa_id, draft_fingerprint, scenario_key, status,
        comment, reviewer_id, reviewed_at, updated_at
      ) VALUES (
        v_empresa_id, v_fingerprint, v_scenario, v_status,
        v_comment, v_uid, now(), now()
      )
      ON CONFLICT (empresa_id, draft_fingerprint, scenario_key) DO UPDATE SET
        status = excluded.status,
        comment = excluded.comment,
        reviewer_id = excluded.reviewer_id,
        reviewed_at = now(),
        updated_at = now()
      RETURNING id INTO v_entity_id;

      v_audit_action := 'orbit_agent_training_reviewed';
      v_details := jsonb_build_object(
        'fingerprint', v_fingerprint,
        'scenario_key', v_scenario,
        'status', v_status,
        'has_comment', v_comment IS NOT NULL
      );

    WHEN 'publish' THEN
      v_expected_fingerprint := nullif(p_payload->>'draft_fingerprint', '');
      v_changelog := nullif(btrim(coalesce(p_payload->>'changelog', '')), '');
      IF v_changelog IS NULL OR char_length(v_changelog) > 1000 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'CHANGELOG_REQUIRED';
      END IF;

      SELECT d.content, d.fingerprint INTO v_content, v_fingerprint
      FROM public.orbit_agent_training_drafts d
      WHERE d.empresa_id = v_empresa_id
      FOR UPDATE;
      IF v_fingerprint IS NULL OR v_expected_fingerprint IS DISTINCT FROM v_fingerprint THEN
        RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'TRAINING_DRAFT_CHANGED';
      END IF;
      IF NOT EXISTS (
        SELECT 1
        FROM public.orbit_agent_training_reviews
        WHERE empresa_id = v_empresa_id
          AND draft_fingerprint = v_fingerprint
          AND status = 'approved'
        HAVING count(DISTINCT scenario_key) = 5
      ) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'TRAINING_APPROVALS_INCOMPLETE';
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.orbit_agent_training_versions v
        WHERE v.empresa_id = v_empresa_id
          AND v.is_active = true
          AND v.fingerprint = v_fingerprint
      ) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'TRAINING_ALREADY_PUBLISHED';
      END IF;

      v_version_number := coalesce((
        SELECT max(v.version_number) + 1
        FROM public.orbit_agent_training_versions v
        WHERE v.empresa_id = v_empresa_id
      ), 1);
      UPDATE public.orbit_agent_training_versions
      SET is_active = false
      WHERE empresa_id = v_empresa_id AND is_active = true;
      INSERT INTO public.orbit_agent_training_versions(
        empresa_id, version_number, content, fingerprint,
        changelog, is_active, published_by, published_at
      ) VALUES (
        v_empresa_id, v_version_number, v_content, v_fingerprint,
        v_changelog, true, v_uid, now()
      ) RETURNING id INTO v_entity_id;

      UPDATE public.orbit_ai_config
      SET conversion_guidance = v_content, updated_at = now()
      WHERE empresa_id = v_empresa_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'AI_CONFIG_NOT_FOUND';
      END IF;

      v_audit_action := 'orbit_agent_training_published';
      v_details := jsonb_build_object(
        'version_number', v_version_number,
        'fingerprint', v_fingerprint,
        'changelog', v_changelog
      );

    WHEN 'rollback' THEN
      v_target_version := nullif(p_payload->>'version_id', '')::uuid;
      SELECT v.content, v.fingerprint, v.version_number
      INTO v_content, v_fingerprint, v_version_number
      FROM public.orbit_agent_training_versions v
      WHERE v.id = v_target_version AND v.empresa_id = v_empresa_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'TRAINING_VERSION_NOT_FOUND';
      END IF;

      UPDATE public.orbit_agent_training_versions
      SET is_active = false
      WHERE empresa_id = v_empresa_id AND is_active = true;
      UPDATE public.orbit_agent_training_versions
      SET is_active = true
      WHERE id = v_target_version AND empresa_id = v_empresa_id;
      UPDATE public.orbit_ai_config
      SET conversion_guidance = v_content, updated_at = now()
      WHERE empresa_id = v_empresa_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'AI_CONFIG_NOT_FOUND';
      END IF;
      UPDATE public.orbit_agent_training_drafts
      SET content = v_content,
          fingerprint = v_fingerprint,
          revision = revision + 1,
          updated_by = v_uid,
          updated_at = now()
      WHERE empresa_id = v_empresa_id;

      v_entity_id := v_target_version;
      v_audit_action := 'orbit_agent_training_rolled_back';
      v_details := jsonb_build_object(
        'version_number', v_version_number,
        'fingerprint', v_fingerprint
      );

    ELSE
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_TRAINING_ACTION';
  END CASE;

  INSERT INTO public.orbit_audit_log(
    empresa_id, user_id, acao, entidade, entidade_id, detalhes
  ) VALUES (
    v_empresa_id, v_uid, v_audit_action,
    CASE WHEN p_action = 'review'
      THEN 'orbit_agent_training_reviews'
      WHEN p_action IN ('publish', 'rollback')
      THEN 'orbit_agent_training_versions'
      ELSE 'orbit_agent_training_drafts'
    END,
    v_entity_id,
    v_details || jsonb_build_object('tenant_slug', p_tenant_slug, 'source', 'agent_training_governance_v1')
  );

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'ok', true,
    'action', p_action,
    'entity_id', v_entity_id,
    'fingerprint', v_fingerprint,
    'version_number', v_version_number,
    'changes_runtime', p_action IN ('publish', 'rollback')
  ));
END
$function$;

REVOKE ALL ON FUNCTION public.orbit_agent_training_action(text, text, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orbit_agent_training_action(text, text, jsonb)
  TO authenticated, service_role;

COMMIT;
