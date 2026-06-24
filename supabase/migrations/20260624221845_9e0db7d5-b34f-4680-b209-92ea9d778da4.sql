ALTER TABLE public.orbit_deals
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'manual';

CREATE INDEX IF NOT EXISTS idx_orbit_deals_deleted_at
  ON public.orbit_deals (deleted_at) WHERE deleted_at IS NULL;