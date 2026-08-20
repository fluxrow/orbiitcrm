-- Wave 3.1: explicit tenant context for global search.
-- Canary-only, additive, and instantly reversible through the feature flag.

BEGIN;

INSERT INTO public.orbit_feature_flags (
  empresa_id, feature_key, enabled, enabled_at, rollout_metadata
)
SELECT
  e.id,
  'tenant_explicit_search_wave3_v1',
  e.slug = 'fluxrow',
  CASE WHEN e.slug = 'fluxrow' THEN now() ELSE NULL END,
  jsonb_build_object('canary', e.slug = 'fluxrow', 'wave', '3.1', 'mode', 'active')
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
   AND f.feature_key = 'tenant_explicit_search_wave3_v1'
  WHERE e.id IS NULL OR f.enabled IS DISTINCT FROM expected.enabled;

  IF v_invalid IS NOT NULL THEN
    RAISE EXCEPTION 'TENANT_EXPLICIT_SEARCH_WAVE3_ROLLOUT_MISMATCH: %', v_invalid;
  END IF;
END
$rollout_guard$;

CREATE OR REPLACE FUNCTION public.orbit_global_search_scoped(
  p_tenant_slug text,
  p_term text,
  p_limit integer DEFAULT 20
)
RETURNS TABLE(
  kind text,
  id uuid,
  title text,
  subtitle text,
  detail text,
  prospect_id uuid,
  conversa_id uuid,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_empresa_id uuid;
BEGIN
  v_empresa_id := public.orbit_tenant_context_authorize(
    p_tenant_slug,
    'tenant_explicit_search_wave3_v1'
  );

  RETURN QUERY
  SELECT search_result.kind,
         search_result.id,
         search_result.title,
         search_result.subtitle,
         search_result.detail,
         search_result.prospect_id,
         search_result.conversa_id,
         search_result.updated_at
  FROM public.orbit_global_search(
    v_empresa_id,
    p_term,
    least(greatest(coalesce(p_limit, 20), 1), 200)
  ) AS search_result;
END
$function$;

REVOKE ALL ON FUNCTION public.orbit_global_search_scoped(text, text, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orbit_global_search_scoped(text, text, integer)
  TO authenticated;

COMMIT;
