
-- Table: orbit_whatsapp_sending_config
CREATE TABLE public.orbit_whatsapp_sending_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid UNIQUE REFERENCES public.orbit_empresas(id) ON DELETE CASCADE,
  min_delay_ms integer NOT NULL DEFAULT 1500,
  max_delay_ms integer NOT NULL DEFAULT 3500,
  batch_size integer NOT NULL DEFAULT 50,
  batch_pause_ms integer NOT NULL DEFAULT 30000,
  daily_limit integer NOT NULL DEFAULT 500,
  max_per_minute integer NOT NULL DEFAULT 15,
  warmup_enabled boolean NOT NULL DEFAULT false,
  warmup_start_date date,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.orbit_whatsapp_sending_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin can manage all whatsapp_sending_config"
  ON public.orbit_whatsapp_sending_config FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Admins can manage own empresa whatsapp_sending_config"
  ON public.orbit_whatsapp_sending_config FOR ALL
  TO authenticated
  USING (empresa_id = get_user_empresa_id(auth.uid()) AND pe_user_is_orbit_admin(auth.uid()))
  WITH CHECK (empresa_id = get_user_empresa_id(auth.uid()) AND pe_user_is_orbit_admin(auth.uid()));

CREATE POLICY "Users can view own empresa whatsapp_sending_config"
  ON public.orbit_whatsapp_sending_config FOR SELECT
  TO authenticated
  USING (empresa_id = get_user_empresa_id(auth.uid()));

-- Table: orbit_whatsapp_daily_usage
CREATE TABLE public.orbit_whatsapp_daily_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.orbit_empresas(id) ON DELETE CASCADE,
  usage_date date NOT NULL DEFAULT CURRENT_DATE,
  sent_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(empresa_id, usage_date)
);

ALTER TABLE public.orbit_whatsapp_daily_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin can manage all whatsapp_daily_usage"
  ON public.orbit_whatsapp_daily_usage FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Users can view own empresa whatsapp_daily_usage"
  ON public.orbit_whatsapp_daily_usage FOR SELECT
  TO authenticated
  USING (empresa_id = get_user_empresa_id(auth.uid()));

CREATE POLICY "Admins can manage own empresa whatsapp_daily_usage"
  ON public.orbit_whatsapp_daily_usage FOR ALL
  TO authenticated
  USING (empresa_id = get_user_empresa_id(auth.uid()) AND pe_user_is_orbit_admin(auth.uid()))
  WITH CHECK (empresa_id = get_user_empresa_id(auth.uid()) AND pe_user_is_orbit_admin(auth.uid()));
