
-- =============================================
-- FASE 1: ENUM E TABELAS BASE
-- =============================================

-- 1.1 Criar enum para tipos de role
CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin', 'vendedor', 'visualizador');

-- 1.2 Criar tabela de empresas
CREATE TABLE public.orbit_empresas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  cnpj TEXT UNIQUE,
  email_contato TEXT,
  telefone TEXT,
  logo_url TEXT,
  plano TEXT DEFAULT 'trial',
  ativo BOOLEAN DEFAULT true,
  max_usuarios INTEGER DEFAULT 5,
  data_expiracao DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 1.3 Criar tabela de roles (separada de profiles por segurança)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, role)
);

-- 1.4 Adicionar empresa_id em profiles
ALTER TABLE public.profiles ADD COLUMN empresa_id UUID REFERENCES public.orbit_empresas(id);

-- 1.5 Adicionar empresa_id em todas as tabelas orbit
ALTER TABLE public.orbit_prospects ADD COLUMN empresa_id UUID REFERENCES public.orbit_empresas(id);
ALTER TABLE public.orbit_conversas ADD COLUMN empresa_id UUID REFERENCES public.orbit_empresas(id);
ALTER TABLE public.orbit_mensagens ADD COLUMN empresa_id UUID REFERENCES public.orbit_empresas(id);
ALTER TABLE public.orbit_pipeline_stages ADD COLUMN empresa_id UUID REFERENCES public.orbit_empresas(id);
ALTER TABLE public.orbit_deals ADD COLUMN empresa_id UUID REFERENCES public.orbit_empresas(id);
ALTER TABLE public.orbit_message_templates ADD COLUMN empresa_id UUID REFERENCES public.orbit_empresas(id);
ALTER TABLE public.orbit_campaigns ADD COLUMN empresa_id UUID REFERENCES public.orbit_empresas(id);
ALTER TABLE public.orbit_campaign_recipients ADD COLUMN empresa_id UUID REFERENCES public.orbit_empresas(id);
ALTER TABLE public.orbit_distribuicao_config ADD COLUMN empresa_id UUID REFERENCES public.orbit_empresas(id);
ALTER TABLE public.orbit_ai_config ADD COLUMN empresa_id UUID REFERENCES public.orbit_empresas(id);
ALTER TABLE public.orbit_zapi_config ADD COLUMN empresa_id UUID REFERENCES public.orbit_empresas(id);
ALTER TABLE public.orbit_activities ADD COLUMN empresa_id UUID REFERENCES public.orbit_empresas(id);
ALTER TABLE public.orbit_transferencias ADD COLUMN empresa_id UUID REFERENCES public.orbit_empresas(id);
ALTER TABLE public.orbit_integrations_config ADD COLUMN empresa_id UUID REFERENCES public.orbit_empresas(id);

-- =============================================
-- FASE 2: FUNÇÕES SECURITY DEFINER
-- =============================================

-- 2.1 Função para verificar se usuário tem role
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- 2.2 Função para obter empresa_id do usuário
CREATE OR REPLACE FUNCTION public.get_user_empresa_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT empresa_id FROM public.profiles WHERE id = _user_id
$$;

-- =============================================
-- FASE 3: RLS PARA TABELAS NOVAS
-- =============================================

-- 3.1 RLS para orbit_empresas
ALTER TABLE public.orbit_empresas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin can manage all empresas"
  ON public.orbit_empresas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Users can view own empresa"
  ON public.orbit_empresas FOR SELECT TO authenticated
  USING (id = public.get_user_empresa_id(auth.uid()));

-- 3.2 RLS para user_roles
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin can manage all roles"
  ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- =============================================
-- FASE 4: ATUALIZAR RLS DAS TABELAS EXISTENTES
-- =============================================

