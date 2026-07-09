
-- 1) orbit_distribuicao_config: usar pe_user_is_orbit_admin
DROP POLICY IF EXISTS "Admins can manage own empresa distribuicao" ON public.orbit_distribuicao_config;
CREATE POLICY "Orbit admins manage own empresa distribuicao"
  ON public.orbit_distribuicao_config
  FOR ALL
  TO authenticated
  USING (
    empresa_id = get_user_empresa_id(auth.uid())
    AND public.pe_user_is_orbit_admin(auth.uid())
  )
  WITH CHECK (
    empresa_id = get_user_empresa_id(auth.uid())
    AND public.pe_user_is_orbit_admin(auth.uid())
  );

-- 2) orbit-media storage: consolidar policies em torno de empresa_id como folder[1]
DROP POLICY IF EXISTS "tenant upload orbit media" ON storage.objects;
DROP POLICY IF EXISTS "tenant update own orbit media" ON storage.objects;
DROP POLICY IF EXISTS "tenant delete own orbit media" ON storage.objects;
DROP POLICY IF EXISTS "Super admin upload orbit media" ON storage.objects;
DROP POLICY IF EXISTS "Super admin update orbit media" ON storage.objects;
DROP POLICY IF EXISTS "Super admin delete orbit media" ON storage.objects;

-- Helper inline: user pertence à empresa (profile OU membership)
-- Regra única: folder[1] = empresa do usuário

CREATE POLICY "orbit-media tenant upload"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'orbit-media'
    AND (
      has_role(auth.uid(), 'super_admin'::app_role)
      OR (storage.foldername(name))[1] = (
        SELECT profiles.empresa_id::text FROM profiles WHERE profiles.id = auth.uid() LIMIT 1
      )
      OR EXISTS (
        SELECT 1 FROM user_empresa_memberships m
        WHERE m.user_id = auth.uid()
          AND m.empresa_id::text = (storage.foldername(objects.name))[1]
      )
    )
  );

CREATE POLICY "orbit-media tenant update"
  ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'orbit-media'
    AND (
      has_role(auth.uid(), 'super_admin'::app_role)
      OR (storage.foldername(name))[1] = (
        SELECT profiles.empresa_id::text FROM profiles WHERE profiles.id = auth.uid() LIMIT 1
      )
      OR EXISTS (
        SELECT 1 FROM user_empresa_memberships m
        WHERE m.user_id = auth.uid()
          AND m.empresa_id::text = (storage.foldername(objects.name))[1]
      )
    )
  )
  WITH CHECK (
    bucket_id = 'orbit-media'
    AND (
      has_role(auth.uid(), 'super_admin'::app_role)
      OR (storage.foldername(name))[1] = (
        SELECT profiles.empresa_id::text FROM profiles WHERE profiles.id = auth.uid() LIMIT 1
      )
      OR EXISTS (
        SELECT 1 FROM user_empresa_memberships m
        WHERE m.user_id = auth.uid()
          AND m.empresa_id::text = (storage.foldername(objects.name))[1]
      )
    )
  );

CREATE POLICY "orbit-media tenant delete"
  ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'orbit-media'
    AND (
      has_role(auth.uid(), 'super_admin'::app_role)
      OR (storage.foldername(name))[1] = (
        SELECT profiles.empresa_id::text FROM profiles WHERE profiles.id = auth.uid() LIMIT 1
      )
      OR EXISTS (
        SELECT 1 FROM user_empresa_memberships m
        WHERE m.user_id = auth.uid()
          AND m.empresa_id::text = (storage.foldername(objects.name))[1]
      )
    )
  );
