DROP POLICY IF EXISTS "Super admin manage all templates" ON public.orbit_message_templates;

CREATE POLICY "Super admin manage all templates"
ON public.orbit_message_templates
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));