-- 4.1 profiles - atualizar policies
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Super admin can manage all profiles"
  ON public.profiles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Users can view profiles from same empresa"
  ON public.profiles FOR SELECT TO authenticated
  USING (empresa_id = public.get_user_empresa_id(auth.uid()) OR id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

-- 4.2 orbit_prospects
DROP POLICY IF EXISTS "Authenticated users can view prospects" ON public.orbit_prospects;
DROP POLICY IF EXISTS "Authenticated users can insert prospects" ON public.orbit_prospects;
DROP POLICY IF EXISTS "Authenticated users can update prospects" ON public.orbit_prospects;
DROP POLICY IF EXISTS "Authenticated users can delete prospects" ON public.orbit_prospects;

CREATE POLICY "Super admin can manage all prospects"
  ON public.orbit_prospects FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Users can view own empresa prospects"
  ON public.orbit_prospects FOR SELECT TO authenticated
  USING (empresa_id = public.get_user_empresa_id(auth.uid()));

CREATE POLICY "Users can insert own empresa prospects"
  ON public.orbit_prospects FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.get_user_empresa_id(auth.uid()));

CREATE POLICY "Users can update own empresa prospects"
  ON public.orbit_prospects FOR UPDATE TO authenticated
  USING (empresa_id = public.get_user_empresa_id(auth.uid()));

CREATE POLICY "Users can delete own empresa prospects"
  ON public.orbit_prospects FOR DELETE TO authenticated
  USING (empresa_id = public.get_user_empresa_id(auth.uid()));

-- 4.3 orbit_conversas
DROP POLICY IF EXISTS "Authenticated users can view conversas" ON public.orbit_conversas;
DROP POLICY IF EXISTS "Authenticated users can insert conversas" ON public.orbit_conversas;
DROP POLICY IF EXISTS "Authenticated users can update conversas" ON public.orbit_conversas;

CREATE POLICY "Super admin can manage all conversas"
  ON public.orbit_conversas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Users can view own empresa conversas"
  ON public.orbit_conversas FOR SELECT TO authenticated
  USING (empresa_id = public.get_user_empresa_id(auth.uid()));

CREATE POLICY "Users can insert own empresa conversas"
  ON public.orbit_conversas FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.get_user_empresa_id(auth.uid()));

CREATE POLICY "Users can update own empresa conversas"
  ON public.orbit_conversas FOR UPDATE TO authenticated
  USING (empresa_id = public.get_user_empresa_id(auth.uid()));

-- 4.4 orbit_mensagens
DROP POLICY IF EXISTS "Authenticated users can view mensagens" ON public.orbit_mensagens;
DROP POLICY IF EXISTS "Authenticated users can insert mensagens" ON public.orbit_mensagens;

CREATE POLICY "Super admin can manage all mensagens"
  ON public.orbit_mensagens FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Users can view own empresa mensagens"
  ON public.orbit_mensagens FOR SELECT TO authenticated
  USING (empresa_id = public.get_user_empresa_id(auth.uid()));

CREATE POLICY "Users can insert own empresa mensagens"
  ON public.orbit_mensagens FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.get_user_empresa_id(auth.uid()));

-- 4.5 orbit_pipeline_stages
DROP POLICY IF EXISTS "Anyone can view pipeline stages" ON public.orbit_pipeline_stages;
DROP POLICY IF EXISTS "Authenticated users can manage stages" ON public.orbit_pipeline_stages;

CREATE POLICY "Super admin can manage all stages"
  ON public.orbit_pipeline_stages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Users can view own empresa stages"
  ON public.orbit_pipeline_stages FOR SELECT TO authenticated
  USING (empresa_id = public.get_user_empresa_id(auth.uid()));

CREATE POLICY "Admins can manage own empresa stages"
  ON public.orbit_pipeline_stages FOR ALL TO authenticated
  USING (empresa_id = public.get_user_empresa_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

-- 4.6 orbit_deals
DROP POLICY IF EXISTS "Authenticated users can view deals" ON public.orbit_deals;
DROP POLICY IF EXISTS "Authenticated users can insert deals" ON public.orbit_deals;
DROP POLICY IF EXISTS "Authenticated users can update deals" ON public.orbit_deals;
DROP POLICY IF EXISTS "Authenticated users can delete deals" ON public.orbit_deals;

CREATE POLICY "Super admin can manage all deals"
  ON public.orbit_deals FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Users can view own empresa deals"
  ON public.orbit_deals FOR SELECT TO authenticated
  USING (empresa_id = public.get_user_empresa_id(auth.uid()));

CREATE POLICY "Users can insert own empresa deals"
  ON public.orbit_deals FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.get_user_empresa_id(auth.uid()));

