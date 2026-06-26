
DROP POLICY IF EXISTS "super admins manage templates insert" ON public.orbit_flow_templates;
DROP POLICY IF EXISTS "super admins manage templates update" ON public.orbit_flow_templates;
DROP POLICY IF EXISTS "super admins manage templates delete" ON public.orbit_flow_templates;

CREATE POLICY "authenticated manage templates insert"
  ON public.orbit_flow_templates FOR INSERT TO authenticated
  WITH CHECK (is_global = true);

CREATE POLICY "authenticated manage templates update"
  ON public.orbit_flow_templates FOR UPDATE TO authenticated
  USING (is_global = true)
  WITH CHECK (is_global = true);

CREATE POLICY "authenticated manage templates delete"
  ON public.orbit_flow_templates FOR DELETE TO authenticated
  USING (is_global = true);
