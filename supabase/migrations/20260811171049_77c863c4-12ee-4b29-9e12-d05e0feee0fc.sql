-- 1) Biblioteca global de mídias aprovadas (vídeo/imagem/áudio/documento) por tenant
CREATE TABLE IF NOT EXISTS public.orbit_media_library (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('video','image','audio','document')),
  purpose TEXT NOT NULL DEFAULT 'geral',
  nome TEXT NOT NULL,
  caption TEXT,
  storage_path TEXT NOT NULL,
  mime TEXT,
  size_bytes BIGINT,
  duration_seconds NUMERIC,
  width INTEGER,
  height INTEGER,
  trigger_keywords TEXT[] NOT NULL DEFAULT '{}',
  aprovado BOOLEAN NOT NULL DEFAULT false,
  ativo BOOLEAN NOT NULL DEFAULT true,
  uso_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orbit_media_library_lookup_idx
  ON public.orbit_media_library (empresa_id, purpose, ativo, aprovado);
CREATE UNIQUE INDEX IF NOT EXISTS orbit_media_library_path_uniq
  ON public.orbit_media_library (empresa_id, storage_path);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.orbit_media_library TO authenticated;
GRANT ALL ON public.orbit_media_library TO service_role;

ALTER TABLE public.orbit_media_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "media library super admin manage"
  ON public.orbit_media_library FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "media library tenant members manage"
  ON public.orbit_media_library FOR ALL TO authenticated
  USING (user_has_empresa_access(empresa_id) AND pe_user_is_orbit_member(auth.uid()))
  WITH CHECK (user_has_empresa_access(empresa_id) AND pe_user_is_orbit_member(auth.uid()));

CREATE TRIGGER orbit_media_library_set_updated_at
  BEFORE UPDATE ON public.orbit_media_library
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Status de processamento por asset de onboarding
ALTER TABLE public.orbit_onboarding_asset_insights
  ADD COLUMN IF NOT EXISTS process_status TEXT NOT NULL DEFAULT 'done',
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ;

-- 3) Assets órfãos: existem em orbit_onboarding_assets mas não referenciados no responses
CREATE OR REPLACE FUNCTION public.orbit_onboarding_orphan_assets(p_onboarding_id UUID)
RETURNS TABLE (
  asset_id UUID,
  section_key TEXT,
  field_key TEXT,
  item_id TEXT,
  filename TEXT,
  mime TEXT,
  size_bytes BIGINT,
  storage_path TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa UUID;
  v_responses JSONB;
BEGIN
  SELECT o.empresa_id, COALESCE(o.responses, '{}'::jsonb)
    INTO v_empresa, v_responses
  FROM public.orbit_client_onboardings o
  WHERE o.id = p_onboarding_id;

  IF v_empresa IS NULL THEN
    RETURN;
  END IF;

  IF NOT (has_role(auth.uid(), 'super_admin'::app_role) OR user_has_empresa_access(v_empresa)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT a.id, a.section_key, a.field_key, a.item_id, a.filename, a.mime, a.size_bytes::bigint, a.storage_path
  FROM public.orbit_onboarding_assets a
  WHERE a.onboarding_id = p_onboarding_id
    AND POSITION(a.id::text IN v_responses::text) = 0;
END;
$$;

REVOKE ALL ON FUNCTION public.orbit_onboarding_orphan_assets(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.orbit_onboarding_orphan_assets(UUID) TO authenticated, service_role;