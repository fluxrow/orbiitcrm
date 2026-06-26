
-- 1) Hide plaintext API credentials from authenticated/anon reads (writes still allowed)
REVOKE SELECT (api_key) ON public.orbit_resend_config FROM authenticated, anon;
REVOKE SELECT (token, client_token) ON public.orbit_zapi_config FROM authenticated, anon;

-- Make sure service_role retains full access (it bypasses RLS but explicit grant is harmless)
GRANT ALL ON public.orbit_resend_config TO service_role;
GRANT ALL ON public.orbit_zapi_config TO service_role;

-- 2) Tighten trial_requests INSERT policy: only allow pending status
DROP POLICY IF EXISTS "Anyone can insert trial requests" ON public.trial_requests;
CREATE POLICY "Public can submit pending trial requests"
  ON public.trial_requests
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (status = 'pending');

-- 3) orbit_webhook_logs: explicit deny of client writes (service role bypasses RLS)
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='orbit_webhook_logs' AND cmd IN ('INSERT','UPDATE','DELETE')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.orbit_webhook_logs', r.policyname);
  END LOOP;
END$$;
CREATE POLICY "Deny client inserts on webhook logs"
  ON public.orbit_webhook_logs FOR INSERT TO authenticated, anon WITH CHECK (false);
CREATE POLICY "Deny client updates on webhook logs"
  ON public.orbit_webhook_logs FOR UPDATE TO authenticated, anon USING (false);
CREATE POLICY "Deny client deletes on webhook logs"
  ON public.orbit_webhook_logs FOR DELETE TO authenticated, anon USING (false);
