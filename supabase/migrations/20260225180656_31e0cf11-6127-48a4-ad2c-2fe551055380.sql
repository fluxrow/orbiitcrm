
-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Admins can manage own empresa templates" ON public.orbit_message_templates;
DROP POLICY IF EXISTS "Super admin can manage all templates" ON public.orbit_message_templates;
DROP POLICY IF EXISTS "Users can view own empresa templates" ON public.orbit_message_templates;

-- Recreate as PERMISSIVE (any one passing is enough)
CREATE POLICY "Super admin can manage all templates"
ON public.orbit_message_templates
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Admins can manage own empresa templates"
ON public.orbit_message_templates
FOR ALL
TO authenticated
USING ((empresa_id = get_user_empresa_id(auth.uid())) AND (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'vendedor'::app_role)));

CREATE POLICY "Users can view own empresa templates"
ON public.orbit_message_templates
FOR SELECT
TO authenticated
USING (empresa_id = get_user_empresa_id(auth.uid()));
