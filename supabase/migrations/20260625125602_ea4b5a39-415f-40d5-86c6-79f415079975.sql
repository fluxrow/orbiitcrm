ALTER TABLE public.orbit_ai_config
  DROP COLUMN IF EXISTS prompt_treinamento,
  DROP COLUMN IF EXISTS prompt_orcamentos,
  DROP COLUMN IF EXISTS campos_cadastro;