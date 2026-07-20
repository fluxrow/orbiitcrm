
CREATE TABLE IF NOT EXISTS public.orbit_flow_go_live_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id text NOT NULL,
  empresa_id uuid NOT NULL REFERENCES public.orbit_empresas(id) ON DELETE CASCADE,
  performed_by uuid REFERENCES auth.users(id),
  mode text NOT NULL DEFAULT 'apply',
  status text NOT NULL DEFAULT 'applied',
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  rolled_back_at timestamptz,
  rolled_back_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operation_id)
);

CREATE INDEX IF NOT EXISTS idx_flow_go_live_ops_empresa ON public.orbit_flow_go_live_operations(empresa_id, created_at DESC);

GRANT SELECT ON public.orbit_flow_go_live_operations TO authenticated;
GRANT ALL ON public.orbit_flow_go_live_operations TO service_role;

ALTER TABLE public.orbit_flow_go_live_operations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "flow_go_live_ops_super_admin_read"
ON public.orbit_flow_go_live_operations FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE OR REPLACE FUNCTION public.tg_orbit_flow_go_live_ops_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_flow_go_live_ops_updated_at ON public.orbit_flow_go_live_operations;
CREATE TRIGGER trg_flow_go_live_ops_updated_at
BEFORE UPDATE ON public.orbit_flow_go_live_operations
FOR EACH ROW EXECUTE FUNCTION public.tg_orbit_flow_go_live_ops_updated_at();
