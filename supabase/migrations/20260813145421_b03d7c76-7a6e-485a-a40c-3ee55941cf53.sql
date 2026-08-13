ALTER TABLE public.orbit_ai_config
  ADD COLUMN IF NOT EXISTS primary_offer_lock jsonb;

COMMENT ON COLUMN public.orbit_ai_config.primary_offer_lock IS
  'Trava de oferta principal (tenant-scoped). NULL ou enabled=false mantem comportamento legado.';