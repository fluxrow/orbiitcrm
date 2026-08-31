-- Mantém a leitura browser em nível de coluna: segredos como tts_api_key
-- continuam sem SELECT, enquanto os campos públicos adicionados depois da
-- allowlist original deixam de quebrar a tela de configuração.

REVOKE SELECT ON TABLE public.orbit_ai_config FROM authenticated;

GRANT SELECT (
  conversion_guidance,
  canonical_field_aliases
) ON TABLE public.orbit_ai_config TO authenticated;

COMMENT ON COLUMN public.orbit_ai_config.conversion_guidance IS
  'Orientação de conversão publicada por fluxo governado; leitura tenant-scoped por RLS.';

COMMENT ON COLUMN public.orbit_ai_config.canonical_field_aliases IS
  'Aliases públicos de memória do agente; leitura tenant-scoped por RLS.';
