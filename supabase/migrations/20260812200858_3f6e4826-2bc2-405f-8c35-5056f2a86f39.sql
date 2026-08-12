ALTER TABLE public.orbit_ai_config
  ADD COLUMN IF NOT EXISTS commercial_stage_v2_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.orbit_ai_config.commercial_stage_v2_enabled IS
  'Quando true, usa a conducao comercial v2 (sinais acumulados + permissoes independentes) em vez do guard legado strict_commercial_stage_guard. Escopo por tenant.';