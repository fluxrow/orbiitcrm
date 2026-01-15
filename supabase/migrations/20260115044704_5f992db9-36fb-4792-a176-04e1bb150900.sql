-- orbit_audit_log - Log de auditoria
CREATE TABLE public.orbit_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES public.orbit_empresas(id),
  user_id UUID REFERENCES public.profiles(id),
  acao TEXT NOT NULL,
  entidade TEXT NOT NULL,
  entidade_id UUID,
  detalhes JSONB DEFAULT '{}',
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.orbit_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own empresa audit log"
ON public.orbit_audit_log FOR SELECT
USING (empresa_id = get_user_empresa_id(auth.uid()));

CREATE POLICY "Users can insert own empresa audit log"
ON public.orbit_audit_log FOR INSERT
WITH CHECK (empresa_id = get_user_empresa_id(auth.uid()));

CREATE POLICY "Super admin can manage all audit logs"
ON public.orbit_audit_log FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- orbit_whatsapp_daily_limits - Limites diários WhatsApp
CREATE TABLE public.orbit_whatsapp_daily_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES public.orbit_empresas(id),
  data DATE NOT NULL DEFAULT CURRENT_DATE,
  mensagens_enviadas INTEGER DEFAULT 0,
  limite_diario INTEGER DEFAULT 1000,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(empresa_id, data)
);

ALTER TABLE public.orbit_whatsapp_daily_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own empresa limits"
ON public.orbit_whatsapp_daily_limits FOR SELECT
USING (empresa_id = get_user_empresa_id(auth.uid()));

CREATE POLICY "Users can manage own empresa limits"
ON public.orbit_whatsapp_daily_limits FOR ALL
USING (empresa_id = get_user_empresa_id(auth.uid()));

CREATE POLICY "Super admin can manage all limits"
ON public.orbit_whatsapp_daily_limits FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- orbit_campaign_approvals - Log de aprovações de campanha
CREATE TABLE public.orbit_campaign_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES public.orbit_campaigns(id) ON DELETE CASCADE,
  empresa_id UUID REFERENCES public.orbit_empresas(id),
  acao TEXT NOT NULL,
  user_id UUID REFERENCES public.profiles(id),
  motivo TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.orbit_campaign_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own empresa approvals"
ON public.orbit_campaign_approvals FOR SELECT
USING (empresa_id = get_user_empresa_id(auth.uid()));

CREATE POLICY "Users can insert own empresa approvals"
ON public.orbit_campaign_approvals FOR INSERT
WITH CHECK (empresa_id = get_user_empresa_id(auth.uid()));

CREATE POLICY "Super admin can manage all approvals"
ON public.orbit_campaign_approvals FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- orbit_meta_config - Configuração Meta (Instagram/Facebook)
CREATE TABLE public.orbit_meta_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES public.orbit_empresas(id),
  access_token TEXT,
  facebook_page_id TEXT,
  instagram_business_id TEXT,
  webhook_verify_token TEXT DEFAULT gen_random_uuid()::text,
  ativo BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.orbit_meta_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own empresa meta config"
ON public.orbit_meta_config FOR SELECT
USING (empresa_id = get_user_empresa_id(auth.uid()));

CREATE POLICY "Admins can manage own empresa meta config"
ON public.orbit_meta_config FOR ALL
USING (empresa_id = get_user_empresa_id(auth.uid()) AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Super admin can manage all meta config"
ON public.orbit_meta_config FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));

-- Trigger para updated_at
CREATE TRIGGER update_orbit_meta_config_updated_at
BEFORE UPDATE ON public.orbit_meta_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();