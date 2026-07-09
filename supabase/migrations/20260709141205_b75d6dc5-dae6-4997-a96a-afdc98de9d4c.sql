DROP POLICY IF EXISTS "Authenticated upload to own empresa campaign images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated read own empresa campaign images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update own empresa campaign images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete own empresa campaign images" ON storage.objects;

CREATE POLICY "Campaign images: upload own folder"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'campaign-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Campaign images: read own folder"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'campaign-images'
  AND (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR (storage.foldername(name))[1] = auth.uid()::text
  )
);

CREATE POLICY "Campaign images: update own folder"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'campaign-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
)
WITH CHECK (
  bucket_id = 'campaign-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Campaign images: delete own folder"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'campaign-images'
  AND (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR (storage.foldername(name))[1] = auth.uid()::text
  )
);