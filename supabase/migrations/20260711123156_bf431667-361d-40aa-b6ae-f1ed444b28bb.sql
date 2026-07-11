
ALTER TABLE public.orbit_onboarding_asset_insights
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'pending'
    CHECK (review_status IN ('pending','approved','ignored')),
  ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

DROP POLICY IF EXISTS "Tenant members review asset insights" ON public.orbit_onboarding_asset_insights;
CREATE POLICY "Tenant members review asset insights"
  ON public.orbit_onboarding_asset_insights
  FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_empresa_memberships m
    WHERE m.user_id = auth.uid() AND m.empresa_id = orbit_onboarding_asset_insights.empresa_id
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM user_empresa_memberships m
    WHERE m.user_id = auth.uid() AND m.empresa_id = orbit_onboarding_asset_insights.empresa_id
  ));
