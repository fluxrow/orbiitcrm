
-- 1) campaign-images: remove ALL client-side write policies. Uploads only via
--    orbit-campaign-image-upload edge function (service_role bypasses RLS).
DROP POLICY IF EXISTS "Campaign images: upload own folder" ON storage.objects;
DROP POLICY IF EXISTS "Campaign images: update own folder" ON storage.objects;
DROP POLICY IF EXISTS "Campaign images: delete own folder" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload to own empresa campaign images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update own empresa campaign images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete own empresa campaign images" ON storage.objects;

-- Read policy stays as-is (bucket is public by design; anon reads via public URL).

-- 2) orbit_google_tokens: require user OR super_admin AND tenant scope.
DROP POLICY IF EXISTS "Token owner manages google tokens" ON public.orbit_google_tokens;
DROP POLICY IF EXISTS "Empresa members manage google tokens" ON public.orbit_google_tokens;

CREATE POLICY "Users manage google tokens for accessible empresa"
ON public.orbit_google_tokens
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR public.pe_is_super_admin(auth.uid())
  OR (
    user_id = auth.uid()
    AND (
      empresa_id = public.get_user_empresa_id(auth.uid())
      OR EXISTS (
        SELECT 1
        FROM public.user_empresa_memberships m
        WHERE m.user_id = auth.uid()
          AND m.empresa_id = orbit_google_tokens.empresa_id
      )
    )
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'super_admin'::public.app_role)
  OR public.pe_is_super_admin(auth.uid())
  OR (
    user_id = auth.uid()
    AND (
      empresa_id = public.get_user_empresa_id(auth.uid())
      OR EXISTS (
        SELECT 1
        FROM public.user_empresa_memberships m
        WHERE m.user_id = auth.uid()
          AND m.empresa_id = orbit_google_tokens.empresa_id
      )
    )
  )
);

-- Revoke read access on raw token columns. Edge functions use service_role.
REVOKE SELECT (access_token, refresh_token)
  ON public.orbit_google_tokens
  FROM anon, authenticated;
