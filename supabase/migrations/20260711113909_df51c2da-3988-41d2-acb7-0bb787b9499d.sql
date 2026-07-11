
CREATE TABLE public.orbit_onboarding_assets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id uuid NOT NULL REFERENCES public.orbit_empresas(id) ON DELETE CASCADE,
  onboarding_id uuid NOT NULL REFERENCES public.orbit_client_onboardings(id) ON DELETE CASCADE,
  section_key text NOT NULL,
  field_key text NOT NULL,
  item_id text,
  storage_path text NOT NULL,
  filename text NOT NULL,
  mime text,
  size_bytes bigint,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_orbit_onboarding_assets_onboarding ON public.orbit_onboarding_assets(onboarding_id);
CREATE INDEX idx_orbit_onboarding_assets_empresa ON public.orbit_onboarding_assets(empresa_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.orbit_onboarding_assets TO authenticated;
GRANT ALL ON public.orbit_onboarding_assets TO service_role;

ALTER TABLE public.orbit_onboarding_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenants read own onboarding assets" ON public.orbit_onboarding_assets
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR get_user_empresa_id(auth.uid()) = empresa_id);

CREATE POLICY "tenants insert own onboarding assets" ON public.orbit_onboarding_assets
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR get_user_empresa_id(auth.uid()) = empresa_id);

CREATE POLICY "tenants update own onboarding assets" ON public.orbit_onboarding_assets
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR get_user_empresa_id(auth.uid()) = empresa_id)
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role) OR get_user_empresa_id(auth.uid()) = empresa_id);

CREATE POLICY "tenants delete own onboarding assets" ON public.orbit_onboarding_assets
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role) OR get_user_empresa_id(auth.uid()) = empresa_id);

CREATE TRIGGER trg_orbit_onboarding_assets_updated_at
  BEFORE UPDATE ON public.orbit_onboarding_assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
