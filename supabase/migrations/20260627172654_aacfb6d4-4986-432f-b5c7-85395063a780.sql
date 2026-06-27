DROP POLICY IF EXISTS "PE members can manage own empresa templates" ON public.orbit_message_templates;
DROP POLICY IF EXISTS "Super admin can manage all templates" ON public.orbit_message_templates;
DROP POLICY IF EXISTS "Users can view own empresa templates" ON public.orbit_message_templates;
DROP POLICY IF EXISTS "Admins can manage own empresa templates" ON public.orbit_message_templates;

CREATE POLICY "Members view own empresa templates"
ON public.orbit_message_templates
FOR SELECT
TO authenticated
USING (
  empresa_id IS NOT NULL
  AND empresa_id = public.get_user_empresa_id(auth.uid())
);

CREATE POLICY "Members manage own empresa templates"
ON public.orbit_message_templates
FOR ALL
TO authenticated
USING (
  empresa_id IS NOT NULL
  AND empresa_id = public.get_user_empresa_id(auth.uid())
  AND public.pe_user_is_orbit_member(auth.uid())
)
WITH CHECK (
  empresa_id IS NOT NULL
  AND empresa_id = public.get_user_empresa_id(auth.uid())
  AND public.pe_user_is_orbit_member(auth.uid())
);

CREATE POLICY "Super admin manage all templates"
ON public.orbit_message_templates
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (true);