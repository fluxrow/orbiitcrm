
-- E2.7.A: AI config refactor + RAG knowledge base

-- 1) Extensão pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- 2) Novas colunas em orbit_ai_config (mantém as antigas para compat)
ALTER TABLE public.orbit_ai_config
  ADD COLUMN IF NOT EXISTS prompt_identidade text,
  ADD COLUMN IF NOT EXISTS prompt_roteiro text,
  ADD COLUMN IF NOT EXISTS prompt_regras text,
  ADD COLUMN IF NOT EXISTS campos_qualificacao jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS knowledge_base_enabled boolean NOT NULL DEFAULT false;

-- Backfill: copiar prompt_treinamento -> prompt_identidade onde vazio
UPDATE public.orbit_ai_config
SET prompt_identidade = prompt_treinamento
WHERE prompt_identidade IS NULL
  AND prompt_treinamento IS NOT NULL
  AND length(trim(prompt_treinamento)) > 0;

-- 3) Tabela orbit_ai_knowledge (chunks com embeddings)
CREATE TABLE IF NOT EXISTS public.orbit_ai_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.orbit_empresas(id) ON DELETE CASCADE,
  source_id uuid NOT NULL DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('documento','url','texto')),
  titulo text,
  source_url text,
  storage_path text,
  conteudo_texto text,
  chunk_index integer NOT NULL DEFAULT 0,
  embedding vector(3072),
  model_version text NOT NULL DEFAULT 'google/gemini-embedding-001',
  ativo boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','ready','error')),
  erro text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orbit_ai_knowledge_empresa_idx
  ON public.orbit_ai_knowledge(empresa_id);
CREATE INDEX IF NOT EXISTS orbit_ai_knowledge_source_idx
  ON public.orbit_ai_knowledge(source_id);
CREATE INDEX IF NOT EXISTS orbit_ai_knowledge_status_idx
  ON public.orbit_ai_knowledge(status) WHERE status IN ('pending','processing');

-- Índice HNSW para busca semântica (cosine). vector(3072) suportado em pgvector >= 0.7.
-- Se a versão do pgvector não suportar HNSW em 3072 dims, cai pra busca sequencial (ainda funcional).
DO $$
BEGIN
  BEGIN
    EXECUTE 'CREATE INDEX IF NOT EXISTS orbit_ai_knowledge_embedding_idx
             ON public.orbit_ai_knowledge USING hnsw (embedding vector_cosine_ops)';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'HNSW index skipped (pgvector limitation for 3072 dims): %', SQLERRM;
  END;
END$$;

-- 4) GRANTs (regra do projeto)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orbit_ai_knowledge TO authenticated;
GRANT ALL ON public.orbit_ai_knowledge TO service_role;

-- 5) RLS
ALTER TABLE public.orbit_ai_knowledge ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_knowledge tenant select"
  ON public.orbit_ai_knowledge FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.user_has_empresa_access(empresa_id)
  );

CREATE POLICY "ai_knowledge tenant insert"
  ON public.orbit_ai_knowledge FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.user_has_empresa_access(empresa_id)
  );

CREATE POLICY "ai_knowledge tenant update"
  ON public.orbit_ai_knowledge FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.user_has_empresa_access(empresa_id)
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.user_has_empresa_access(empresa_id)
  );

CREATE POLICY "ai_knowledge tenant delete"
  ON public.orbit_ai_knowledge FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR public.user_has_empresa_access(empresa_id)
  );

-- 6) Trigger updated_at
DROP TRIGGER IF EXISTS trg_orbit_ai_knowledge_updated_at ON public.orbit_ai_knowledge;
CREATE TRIGGER trg_orbit_ai_knowledge_updated_at
  BEFORE UPDATE ON public.orbit_ai_knowledge
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7) RPC para busca semântica isolada por empresa
CREATE OR REPLACE FUNCTION public.match_orbit_knowledge(
  p_empresa_id uuid,
  query_embedding vector(3072),
  match_count integer DEFAULT 3,
  min_similarity float DEFAULT 0.7
)
RETURNS TABLE (
  id uuid,
  source_id uuid,
  titulo text,
  conteudo_texto text,
  tipo text,
  similarity float
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    k.id,
    k.source_id,
    k.titulo,
    k.conteudo_texto,
    k.tipo,
    1 - (k.embedding <=> query_embedding) AS similarity
  FROM public.orbit_ai_knowledge k
  WHERE k.empresa_id = p_empresa_id
    AND k.ativo = true
    AND k.status = 'ready'
    AND k.embedding IS NOT NULL
    AND (1 - (k.embedding <=> query_embedding)) >= min_similarity
  ORDER BY k.embedding <=> query_embedding ASC
  LIMIT GREATEST(match_count, 1);
$$;

GRANT EXECUTE ON FUNCTION public.match_orbit_knowledge(uuid, vector, integer, float) TO authenticated, service_role;
