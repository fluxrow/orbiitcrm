
DROP POLICY "Admins can manage own empresa zapi_config" ON orbit_zapi_config;

CREATE POLICY "Orbit admins can manage own empresa zapi_config"
  ON orbit_zapi_config FOR ALL TO authenticated
  USING (pe_user_is_orbit_admin(auth.uid()) AND empresa_id = get_user_empresa_id(auth.uid()))
  WITH CHECK (pe_user_is_orbit_admin(auth.uid()) AND empresa_id = get_user_empresa_id(auth.uid()));
