-- Wave 1: explicit per-request tenant reads in shadow mode.
-- Additive and read-only. Legacy reads remain the rendered source.

BEGIN;

INSERT INTO public.orbit_feature_flags (
  empresa_id, feature_key, enabled, enabled_at, rollout_metadata
)
SELECT
  e.id,
  'tenant_explicit_reads_wave1_v1',
  e.slug = 'fluxrow',
  CASE WHEN e.slug = 'fluxrow' THEN now() ELSE NULL END,
  jsonb_build_object('canary', e.slug = 'fluxrow', 'mode', 'shadow')
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
   AND f.feature_key = 'tenant_explicit_reads_wave1_v1'
  WHERE e.id IS NULL OR f.enabled IS DISTINCT FROM expected.enabled;

  IF v_invalid IS NOT NULL THEN
    RAISE EXCEPTION 'TENANT_EXPLICIT_READS_WAVE1_ROLLOUT_MISMATCH: %', v_invalid;
  END IF;
END
$rollout_guard$;

CREATE OR REPLACE FUNCTION public.orbit_tenant_context_authorize(
  p_tenant_slug text,
  p_required_flag text
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_empresa_id uuid;
  v_authorized boolean;
  v_flag_enabled boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'UNAUTHENTICATED';
  END IF;
  IF nullif(btrim(p_tenant_slug), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'TENANT_CONTEXT_MISSING';
  END IF;

  SELECT e.id INTO v_empresa_id
  FROM public.orbit_empresas e
  WHERE e.slug = btrim(p_tenant_slug) AND coalesce(e.ativo, false) = true;

  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'TENANT_NOT_FOUND';
  END IF;

  SELECT
    public.has_role(v_uid, 'super_admin'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = v_uid AND p.empresa_id = v_empresa_id AND p.ativo = true
    )
    OR EXISTS (
      SELECT 1 FROM public.user_empresa_memberships m
      WHERE m.user_id = v_uid AND m.empresa_id = v_empresa_id
    )
  INTO v_authorized;

  IF NOT coalesce(v_authorized, false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TENANT_ACCESS_DENIED';
  END IF;

  SELECT f.enabled INTO v_flag_enabled
  FROM public.orbit_feature_flags f
  WHERE f.empresa_id = v_empresa_id AND f.feature_key = p_required_flag;

  IF NOT coalesce(v_flag_enabled, false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TENANT_FEATURE_DISABLED';
  END IF;

  RETURN v_empresa_id;
END
$function$;

REVOKE ALL ON FUNCTION public.orbit_tenant_context_authorize(text, text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.orbit_tenant_prospect_read_scoped(
  p_tenant_slug text,
  p_prospect_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_empresa_id uuid;
  v_prospect jsonb;
BEGIN
  v_empresa_id := public.orbit_tenant_context_authorize(
    p_tenant_slug, 'tenant_explicit_reads_wave1_v1'
  );

  SELECT to_jsonb(p) || jsonb_build_object(
    'responsavel', CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', r.id, 'nome', r.nome, 'email', r.email
    ) END
  )
  INTO v_prospect
  FROM public.orbit_prospects p
  LEFT JOIN public.profiles r ON r.id = p.responsavel_id
  WHERE p.id = p_prospect_id
    AND p.empresa_id = v_empresa_id
    AND p.deleted_at IS NULL;

  RETURN jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'tenant_id', v_empresa_id,
      'tenant_slug', btrim(p_tenant_slug),
      'prospect', v_prospect
    )
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.orbit_tenant_funnel_read_scoped(
  p_tenant_slug text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_empresa_id uuid;
  v_stages jsonb;
BEGIN
  v_empresa_id := public.orbit_tenant_context_authorize(
    p_tenant_slug, 'tenant_explicit_reads_wave1_v1'
  );

  SELECT coalesce(jsonb_agg(
    to_jsonb(s) || jsonb_build_object(
      'deals', coalesce((
        SELECT jsonb_agg(
          to_jsonb(d) || jsonb_build_object(
            'prospect', CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object(
              'id', p.id,
              'nome_razao', p.nome_razao,
              'nome_fantasia', p.nome_fantasia,
              'telefone', p.telefone,
              'whatsapp', p.whatsapp,
              'email_principal', p.email_principal,
              'status_qualificacao', p.status_qualificacao
            ) END,
            'responsavel', CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object(
              'id', r.id, 'nome', r.nome
            ) END
          ) ORDER BY d.created_at DESC
        )
        FROM public.orbit_deals d
        LEFT JOIN public.orbit_prospects p
          ON p.id = d.prospect_id AND p.empresa_id = v_empresa_id
        LEFT JOIN public.profiles r ON r.id = d.responsavel_id
        WHERE d.empresa_id = v_empresa_id
          AND d.etapa_id = s.id
          AND d.deleted_at IS NULL
      ), '[]'::jsonb)
    ) ORDER BY s.ordem
  ), '[]'::jsonb)
  INTO v_stages
  FROM public.orbit_pipeline_stages s
  WHERE s.empresa_id = v_empresa_id AND s.is_archived = false;

  RETURN jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'tenant_id', v_empresa_id,
      'tenant_slug', btrim(p_tenant_slug),
      'stages', v_stages
    )
  );
END
$function$;

REVOKE ALL ON FUNCTION public.orbit_tenant_prospect_read_scoped(text, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.orbit_tenant_funnel_read_scoped(text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orbit_tenant_prospect_read_scoped(text, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.orbit_tenant_funnel_read_scoped(text)
  TO authenticated;

COMMIT;
