ALTER TABLE public.orbit_prospects
  ADD COLUMN IF NOT EXISTS dados_adicionais JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_orbit_prospects_dados_adicionais
  ON public.orbit_prospects USING GIN (dados_adicionais);