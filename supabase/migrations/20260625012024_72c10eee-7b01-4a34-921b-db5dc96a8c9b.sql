
-- Storage RLS para bucket orbit-knowledge-base
-- Convenção de path: {empresa_id}/{source_id}/{filename}

CREATE POLICY "ai_knowledge storage select"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'orbit-knowledge-base'
    AND (
      public.has_role(auth.uid(), 'super_admin'::public.app_role)
      OR public.user_has_empresa_access(
        (CASE
          WHEN (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
          THEN ((storage.foldername(name))[1])::uuid
          ELSE NULL
        END)
      )
    )
  );

CREATE POLICY "ai_knowledge storage insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'orbit-knowledge-base'
    AND (
      public.has_role(auth.uid(), 'super_admin'::public.app_role)
      OR public.user_has_empresa_access(
        (CASE
          WHEN (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
          THEN ((storage.foldername(name))[1])::uuid
          ELSE NULL
        END)
      )
    )
  );

CREATE POLICY "ai_knowledge storage update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'orbit-knowledge-base'
    AND (
      public.has_role(auth.uid(), 'super_admin'::public.app_role)
      OR public.user_has_empresa_access(
        (CASE
          WHEN (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
          THEN ((storage.foldername(name))[1])::uuid
          ELSE NULL
        END)
      )
    )
  );

CREATE POLICY "ai_knowledge storage delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'orbit-knowledge-base'
    AND (
      public.has_role(auth.uid(), 'super_admin'::public.app_role)
      OR public.user_has_empresa_access(
        (CASE
          WHEN (storage.foldername(name))[1] ~* '^[0-9a-f-]{36}$'
          THEN ((storage.foldername(name))[1])::uuid
          ELSE NULL
        END)
      )
    )
  );
