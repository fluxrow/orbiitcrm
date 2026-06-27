
-- Restrict writes on orbit_flow_templates to super_admin only
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='public' AND tablename='orbit_flow_templates'
      AND cmd IN ('INSERT','UPDATE','DELETE','ALL')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.orbit_flow_templates', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "Super admin inserts flow templates"
  ON public.orbit_flow_templates FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE POLICY "Super admin updates flow templates"
  ON public.orbit_flow_templates FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE POLICY "Super admin deletes flow templates"
  ON public.orbit_flow_templates FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role));
