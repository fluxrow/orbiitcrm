-- Wave 3.4: explicit tenant context for Google Calendar Edge Functions.
BEGIN;

INSERT INTO public.orbit_feature_flags (
  empresa_id,feature_key,enabled,enabled_at,rollout_metadata
)
SELECT e.id,'tenant_google_context_wave3_v1',e.slug='fluxrow',
       CASE WHEN e.slug='fluxrow' THEN now() ELSE NULL END,
       jsonb_build_object('canary',e.slug='fluxrow','wave','3.4')
FROM public.orbit_empresas e
WHERE e.slug IN ('fluxrow','bullink-negocios','fabrica-de-pesquisadores','viver-semijoias')
ON CONFLICT (empresa_id,feature_key) DO NOTHING;

DO $rollout_guard$
DECLARE v_invalid text[];
BEGIN
  SELECT array_agg(x.slug ORDER BY x.slug) INTO v_invalid
  FROM (VALUES ('fluxrow',true),('bullink-negocios',false),
               ('fabrica-de-pesquisadores',false),('viver-semijoias',false)) x(slug,enabled)
  LEFT JOIN public.orbit_empresas e ON e.slug=x.slug
  LEFT JOIN public.orbit_feature_flags f ON f.empresa_id=e.id
    AND f.feature_key='tenant_google_context_wave3_v1'
  WHERE e.id IS NULL OR f.enabled IS DISTINCT FROM x.enabled;
  IF v_invalid IS NOT NULL THEN
    RAISE EXCEPTION 'TENANT_GOOGLE_CONTEXT_ROLLOUT_MISMATCH: %',v_invalid;
  END IF;
END $rollout_guard$;

COMMIT;
