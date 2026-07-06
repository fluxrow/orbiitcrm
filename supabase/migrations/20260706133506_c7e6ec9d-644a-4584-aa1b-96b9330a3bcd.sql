
-- Tenant-scope admin checks for orbit_ai_config, orbit_resend_config, orbit_integrations_config.
-- Replace legacy has_role(auth.uid(),'admin') with pe_user_is_orbit_admin(auth.uid()),
-- which validates admin role within the caller's active empresa, and keep empresa_id match.

-- orbit_ai_config
DROP POLICY IF EXISTS "Admins can manage own empresa ai_config" ON public.orbit_ai_config;
DROP POLICY IF EXISTS "Admins can view own empresa ai_config" ON public.orbit_ai_config;

CREATE POLICY "Orbit admins manage own empresa ai_config"
ON public.orbit_ai_config
FOR ALL
TO authenticated
USING (empresa_id = get_user_empresa_id(auth.uid()) AND pe_user_is_orbit_admin(auth.uid()))
WITH CHECK (empresa_id = get_user_empresa_id(auth.uid()) AND pe_user_is_orbit_admin(auth.uid()));

CREATE POLICY "Orbit admins view own empresa ai_config"
ON public.orbit_ai_config
FOR SELECT
TO authenticated
USING (
  (empresa_id = get_user_empresa_id(auth.uid()) AND pe_user_is_orbit_admin(auth.uid()))
  OR pe_is_super_admin(auth.uid())
);

-- orbit_integrations_config
DROP POLICY IF EXISTS "Admins can manage own empresa integrations" ON public.orbit_integrations_config;
DROP POLICY IF EXISTS "Admins can view own empresa integrations" ON public.orbit_integrations_config;

CREATE POLICY "Orbit admins manage own empresa integrations"
ON public.orbit_integrations_config
FOR ALL
TO authenticated
USING (empresa_id = get_user_empresa_id(auth.uid()) AND pe_user_is_orbit_admin(auth.uid()))
WITH CHECK (empresa_id = get_user_empresa_id(auth.uid()) AND pe_user_is_orbit_admin(auth.uid()));

CREATE POLICY "Orbit admins view own empresa integrations"
ON public.orbit_integrations_config
FOR SELECT
TO authenticated
USING (
  (empresa_id = get_user_empresa_id(auth.uid()) AND pe_user_is_orbit_admin(auth.uid()))
  OR pe_is_super_admin(auth.uid())
);

-- orbit_resend_config
DROP POLICY IF EXISTS "Admins can manage own empresa resend_config" ON public.orbit_resend_config;
DROP POLICY IF EXISTS "Admins view own empresa resend_config" ON public.orbit_resend_config;

CREATE POLICY "Orbit admins manage own empresa resend_config"
ON public.orbit_resend_config
FOR ALL
TO authenticated
USING (empresa_id = get_user_empresa_id(auth.uid()) AND pe_user_is_orbit_admin(auth.uid()))
WITH CHECK (empresa_id = get_user_empresa_id(auth.uid()) AND pe_user_is_orbit_admin(auth.uid()));

CREATE POLICY "Orbit admins view own empresa resend_config"
ON public.orbit_resend_config
FOR SELECT
TO authenticated
USING (empresa_id = get_user_empresa_id(auth.uid()) AND pe_user_is_orbit_admin(auth.uid()));
