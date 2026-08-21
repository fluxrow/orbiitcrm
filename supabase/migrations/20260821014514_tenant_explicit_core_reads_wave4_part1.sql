-- Wave 4.1: additive explicit-context read policies for core CRM surfaces.
BEGIN;

INSERT INTO public.orbit_feature_flags(
  empresa_id, feature_key, enabled, enabled_at, rollout_metadata
)
SELECT
  e.id,
  'tenant_explicit_core_reads_wave4_v1',
  e.slug = 'fluxrow',
  CASE WHEN e.slug = 'fluxrow' THEN now() ELSE NULL END,
  jsonb_build_object('canary', e.slug = 'fluxrow', 'wave', '4.1')
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
      ('fluxrow', true),
      ('bullink-negocios', false),
      ('fabrica-de-pesquisadores', false),
      ('viver-semijoias', false)
  ) AS expected(slug, enabled)
  LEFT JOIN public.orbit_empresas e ON e.slug = expected.slug
  LEFT JOIN public.orbit_feature_flags f
    ON f.empresa_id = e.id
   AND f.feature_key = 'tenant_explicit_core_reads_wave4_v1'
  WHERE e.id IS NULL OR f.enabled IS DISTINCT FROM expected.enabled;

  IF v_invalid IS NOT NULL THEN
    RAISE EXCEPTION 'TENANT_CORE_READS_ROLLOUT_MISMATCH: %', v_invalid;
  END IF;
END
$rollout_guard$;

CREATE OR REPLACE FUNCTION public.orbit_tenant_explicit_core_read_allowed(
  p_empresa_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT
    (SELECT auth.uid()) IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.orbit_feature_flags f
      WHERE f.empresa_id = p_empresa_id
        AND f.feature_key = 'tenant_explicit_core_reads_wave4_v1'
        AND f.enabled = true
    )
    AND public.user_has_empresa_access(p_empresa_id);
$function$;

REVOKE ALL ON FUNCTION public.orbit_tenant_explicit_core_read_allowed(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orbit_tenant_explicit_core_read_allowed(uuid)
  TO authenticated;

ALTER TABLE public.orbit_conversas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orbit_mensagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orbit_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orbit_pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orbit_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orbit_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orbit_prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_explicit_core_read_wave4 ON public.orbit_conversas;
DROP POLICY IF EXISTS tenant_explicit_core_read_wave4 ON public.orbit_mensagens;
DROP POLICY IF EXISTS tenant_explicit_core_read_wave4 ON public.orbit_deals;
DROP POLICY IF EXISTS tenant_explicit_core_read_wave4 ON public.orbit_pipeline_stages;
DROP POLICY IF EXISTS tenant_explicit_core_read_wave4 ON public.orbit_tasks;
DROP POLICY IF EXISTS tenant_explicit_core_read_wave4 ON public.orbit_activities;
DROP POLICY IF EXISTS tenant_explicit_core_read_wave4 ON public.orbit_prospects;
DROP POLICY IF EXISTS tenant_explicit_core_read_wave4 ON public.profiles;

CREATE POLICY tenant_explicit_core_read_wave4
ON public.orbit_conversas FOR SELECT TO authenticated
USING (public.orbit_tenant_explicit_core_read_allowed(empresa_id));

CREATE POLICY tenant_explicit_core_read_wave4
ON public.orbit_mensagens FOR SELECT TO authenticated
USING (public.orbit_tenant_explicit_core_read_allowed(empresa_id));

CREATE POLICY tenant_explicit_core_read_wave4
ON public.orbit_deals FOR SELECT TO authenticated
USING (public.orbit_tenant_explicit_core_read_allowed(empresa_id));

CREATE POLICY tenant_explicit_core_read_wave4
ON public.orbit_pipeline_stages FOR SELECT TO authenticated
USING (public.orbit_tenant_explicit_core_read_allowed(empresa_id));

CREATE POLICY tenant_explicit_core_read_wave4
ON public.orbit_tasks FOR SELECT TO authenticated
USING (public.orbit_tenant_explicit_core_read_allowed(empresa_id));

CREATE POLICY tenant_explicit_core_read_wave4
ON public.orbit_activities FOR SELECT TO authenticated
USING (public.orbit_tenant_explicit_core_read_allowed(empresa_id));

CREATE POLICY tenant_explicit_core_read_wave4
ON public.orbit_prospects FOR SELECT TO authenticated
USING (public.orbit_tenant_explicit_core_read_allowed(empresa_id));

CREATE POLICY tenant_explicit_core_read_wave4
ON public.profiles FOR SELECT TO authenticated
USING (
  empresa_id IS NOT NULL
  AND public.orbit_tenant_explicit_core_read_allowed(empresa_id)
);

COMMIT;
