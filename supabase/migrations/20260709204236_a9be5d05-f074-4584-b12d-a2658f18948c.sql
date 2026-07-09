-- Alinhar SELECT policy do bucket orbit-media com INSERT/UPDATE/DELETE
-- Antes: só profiles.empresa_id (bloqueava super_admin e memberships)
-- Depois: super_admin OU profile.empresa_id OU user_empresa_memberships

DROP POLICY IF EXISTS "orbit-media: authenticated read own tenant" ON storage.objects;
DROP POLICY IF EXISTS "orbit-media tenant select" ON storage.objects;
DROP POLICY IF EXISTS "tenant read own orbit media" ON storage.objects;

CREATE POLICY "orbit-media tenant select"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'orbit-media'
  AND (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR (storage.foldername(name))[1] = (
      SELECT p.empresa_id::text
      FROM public.profiles p
      WHERE p.id = auth.uid()
      LIMIT 1
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_empresa_memberships m
      WHERE m.user_id = auth.uid()
        AND m.empresa_id::text = (storage.foldername(objects.name))[1]
    )
  )
);