CREATE POLICY "Users can update own empresa deals"
  ON public.orbit_deals FOR UPDATE TO authenticated
  USING (empresa_id = public.get_user_empresa_id(auth.uid()));

CREATE POLICY "Users can delete own empresa deals"
  ON public.orbit_deals FOR DELETE TO authenticated
  USING (empresa_id = public.get_user_empresa_id(auth.uid()));

-- 4.7 orbit_message_templates
DROP POLICY IF EXISTS "Authenticated users can view templates" ON public.orbit_message_templates;
DROP POLICY IF EXISTS "Authenticated users can manage templates" ON public.orbit_message_templates;

CREATE POLICY "Super admin can manage all templates"
  ON public.orbit_message_templates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Users can view own empresa templates"
  ON public.orbit_message_templates FOR SELECT TO authenticated
  USING (empresa_id = public.get_user_empresa_id(auth.uid()));

CREATE POLICY "Admins can manage own empresa templates"
  ON public.orbit_message_templates FOR ALL TO authenticated
  USING (empresa_id = public.get_user_empresa_id(auth.uid()) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'vendedor')));

-- 4.8 orbit_campaigns
DROP POLICY IF EXISTS "Authenticated users can view campaigns" ON public.orbit_campaigns;
DROP POLICY IF EXISTS "Authenticated users can manage campaigns" ON public.orbit_campaigns;

CREATE POLICY "Super admin can manage all campaigns"
  ON public.orbit_campaigns FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Users can view own empresa campaigns"
  ON public.orbit_campaigns FOR SELECT TO authenticated
  USING (empresa_id = public.get_user_empresa_id(auth.uid()));

CREATE POLICY "Users can manage own empresa campaigns"
  ON public.orbit_campaigns FOR ALL TO authenticated
  USING (empresa_id = public.get_user_empresa_id(auth.uid()));

-- 4.9 orbit_campaign_recipients
DROP POLICY IF EXISTS "Authenticated users can view recipients" ON public.orbit_campaign_recipients;
DROP POLICY IF EXISTS "Authenticated users can manage recipients" ON public.orbit_campaign_recipients;

CREATE POLICY "Super admin can manage all recipients"
  ON public.orbit_campaign_recipients FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Users can view own empresa recipients"
  ON public.orbit_campaign_recipients FOR SELECT TO authenticated
  USING (empresa_id = public.get_user_empresa_id(auth.uid()));

CREATE POLICY "Users can manage own empresa recipients"
  ON public.orbit_campaign_recipients FOR ALL TO authenticated
  USING (empresa_id = public.get_user_empresa_id(auth.uid()));

-- 4.10 orbit_distribuicao_config
DROP POLICY IF EXISTS "Authenticated users can view distribuicao" ON public.orbit_distribuicao_config;
DROP POLICY IF EXISTS "Authenticated users can manage distribuicao" ON public.orbit_distribuicao_config;

CREATE POLICY "Super admin can manage all distribuicao"
  ON public.orbit_distribuicao_config FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Users can view own empresa distribuicao"
  ON public.orbit_distribuicao_config FOR SELECT TO authenticated
  USING (empresa_id = public.get_user_empresa_id(auth.uid()));

