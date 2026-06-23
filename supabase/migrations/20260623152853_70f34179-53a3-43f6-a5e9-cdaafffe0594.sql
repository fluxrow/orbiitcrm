
-- 1) orbit_audio_library
CREATE TABLE IF NOT EXISTS public.orbit_audio_library (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id    UUID NOT NULL REFERENCES public.orbit_empresas(id) ON DELETE CASCADE,
  nome          TEXT NOT NULL,
  descricao     TEXT,
  url           TEXT NOT NULL,
  duracao_ms    INTEGER,
  contexto      TEXT NOT NULL
                CHECK (contexto IN (
                  'apresentacao','qualificacao','preco','agendamento',
                  'objecao_tempo','objecao_interesse','encerramento','custom'
                )),
  tags          TEXT[] DEFAULT '{}',
  ativo         BOOLEAN DEFAULT true,
  uso_count     INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.orbit_audio_library TO authenticated;
GRANT ALL ON public.orbit_audio_library TO service_role;

ALTER TABLE public.orbit_audio_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "empresa vê seus próprios áudios"
  ON public.orbit_audio_library FOR ALL
  TO authenticated
  USING (empresa_id = (SELECT empresa_id FROM public.profiles WHERE id = auth.uid() LIMIT 1))
  WITH CHECK (empresa_id = (SELECT empresa_id FROM public.profiles WHERE id = auth.uid() LIMIT 1));

CREATE INDEX IF NOT EXISTS idx_orbit_audio_library_empresa_contexto
  ON public.orbit_audio_library (empresa_id, contexto)
  WHERE ativo = true;

CREATE OR REPLACE FUNCTION public.update_orbit_audio_library_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orbit_audio_library_updated_at ON public.orbit_audio_library;
CREATE TRIGGER trg_orbit_audio_library_updated_at
  BEFORE UPDATE ON public.orbit_audio_library
  FOR EACH ROW EXECUTE FUNCTION public.update_orbit_audio_library_updated_at();

-- 2) Corrige policies do bucket orbit-media para usar profiles
DROP POLICY IF EXISTS "tenant upload orbit media" ON storage.objects;
DROP POLICY IF EXISTS "tenant update own orbit media" ON storage.objects;
DROP POLICY IF EXISTS "tenant delete own orbit media" ON storage.objects;

CREATE POLICY "tenant upload orbit media"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'orbit-media'
    AND (storage.foldername(name))[1] = (
      SELECT (empresa_id)::text FROM public.profiles WHERE id = auth.uid() LIMIT 1
    )
  );

CREATE POLICY "tenant update own orbit media"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'orbit-media'
    AND (storage.foldername(name))[1] = (
      SELECT (empresa_id)::text FROM public.profiles WHERE id = auth.uid() LIMIT 1
    )
  )
  WITH CHECK (
    bucket_id = 'orbit-media'
    AND (storage.foldername(name))[1] = (
      SELECT (empresa_id)::text FROM public.profiles WHERE id = auth.uid() LIMIT 1
    )
  );

CREATE POLICY "tenant delete own orbit media"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'orbit-media'
    AND (storage.foldername(name))[1] = (
      SELECT (empresa_id)::text FROM public.profiles WHERE id = auth.uid() LIMIT 1
    )
  );
