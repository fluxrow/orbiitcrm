
-- 1) Lead sources secret_token: restrict SELECT to admins/super_admin only
DROP POLICY IF EXISTS "Users can view own empresa lead sources" ON public.orbit_lead_sources;
CREATE POLICY "Admins can view own empresa lead sources"
  ON public.orbit_lead_sources
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR (
      empresa_id = get_user_empresa_id(auth.uid())
      AND pe_user_is_orbit_admin(auth.uid())
    )
  );

-- 2) Pipeline stages: never expose NULL-empresa rows to authenticated users
DROP POLICY IF EXISTS "Users can view own empresa pipeline stages" ON public.orbit_pipeline_stages;
DROP POLICY IF EXISTS "Authenticated can view pipeline stages" ON public.orbit_pipeline_stages;
DROP POLICY IF EXISTS "View orbit_pipeline_stages" ON public.orbit_pipeline_stages;
-- recreate a strict SELECT policy
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE tablename='orbit_pipeline_stages' AND cmd='SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.orbit_pipeline_stages', r.policyname);
  END LOOP;
END$$;
CREATE POLICY "Members view own empresa pipeline stages"
  ON public.orbit_pipeline_stages
  FOR SELECT
  TO authenticated
  USING (
    empresa_id IS NOT NULL
    AND (
      has_role(auth.uid(), 'super_admin'::app_role)
      OR empresa_id = get_user_empresa_id(auth.uid())
    )
  );

-- 3) Revoke EXECUTE FROM anon on every SECURITY DEFINER function in public,
--    then re-grant to anon only the small set used in unauthenticated flows.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon', r.proname, r.args);
  END LOOP;
END$$;

-- Allowlist: functions intentionally callable by anon (public/onboarding/landing flows)
GRANT EXECUTE ON FUNCTION public.get_empresa_by_slug(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_onboarding_by_token(text) TO anon;
GRANT EXECUTE ON FUNCTION public.save_onboarding_responses(text, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.submit_onboarding(text, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.list_public_plans() TO anon;
