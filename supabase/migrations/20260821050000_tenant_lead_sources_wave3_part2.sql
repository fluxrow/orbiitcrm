-- Wave 3.2: tenant-scoped lead source governance and least-privilege grants.

BEGIN;

INSERT INTO public.orbit_feature_flags (
  empresa_id, feature_key, enabled, enabled_at, rollout_metadata
)
SELECT
  e.id,
  'tenant_lead_sources_wave3_v1',
  e.slug = 'fluxrow',
  CASE WHEN e.slug = 'fluxrow' THEN now() ELSE NULL END,
  jsonb_build_object('canary', e.slug = 'fluxrow', 'wave', '3.2')
FROM public.orbit_empresas e
WHERE e.slug IN (
  'fluxrow', 'bullink-negocios', 'fabrica-de-pesquisadores', 'viver-semijoias'
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
   AND f.feature_key = 'tenant_lead_sources_wave3_v1'
  WHERE e.id IS NULL OR f.enabled IS DISTINCT FROM expected.enabled;

  IF v_invalid IS NOT NULL THEN
    RAISE EXCEPTION 'TENANT_LEAD_SOURCES_WAVE3_ROLLOUT_MISMATCH: %', v_invalid;
  END IF;
END
$rollout_guard$;

ALTER TABLE public.orbit_lead_sources
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_orbit_lead_sources_active_tenant
  ON public.orbit_lead_sources (empresa_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.orbit_tenant_lead_source_mutate_scoped(
  p_tenant_slug text,
  p_action_type text,
  p_source_id uuid DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_empresa_id uuid;
  v_source public.orbit_lead_sources%ROWTYPE;
  v_is_admin boolean;
  v_tipo text;
  v_nome text;
  v_new_token text;
  v_allowed_keys text[];
BEGIN
  v_empresa_id := public.orbit_tenant_context_authorize(
    p_tenant_slug,
    'tenant_lead_sources_wave3_v1'
  );

  SELECT
    public.has_role(v_uid, 'super_admin'::public.app_role)
    OR public.pe_is_super_admin(v_uid)
    OR EXISTS (
      SELECT 1
      FROM public.user_empresa_memberships m
      WHERE m.user_id = v_uid
        AND m.empresa_id = v_empresa_id
        AND m.role = 'admin'
    )
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = v_uid
        AND p.empresa_id = v_empresa_id
        AND p.ativo = true
        AND public.pe_user_is_orbit_admin(v_uid)
    )
  INTO v_is_admin;

  IF NOT coalesce(v_is_admin, false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TENANT_ADMIN_REQUIRED';
  END IF;

  IF p_action_type NOT IN (
    'create_lead_source', 'update_lead_source',
    'archive_lead_source', 'rotate_lead_source_token'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ACTION_NOT_SUPPORTED';
  END IF;

  IF p_action_type = 'create_lead_source' THEN
    v_allowed_keys := ARRAY['nome', 'tipo', 'field_mapping', 'config', 'ativo'];
  ELSIF p_action_type = 'update_lead_source' THEN
    v_allowed_keys := ARRAY['nome', 'field_mapping', 'config', 'ativo'];
  ELSE
    v_allowed_keys := ARRAY[]::text[];
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(coalesce(p_payload, '{}'::jsonb)) key
    WHERE NOT key = ANY(v_allowed_keys)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'PAYLOAD_FIELD_NOT_ALLOWED';
  END IF;

  IF p_action_type = 'create_lead_source' THEN
    v_nome := btrim(coalesce(p_payload->>'nome', ''));
    v_tipo := coalesce(p_payload->>'tipo', '');
    IF length(v_nome) NOT BETWEEN 1 AND 120 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_SOURCE_NAME';
    END IF;
    IF v_tipo NOT IN ('typebot', 'google_sheets', 'webhook_generico', 'form_publico') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_SOURCE_TYPE';
    END IF;
    IF p_payload ? 'field_mapping' AND jsonb_typeof(p_payload->'field_mapping') <> 'object' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_FIELD_MAPPING';
    END IF;
    IF p_payload ? 'config' AND jsonb_typeof(p_payload->'config') <> 'object' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_SOURCE_CONFIG';
    END IF;

    INSERT INTO public.orbit_lead_sources (
      empresa_id, nome, tipo, field_mapping, config, ativo
    ) VALUES (
      v_empresa_id,
      v_nome,
      v_tipo,
      coalesce(p_payload->'field_mapping', '{}'::jsonb),
      coalesce(p_payload->'config', '{}'::jsonb),
      coalesce((p_payload->>'ativo')::boolean, true)
    )
    RETURNING * INTO v_source;
  ELSE
    IF p_source_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SOURCE_ID_REQUIRED';
    END IF;

    SELECT * INTO v_source
    FROM public.orbit_lead_sources s
    WHERE s.id = p_source_id
      AND s.empresa_id = v_empresa_id
      AND s.deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'LEAD_SOURCE_NOT_FOUND';
    END IF;

    CASE p_action_type
      WHEN 'update_lead_source' THEN
        IF p_payload ? 'nome' THEN
          v_nome := btrim(coalesce(p_payload->>'nome', ''));
          IF length(v_nome) NOT BETWEEN 1 AND 120 THEN
            RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_SOURCE_NAME';
          END IF;
        END IF;
        IF p_payload ? 'field_mapping' AND jsonb_typeof(p_payload->'field_mapping') <> 'object' THEN
          RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_FIELD_MAPPING';
        END IF;
        IF p_payload ? 'config' AND jsonb_typeof(p_payload->'config') <> 'object' THEN
          RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_SOURCE_CONFIG';
        END IF;

        UPDATE public.orbit_lead_sources s
        SET nome = CASE WHEN p_payload ? 'nome' THEN v_nome ELSE s.nome END,
            ativo = CASE WHEN p_payload ? 'ativo' THEN (p_payload->>'ativo')::boolean ELSE s.ativo END,
            field_mapping = CASE WHEN p_payload ? 'field_mapping' THEN p_payload->'field_mapping' ELSE s.field_mapping END,
            config = CASE WHEN p_payload ? 'config' THEN p_payload->'config' ELSE s.config END,
            updated_at = now()
        WHERE s.id = p_source_id AND s.empresa_id = v_empresa_id
        RETURNING * INTO v_source;

      WHEN 'archive_lead_source' THEN
        UPDATE public.orbit_lead_sources s
        SET ativo = false, deleted_at = now(), updated_at = now()
        WHERE s.id = p_source_id AND s.empresa_id = v_empresa_id
        RETURNING * INTO v_source;

      WHEN 'rotate_lead_source_token' THEN
        v_new_token := encode(extensions.gen_random_bytes(24), 'hex');
        UPDATE public.orbit_lead_sources s
        SET secret_token = v_new_token, updated_at = now()
        WHERE s.id = p_source_id AND s.empresa_id = v_empresa_id
        RETURNING * INTO v_source;
    END CASE;
  END IF;

  INSERT INTO public.orbit_audit_log (
    empresa_id, user_id, acao, entidade, entidade_id, detalhes
  ) VALUES (
    v_empresa_id,
    v_uid,
    p_action_type,
    'orbit_lead_sources',
    v_source.id,
    jsonb_build_object(
      'source', 'tenant_lead_sources_wave3_v1',
      'fields_changed', coalesce((SELECT jsonb_agg(key) FROM jsonb_object_keys(coalesce(p_payload, '{}'::jsonb)) key), '[]'::jsonb),
      'token_rotated', p_action_type = 'rotate_lead_source_token'
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'action', p_action_type,
    'data', jsonb_build_object('source', to_jsonb(v_source))
  );
END
$function$;

REVOKE ALL ON FUNCTION public.orbit_tenant_lead_source_mutate_scoped(text, text, uuid, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orbit_tenant_lead_source_mutate_scoped(text, text, uuid, jsonb)
  TO authenticated;

-- These tables have no anonymous policies. Public ingestion uses service_role.
REVOKE ALL ON TABLE
  public.orbit_ai_config,
  public.orbit_distribuicao_config,
  public.orbit_resend_config,
  public.orbit_flows,
  public.orbit_flow_actions,
  public.orbit_flow_runs,
  public.orbit_lead_sources
FROM anon;

-- Browser users need DML only; DDL-like privileges are never required.
REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLE
  public.orbit_ai_config,
  public.orbit_distribuicao_config,
  public.orbit_resend_config,
  public.orbit_flows,
  public.orbit_flow_actions,
  public.orbit_flow_runs,
  public.orbit_lead_sources,
  public.orbit_google_tokens
FROM authenticated;

COMMIT;
