CREATE POLICY "Authenticated can update orbit media"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'orbit-media')
WITH CHECK (bucket_id = 'orbit-media');