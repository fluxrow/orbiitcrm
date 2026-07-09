DROP POLICY IF EXISTS "Admins can manage own empresa stages" ON public.orbit_pipeline_stages;
CREATE POLICY "Admins can manage own empresa stages"
ON public.orbit_pipeline_stages
FOR ALL
TO authenticated
USING (
  empresa_id IS NOT NULL
  AND empresa_id = public.get_user_empresa_id(auth.uid())
  AND public.pe_user_is_orbit_admin(auth.uid())
)
WITH CHECK (
  empresa_id IS NOT NULL
  AND empresa_id = public.get_user_empresa_id(auth.uid())
  AND public.pe_user_is_orbit_admin(auth.uid())
);