-- Add image URL column to templates
ALTER TABLE public.orbit_message_templates ADD COLUMN IF NOT EXISTS imagem_url text;

-- Create storage bucket for campaign images
INSERT INTO storage.buckets (id, name, public) VALUES ('campaign-images', 'campaign-images', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload campaign images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'campaign-images');

-- Allow public read
CREATE POLICY "Campaign images are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'campaign-images');

-- Allow owners to delete
CREATE POLICY "Users can delete own campaign images"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'campaign-images' AND auth.uid()::text = (storage.foldername(name))[1]);