
-- 1) orbit_google_tokens: restrict to token owner (or super admin)
DROP POLICY IF EXISTS "Empresa members manage google tokens" ON public.orbit_google_tokens;
CREATE POLICY "Token owner manages google tokens"
ON public.orbit_google_tokens
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR user_id = auth.uid()
)
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR user_id = auth.uid()
);

-- 2) Sensitive secret columns: revoke client read access. Edge functions use
--    service_role and bypass RLS, so server-side reads keep working.
REVOKE SELECT (api_key) ON public.orbit_resend_config FROM authenticated, anon;
REVOKE SELECT (access_token, webhook_verify_token) ON public.orbit_meta_config FROM authenticated, anon;
REVOKE SELECT (token, client_token, token_secret_id, client_token_secret_id) ON public.orbit_zapi_config FROM authenticated, anon;

-- 3) orbit_webhook_logs: explicit deny-all SELECT for non-service callers
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='orbit_webhook_logs' AND policyname='Deny all client reads on webhook logs') THEN
    DROP POLICY "Deny all client reads on webhook logs" ON public.orbit_webhook_logs;
  END IF;
END $$;
CREATE POLICY "Deny all client reads on webhook logs"
ON public.orbit_webhook_logs
FOR SELECT
TO authenticated, anon
USING (false);

REVOKE SELECT ON public.orbit_webhook_logs FROM anon, authenticated;
GRANT ALL ON public.orbit_webhook_logs TO service_role;

-- 4) Storage policy cleanup
-- campaign-images: remove the unscoped INSERT policy
DROP POLICY IF EXISTS "Authenticated users can upload campaign images" ON storage.objects;

-- orbit-media: remove unscoped DELETE/UPDATE/SELECT policies
DROP POLICY IF EXISTS "Authenticated can delete own orbit media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can update orbit media" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload orbit media" ON storage.objects;
DROP POLICY IF EXISTS "Public can read orbit media" ON storage.objects;

-- 5) Revoke EXECUTE on internal-only SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_pe() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_pe_role_to_user_roles() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.auto_create_followup_task() FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.saas_increment_usage(uuid, text, integer) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pe_backfill_import_as_lista(uuid, uuid, text, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pe_promote_prospect(uuid, uuid, boolean, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pe_populate_campaign_recipients(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pe_upsert_tenant_map(uuid, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pe_delete_tenant_map(uuid) FROM anon, PUBLIC;
