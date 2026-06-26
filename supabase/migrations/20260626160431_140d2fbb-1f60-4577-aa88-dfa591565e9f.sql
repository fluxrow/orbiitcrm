
ALTER TABLE public.orbit_flow_templates
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;

GRANT INSERT, UPDATE, DELETE ON public.orbit_flow_templates TO authenticated;

DROP POLICY IF EXISTS "templates visible to authenticated" ON public.orbit_flow_templates;
CREATE POLICY "templates visible to authenticated"
  ON public.orbit_flow_templates FOR SELECT TO authenticated
  USING (is_global = true);

DROP POLICY IF EXISTS "super admins manage templates insert" ON public.orbit_flow_templates;
CREATE POLICY "super admins manage templates insert"
  ON public.orbit_flow_templates FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "super admins manage templates update" ON public.orbit_flow_templates;
CREATE POLICY "super admins manage templates update"
  ON public.orbit_flow_templates FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

DROP POLICY IF EXISTS "super admins manage templates delete" ON public.orbit_flow_templates;
CREATE POLICY "super admins manage templates delete"
  ON public.orbit_flow_templates FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));
