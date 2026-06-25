
-- 1) orbit_ai_config: restrict SELECT to admins
DROP POLICY IF EXISTS "Users can view own empresa ai_config" ON public.orbit_ai_config;
CREATE POLICY "Admins can view own empresa ai_config"
ON public.orbit_ai_config
FOR SELECT
TO authenticated
USING (
  (empresa_id = get_user_empresa_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role))
  OR has_role(auth.uid(), 'super_admin'::app_role)
);

-- 2) orbit_integrations_config: restrict SELECT to admins
DROP POLICY IF EXISTS "Users can view own empresa integrations" ON public.orbit_integrations_config;
CREATE POLICY "Admins can view own empresa integrations"
ON public.orbit_integrations_config
FOR SELECT
TO authenticated
USING (
  (empresa_id = get_user_empresa_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role))
  OR has_role(auth.uid(), 'super_admin'::app_role)
);

-- 3) saas_empresa: restrict SELECT to admins (drop the wide tenant-member SELECT)
DROP POLICY IF EXISTS "Users can view own saas_empresa" ON public.saas_empresa;
CREATE POLICY "Admins can view own saas_empresa"
ON public.saas_empresa
FOR SELECT
TO authenticated
USING (
  (empresa_id = get_user_empresa_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role))
  OR has_role(auth.uid(), 'super_admin'::app_role)
);

-- 4) pe_invitations: revoke column-level SELECT on token from authenticated/anon.
--    Edge functions use service_role and continue to read it. Frontend must select
--    explicit columns (excluding token).
REVOKE SELECT (token) ON public.pe_invitations FROM authenticated;
REVOKE SELECT (token) ON public.pe_invitations FROM anon;

-- Reload PostgREST schema cache so column grants take effect immediately
NOTIFY pgrst, 'reload schema';
