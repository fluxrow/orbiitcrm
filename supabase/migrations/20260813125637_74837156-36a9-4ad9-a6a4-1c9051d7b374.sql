ALTER TABLE public.orbit_ai_config
  ADD COLUMN IF NOT EXISTS campos_cadastro_obrigatorios jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS block_location_collection boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.orbit_ai_config.campos_cadastro_obrigatorios IS
  'Tenant-scoped: lista explicita dos campos de cadastro obrigatorios do agente. NULL = fallback legado (nome_razao,email_principal,cidade). Array vazio = nenhum campo cadastral obrigatorio.';
COMMENT ON COLUMN public.orbit_ai_config.block_location_collection IS
  'Tenant-scoped: quando true, o agente nunca pede cidade/estado/UF/regiao/endereco nem enquadra a conversa como finalizar cadastro.';