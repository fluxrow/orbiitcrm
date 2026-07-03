
-- 1) orbit_google_oauth_states: allow users to manage their own state rows
CREATE POLICY "Users manage own google oauth states"
ON public.orbit_google_oauth_states
FOR ALL
TO authenticated
USING (user_id = auth.uid() AND empresa_id = get_user_empresa_id(auth.uid()))
WITH CHECK (user_id = auth.uid() AND empresa_id = get_user_empresa_id(auth.uid()));

-- 2) orbit_pipeline_stages: enforce NOT NULL empresa_id to remove global-row ambiguity
ALTER TABLE public.orbit_pipeline_stages
  ALTER COLUMN empresa_id SET NOT NULL;

-- Simplify SELECT policy now that empresa_id cannot be NULL
DROP POLICY IF EXISTS "Members view own empresa pipeline stages" ON public.orbit_pipeline_stages;
CREATE POLICY "Members view own empresa pipeline stages"
ON public.orbit_pipeline_stages
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'super_admin'::app_role)
  OR empresa_id = get_user_empresa_id(auth.uid())
);

-- 3) orbit_prospects: require orbit membership for SELECT (align with write policies)
DROP POLICY IF EXISTS "Users can view own empresa prospects" ON public.orbit_prospects;
CREATE POLICY "Orbit members view own empresa prospects"
ON public.orbit_prospects
FOR SELECT
TO authenticated
USING (
  empresa_id = get_user_empresa_id(auth.uid())
  AND pe_user_is_orbit_member(auth.uid())
);
