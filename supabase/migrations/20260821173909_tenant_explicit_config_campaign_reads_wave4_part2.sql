-- Wave 4.2: explicit-context reads for configuration and campaign surfaces.
BEGIN;

INSERT INTO public.orbit_feature_flags(
  empresa_id, feature_key, enabled, enabled_at, rollout_metadata
)
SELECT e.id, 'tenant_explicit_config_campaign_reads_wave4_v1',
       e.slug = 'fluxrow',
       CASE WHEN e.slug = 'fluxrow' THEN now() ELSE NULL END,
       jsonb_build_object('canary', e.slug = 'fluxrow', 'wave', '4.2')
FROM public.orbit_empresas e
WHERE e.slug IN (
  'fluxrow', 'bullink-negocios',
  'fabrica-de-pesquisadores', 'viver-semijoias'
)
ON CONFLICT (empresa_id, feature_key) DO NOTHING;

DO $rollout_guard$
DECLARE v_invalid text[];
BEGIN
  SELECT array_agg(expected.slug ORDER BY expected.slug) INTO v_invalid
  FROM (
    VALUES ('fluxrow', true), ('bullink-negocios', false),
           ('fabrica-de-pesquisadores', false), ('viver-semijoias', false)
  ) expected(slug, enabled)
  LEFT JOIN public.orbit_empresas e ON e.slug = expected.slug
  LEFT JOIN public.orbit_feature_flags f
    ON f.empresa_id = e.id
   AND f.feature_key = 'tenant_explicit_config_campaign_reads_wave4_v1'
  WHERE e.id IS NULL OR f.enabled IS DISTINCT FROM expected.enabled;
  IF v_invalid IS NOT NULL THEN
    RAISE EXCEPTION 'TENANT_CONFIG_CAMPAIGN_READS_ROLLOUT_MISMATCH: %', v_invalid;
  END IF;
END
$rollout_guard$;

CREATE OR REPLACE FUNCTION public.orbit_tenant_explicit_config_campaign_read_allowed(
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
      SELECT 1 FROM public.orbit_feature_flags f
      WHERE f.empresa_id = p_empresa_id
        AND f.feature_key = 'tenant_explicit_config_campaign_reads_wave4_v1'
        AND f.enabled = true
    )
    AND public.user_has_empresa_access(p_empresa_id);
$function$;

REVOKE ALL ON FUNCTION public.orbit_tenant_explicit_config_campaign_read_allowed(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orbit_tenant_explicit_config_campaign_read_allowed(uuid)
  TO authenticated;

ALTER TABLE public.orbit_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orbit_campaign_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orbit_campaign_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orbit_message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orbit_ai_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orbit_resend_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orbit_distribuicao_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orbit_whatsapp_sending_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_explicit_config_campaign_read_wave4 ON public.orbit_campaigns;
DROP POLICY IF EXISTS tenant_explicit_config_campaign_read_wave4 ON public.orbit_campaign_recipients;
DROP POLICY IF EXISTS tenant_explicit_config_campaign_read_wave4 ON public.orbit_campaign_approvals;
DROP POLICY IF EXISTS tenant_explicit_config_campaign_read_wave4 ON public.orbit_message_templates;
DROP POLICY IF EXISTS tenant_explicit_config_campaign_read_wave4 ON public.orbit_ai_config;
DROP POLICY IF EXISTS tenant_explicit_config_campaign_read_wave4 ON public.orbit_resend_config;
DROP POLICY IF EXISTS tenant_explicit_config_campaign_read_wave4 ON public.orbit_distribuicao_config;
DROP POLICY IF EXISTS tenant_explicit_config_campaign_read_wave4 ON public.orbit_whatsapp_sending_config;

CREATE POLICY tenant_explicit_config_campaign_read_wave4
ON public.orbit_campaigns FOR SELECT TO authenticated
USING (public.orbit_tenant_explicit_config_campaign_read_allowed(empresa_id));
CREATE POLICY tenant_explicit_config_campaign_read_wave4
ON public.orbit_campaign_recipients FOR SELECT TO authenticated
USING (public.orbit_tenant_explicit_config_campaign_read_allowed(empresa_id));
CREATE POLICY tenant_explicit_config_campaign_read_wave4
ON public.orbit_campaign_approvals FOR SELECT TO authenticated
USING (public.orbit_tenant_explicit_config_campaign_read_allowed(empresa_id));
CREATE POLICY tenant_explicit_config_campaign_read_wave4
ON public.orbit_message_templates FOR SELECT TO authenticated
USING (public.orbit_tenant_explicit_config_campaign_read_allowed(empresa_id));
CREATE POLICY tenant_explicit_config_campaign_read_wave4
ON public.orbit_ai_config FOR SELECT TO authenticated
USING (public.orbit_tenant_explicit_config_campaign_read_allowed(empresa_id));
CREATE POLICY tenant_explicit_config_campaign_read_wave4
ON public.orbit_resend_config FOR SELECT TO authenticated
USING (public.orbit_tenant_explicit_config_campaign_read_allowed(empresa_id));
CREATE POLICY tenant_explicit_config_campaign_read_wave4
ON public.orbit_distribuicao_config FOR SELECT TO authenticated
USING (public.orbit_tenant_explicit_config_campaign_read_allowed(empresa_id));
CREATE POLICY tenant_explicit_config_campaign_read_wave4
ON public.orbit_whatsapp_sending_config FOR SELECT TO authenticated
USING (public.orbit_tenant_explicit_config_campaign_read_allowed(empresa_id));

COMMIT;
