-- Create table for Resend email configuration
CREATE TABLE public.orbit_resend_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid REFERENCES public.orbit_empresas(id) ON DELETE CASCADE,
  from_email text,
  from_name text DEFAULT 'Orbit CRM',
  ativo boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.orbit_resend_config ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view own empresa resend_config"
ON public.orbit_resend_config FOR SELECT
USING (empresa_id = get_user_empresa_id(auth.uid()));

CREATE POLICY "Admins can manage own empresa resend_config"
ON public.orbit_resend_config FOR ALL
USING (empresa_id = get_user_empresa_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Super admin can manage all resend_config"
ON public.orbit_resend_config FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_orbit_resend_config_updated_at
BEFORE UPDATE ON public.orbit_resend_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();