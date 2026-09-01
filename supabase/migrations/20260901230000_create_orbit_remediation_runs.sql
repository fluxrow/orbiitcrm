-- Remediação é uma superfície separada do monitor read-only.
-- Esta migration define o ledger; não deve ser aplicada sem revisão/aprovação.
CREATE TABLE IF NOT EXISTS public.orbit_remediation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.orbit_empresas(id) ON DELETE CASCADE,
  playbook text NOT NULL CHECK (playbook IN ('edge_function_deploy_drift', 'meeting_reminder_source_guard')),
  function_name text NOT NULL CHECK (function_name IN ('orbit-ai-agent', 'orbit-flow-executor', 'send-orbit-campaign', 'send-vendedor-notification')),
  idempotency_key text NOT NULL,
  status text NOT NULL CHECK (status IN ('preview', 'blocked', 'applied', 'rolled_back', 'failed', 'idempotent_noop')),
  risk text NOT NULL CHECK (risk IN ('low', 'medium', 'high')),
  dry_run boolean NOT NULL DEFAULT true,
  approved_by uuid,
  approved_at timestamptz,
  snapshot_before jsonb NOT NULL DEFAULT '{}'::jsonb,
  snapshot_after jsonb NOT NULL DEFAULT '{}'::jsonb,
  rollback_attempted boolean NOT NULL DEFAULT false,
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orbit_remediation_runs_empresa_created
  ON public.orbit_remediation_runs (empresa_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_orbit_remediation_runs_tenant_idempotency
  ON public.orbit_remediation_runs (empresa_id, idempotency_key);

ALTER TABLE public.orbit_remediation_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.orbit_remediation_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.orbit_remediation_runs TO authenticated;
GRANT ALL ON public.orbit_remediation_runs TO service_role;

DROP POLICY IF EXISTS orbit_remediation_runs_select_own_empresa ON public.orbit_remediation_runs;
CREATE POLICY orbit_remediation_runs_select_own_empresa
  ON public.orbit_remediation_runs
  FOR SELECT TO authenticated
  USING (empresa_id = (SELECT empresa_id FROM public.profiles WHERE id = (SELECT auth.uid())));
