CREATE TABLE public.orbit_advisor_scan_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  duration_ms INTEGER,
  source TEXT NOT NULL DEFAULT 'cron',
  tenants_total INTEGER NOT NULL DEFAULT 0,
  tenants_ok INTEGER NOT NULL DEFAULT 0,
  tenants_error INTEGER NOT NULL DEFAULT 0,
  suggestions_evaluated INTEGER NOT NULL DEFAULT 0,
  suggestions_created INTEGER NOT NULL DEFAULT 0,
  suggestions_blocked INTEGER NOT NULL DEFAULT 0,
  suggestions_deduped INTEGER NOT NULL DEFAULT 0,
  detector_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  results JSONB NOT NULL DEFAULT '[]'::jsonb,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.orbit_advisor_scan_runs TO authenticated;
GRANT ALL ON public.orbit_advisor_scan_runs TO service_role;

ALTER TABLE public.orbit_advisor_scan_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin lê execuções do scan"
ON public.orbit_advisor_scan_runs
FOR SELECT
TO authenticated
USING (public.pe_is_super_admin(auth.uid()));

CREATE INDEX idx_advisor_scan_runs_started_at ON public.orbit_advisor_scan_runs (started_at DESC);