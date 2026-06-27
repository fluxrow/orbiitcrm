DROP POLICY IF EXISTS "Users can delete own campaign images" ON storage.objects;
CREATE POLICY "Authenticated delete own empresa campaign images" ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'campaign-images'::text AND (
    (storage.foldername(name))[1] = (get_user_empresa_id(auth.uid()))::text
    OR (storage.foldername(name))[1] = (auth.uid())::text
  )
);