
INSERT INTO storage.buckets (id, name, public)
VALUES ('orbit-media', 'orbit-media', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated can upload orbit media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'orbit-media');

CREATE POLICY "Public can read orbit media"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'orbit-media');

CREATE POLICY "Authenticated can delete own orbit media"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'orbit-media');
