
-- Remove policy antiga (se existir) para evitar duplicata
DROP POLICY IF EXISTS "orbit-media: authenticated read own tenant" ON storage.objects;

-- SELECT scoped por empresa_id: apenas usuários autenticados podem ler
-- arquivos do bucket orbit-media cujo primeiro segmento do path é
-- a empresa_id retornada por get_user_empresa_id(auth.uid()).
CREATE POLICY "orbit-media: authenticated read own tenant"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'orbit-media'
  AND (storage.foldername(name))[1] = public.get_user_empresa_id(auth.uid())::text
);

-- service_role já tem acesso total via bypass RLS; nada mais a fazer.
