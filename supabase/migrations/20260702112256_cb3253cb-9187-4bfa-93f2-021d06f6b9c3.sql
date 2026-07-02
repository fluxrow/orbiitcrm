
-- Tighten RLS: add member/admin role checks and explicit policy on oauth states

-- orbit_audio_library: require orbit membership in addition to empresa match
DROP POLICY IF EXISTS "empresa vê seus próprios áudios" ON public.orbit_audio_library;
CREATE POLICY "empresa members manage own audio library"
ON public.orbit_audio_library
FOR ALL
TO authenticated
USING (
  empresa_id = (SELECT p.empresa_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1)
  AND public.pe_user_is_orbit_member(auth.uid())
)
WITH CHECK (
  empresa_id = (SELECT p.empresa_id FROM public.profiles p WHERE p.id = auth.uid() LIMIT 1)
  AND public.pe_user_is_orbit_member(auth.uid())
);

-- orbit_chatbot_flows: require orbit membership
DROP POLICY IF EXISTS "empresa manages chatbot flows" ON public.orbit_chatbot_flows;
CREATE POLICY "empresa members manage chatbot flows"
ON public.orbit_chatbot_flows
FOR ALL
TO authenticated
USING (
  empresa_id = public.get_user_empresa_id(auth.uid())
  AND public.pe_user_is_orbit_member(auth.uid())
)
WITH CHECK (
  empresa_id = public.get_user_empresa_id(auth.uid())
  AND public.pe_user_is_orbit_member(auth.uid())
);

-- orbit_chatbot_flow_branches: require orbit membership
DROP POLICY IF EXISTS "empresa manages chatbot branches" ON public.orbit_chatbot_flow_branches;
CREATE POLICY "empresa members manage chatbot branches"
ON public.orbit_chatbot_flow_branches
FOR ALL
TO authenticated
USING (
  flow_id IN (
    SELECT f.id FROM public.orbit_chatbot_flows f
    WHERE f.empresa_id = public.get_user_empresa_id(auth.uid())
  )
  AND public.pe_user_is_orbit_member(auth.uid())
)
WITH CHECK (
  flow_id IN (
    SELECT f.id FROM public.orbit_chatbot_flows f
    WHERE f.empresa_id = public.get_user_empresa_id(auth.uid())
  )
  AND public.pe_user_is_orbit_member(auth.uid())
);

-- orbit_meta_config: standardize on tenant-scoped orbit_admin check
DROP POLICY IF EXISTS "Admins can manage own empresa meta config" ON public.orbit_meta_config;
DROP POLICY IF EXISTS "Admins view own empresa meta config" ON public.orbit_meta_config;
CREATE POLICY "Orbit admins view own empresa meta config"
ON public.orbit_meta_config
FOR SELECT
TO authenticated
USING (
  empresa_id = public.get_user_empresa_id(auth.uid())
  AND public.pe_user_is_orbit_admin(auth.uid())
);
CREATE POLICY "Orbit admins manage own empresa meta config"
ON public.orbit_meta_config
FOR ALL
TO authenticated
USING (
  empresa_id = public.get_user_empresa_id(auth.uid())
  AND public.pe_user_is_orbit_admin(auth.uid())
)
WITH CHECK (
  empresa_id = public.get_user_empresa_id(auth.uid())
  AND public.pe_user_is_orbit_admin(auth.uid())
);

-- orbit_google_oauth_states: explicit lockdown policy (service_role bypasses RLS)
CREATE POLICY "Super admins manage google oauth states"
ON public.orbit_google_oauth_states
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));
