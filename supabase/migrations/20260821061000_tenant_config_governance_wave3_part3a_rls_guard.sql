-- Prevent canary users from bypassing the scoped mutation RPC with direct DML.
BEGIN;

ALTER TABLE public.orbit_ai_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orbit_resend_config ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.orbit_tenant_config_direct_dml_allowed(p_empresa_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.orbit_feature_flags f
    WHERE f.empresa_id=p_empresa_id
      AND f.feature_key='tenant_config_governance_wave3_v1'
      AND f.enabled=true
  )
$function$;
REVOKE ALL ON FUNCTION public.orbit_tenant_config_direct_dml_allowed(uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.orbit_tenant_config_direct_dml_allowed(uuid)
  TO authenticated;

DROP POLICY IF EXISTS tenant_config_wave3_ai_insert_guard ON public.orbit_ai_config;
CREATE POLICY tenant_config_wave3_ai_insert_guard
ON public.orbit_ai_config AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (public.orbit_tenant_config_direct_dml_allowed(empresa_id));

DROP POLICY IF EXISTS tenant_config_wave3_ai_update_guard ON public.orbit_ai_config;
CREATE POLICY tenant_config_wave3_ai_update_guard
ON public.orbit_ai_config AS RESTRICTIVE FOR UPDATE TO authenticated
USING (public.orbit_tenant_config_direct_dml_allowed(empresa_id))
WITH CHECK (public.orbit_tenant_config_direct_dml_allowed(empresa_id));

DROP POLICY IF EXISTS tenant_config_wave3_ai_delete_guard ON public.orbit_ai_config;
CREATE POLICY tenant_config_wave3_ai_delete_guard
ON public.orbit_ai_config AS RESTRICTIVE FOR DELETE TO authenticated
USING (public.orbit_tenant_config_direct_dml_allowed(empresa_id));

DROP POLICY IF EXISTS tenant_config_wave3_resend_insert_guard ON public.orbit_resend_config;
CREATE POLICY tenant_config_wave3_resend_insert_guard
ON public.orbit_resend_config AS RESTRICTIVE FOR INSERT TO authenticated
WITH CHECK (public.orbit_tenant_config_direct_dml_allowed(empresa_id));

DROP POLICY IF EXISTS tenant_config_wave3_resend_update_guard ON public.orbit_resend_config;
CREATE POLICY tenant_config_wave3_resend_update_guard
ON public.orbit_resend_config AS RESTRICTIVE FOR UPDATE TO authenticated
USING (public.orbit_tenant_config_direct_dml_allowed(empresa_id))
WITH CHECK (public.orbit_tenant_config_direct_dml_allowed(empresa_id));

DROP POLICY IF EXISTS tenant_config_wave3_resend_delete_guard ON public.orbit_resend_config;
CREATE POLICY tenant_config_wave3_resend_delete_guard
ON public.orbit_resend_config AS RESTRICTIVE FOR DELETE TO authenticated
USING (public.orbit_tenant_config_direct_dml_allowed(empresa_id));

COMMIT;
