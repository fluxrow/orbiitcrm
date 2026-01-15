-- Adicionar colunas faltantes na tabela orbit_ai_config
ALTER TABLE public.orbit_ai_config 
ADD COLUMN IF NOT EXISTS idioma TEXT DEFAULT 'pt-BR',
ADD COLUMN IF NOT EXISTS max_tokens INTEGER DEFAULT 500,
ADD COLUMN IF NOT EXISTS tempo_espera INTEGER DEFAULT 10,
ADD COLUMN IF NOT EXISTS prompt_orcamentos TEXT;