CREATE POLICY "Admins can manage own empresa distribuicao"
  ON public.orbit_distribuicao_config FOR ALL TO authenticated
  USING (empresa_id = public.get_user_empresa_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

-- 4.11 orbit_ai_config
DROP POLICY IF EXISTS "Authenticated users can view ai_config" ON public.orbit_ai_config;
DROP POLICY IF EXISTS "Authenticated users can manage ai_config" ON public.orbit_ai_config;

CREATE POLICY "Super admin can manage all ai_config"
  ON public.orbit_ai_config FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Users can view own empresa ai_config"
  ON public.orbit_ai_config FOR SELECT TO authenticated
  USING (empresa_id = public.get_user_empresa_id(auth.uid()));

CREATE POLICY "Admins can manage own empresa ai_config"
  ON public.orbit_ai_config FOR ALL TO authenticated
  USING (empresa_id = public.get_user_empresa_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

-- 4.12 orbit_zapi_config
DROP POLICY IF EXISTS "Authenticated users can view zapi_config" ON public.orbit_zapi_config;
DROP POLICY IF EXISTS "Authenticated users can manage zapi_config" ON public.orbit_zapi_config;

CREATE POLICY "Super admin can manage all zapi_config"
  ON public.orbit_zapi_config FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Users can view own empresa zapi_config"
  ON public.orbit_zapi_config FOR SELECT TO authenticated
  USING (empresa_id = public.get_user_empresa_id(auth.uid()));

CREATE POLICY "Admins can manage own empresa zapi_config"
  ON public.orbit_zapi_config FOR ALL TO authenticated
  USING (empresa_id = public.get_user_empresa_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

-- 4.13 orbit_activities
DROP POLICY IF EXISTS "Authenticated users can view activities" ON public.orbit_activities;
DROP POLICY IF EXISTS "Authenticated users can manage activities" ON public.orbit_activities;

CREATE POLICY "Super admin can manage all activities"
  ON public.orbit_activities FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Users can view own empresa activities"
  ON public.orbit_activities FOR SELECT TO authenticated
  USING (empresa_id = public.get_user_empresa_id(auth.uid()));

CREATE POLICY "Users can manage own empresa activities"
  ON public.orbit_activities FOR ALL TO authenticated
  USING (empresa_id = public.get_user_empresa_id(auth.uid()));

-- 4.14 orbit_transferencias
DROP POLICY IF EXISTS "Authenticated users can view transferencias" ON public.orbit_transferencias;
DROP POLICY IF EXISTS "Authenticated users can manage transferencias" ON public.orbit_transferencias;

CREATE POLICY "Super admin can manage all transferencias"
  ON public.orbit_transferencias FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Users can view own empresa transferencias"
  ON public.orbit_transferencias FOR SELECT TO authenticated
  USING (empresa_id = public.get_user_empresa_id(auth.uid()));

CREATE POLICY "Users can manage own empresa transferencias"
  ON public.orbit_transferencias FOR ALL TO authenticated
  USING (empresa_id = public.get_user_empresa_id(auth.uid()));

-- 4.15 orbit_integrations_config
DROP POLICY IF EXISTS "Authenticated users can view integrations" ON public.orbit_integrations_config;
DROP POLICY IF EXISTS "Authenticated users can manage integrations" ON public.orbit_integrations_config;

CREATE POLICY "Super admin can manage all integrations"
  ON public.orbit_integrations_config FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Users can view own empresa integrations"
  ON public.orbit_integrations_config FOR SELECT TO authenticated
  USING (empresa_id = public.get_user_empresa_id(auth.uid()));

CREATE POLICY "Admins can manage own empresa integrations"
  ON public.orbit_integrations_config FOR ALL TO authenticated
  USING (empresa_id = public.get_user_empresa_id(auth.uid()) AND public.has_role(auth.uid(), 'admin'));

-- =============================================
-- FASE 5: TRIGGER UPDATED_AT PARA EMPRESAS
-- =============================================

CREATE TRIGGER update_orbit_empresas_updated_at
  BEFORE UPDATE ON public.orbit_empresas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================
-- FASE 6: ÍNDICES PARA PERFORMANCE
-- =============================================

CREATE INDEX idx_profiles_empresa_id ON public.profiles(empresa_id);
CREATE INDEX idx_orbit_prospects_empresa_id ON public.orbit_prospects(empresa_id);
CREATE INDEX idx_orbit_conversas_empresa_id ON public.orbit_conversas(empresa_id);
CREATE INDEX idx_orbit_deals_empresa_id ON public.orbit_deals(empresa_id);
CREATE INDEX idx_orbit_campaigns_empresa_id ON public.orbit_campaigns(empresa_id);
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_role ON public.user_roles(role);
