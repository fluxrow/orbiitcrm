
CREATE TABLE public.orbit_lead_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.orbit_empresas(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('typebot','google_sheets','webhook_generico','form_publico')),
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  secret_token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  field_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_received_at timestamptz,
  total_received integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.orbit_lead_sources TO authenticated;
GRANT ALL ON public.orbit_lead_sources TO service_role;

ALTER TABLE public.orbit_lead_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own empresa lead sources"
  ON public.orbit_lead_sources FOR SELECT TO authenticated
  USING (empresa_id = get_user_empresa_id(auth.uid()));

CREATE POLICY "PE members can insert own empresa lead sources"
  ON public.orbit_lead_sources FOR INSERT TO authenticated
  WITH CHECK (empresa_id = get_user_empresa_id(auth.uid()) AND pe_user_is_orbit_member(auth.uid()));

CREATE POLICY "PE members can update own empresa lead sources"
  ON public.orbit_lead_sources FOR UPDATE TO authenticated
  USING (empresa_id = get_user_empresa_id(auth.uid()) AND pe_user_is_orbit_member(auth.uid()));

CREATE POLICY "PE members can delete own empresa lead sources"
  ON public.orbit_lead_sources FOR DELETE TO authenticated
  USING (empresa_id = get_user_empresa_id(auth.uid()) AND pe_user_is_orbit_member(auth.uid()));

CREATE POLICY "Super admin can manage all lead sources"
  ON public.orbit_lead_sources FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX idx_lead_sources_empresa_ativo ON public.orbit_lead_sources(empresa_id, ativo);

CREATE TRIGGER trg_lead_sources_updated_at
  BEFORE UPDATE ON public.orbit_lead_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
