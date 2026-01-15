-- =============================================
-- ORBIT CRM - Estrutura Completa do Banco
-- =============================================

-- 1. Tabela de Perfis (usuários)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT,
  email TEXT,
  telefone TEXT,
  cargo TEXT,
  avatar_url TEXT,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Trigger para criar perfil automaticamente
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, nome)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2. Prospects
CREATE TABLE public.orbit_prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origem_contato TEXT DEFAULT 'PROSPECTS' CHECK (origem_contato IN ('PROSPECTS', 'PROMETHEUS', 'LEADFINDER', 'IMPORTACAO')),
  tipo TEXT DEFAULT 'pessoa' CHECK (tipo IN ('pessoa', 'empresa')),
  nome_razao TEXT NOT NULL,
  nome_fantasia TEXT,
  cnpj_cpf TEXT,
  email_principal TEXT,
  telefone_whatsapp TEXT,
  cidade TEXT,
  estado TEXT,
  segmento TEXT,
  origem_lead TEXT,
  observacoes TEXT,
  responsavel_id UUID REFERENCES public.profiles(id),
  status_qualificacao TEXT DEFAULT 'novo' CHECK (status_qualificacao IN ('novo', 'em_qualificacao', 'qualificado', 'desqualificado')),
  score INTEGER DEFAULT 0,
  tags TEXT[] DEFAULT '{}',
  consentimento_email BOOLEAN DEFAULT false,
  consentimento_whatsapp BOOLEAN DEFAULT false,
  optout_email BOOLEAN DEFAULT false,
  optout_whatsapp BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_prospect_telefone ON public.orbit_prospects(telefone_whatsapp) WHERE telefone_whatsapp IS NOT NULL;

ALTER TABLE public.orbit_prospects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view prospects" ON public.orbit_prospects
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert prospects" ON public.orbit_prospects
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update prospects" ON public.orbit_prospects
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete prospects" ON public.orbit_prospects
  FOR DELETE TO authenticated USING (true);

-- 3. Conversas
CREATE TABLE public.orbit_conversas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID REFERENCES public.orbit_prospects(id) ON DELETE CASCADE,
  telefone_whatsapp TEXT NOT NULL,
  canal TEXT DEFAULT 'whatsapp' CHECK (canal IN ('whatsapp', 'instagram', 'facebook', 'email')),
  status TEXT DEFAULT 'aberta' CHECK (status IN ('aberta', 'fechada')),
  human_talk BOOLEAN DEFAULT false,
  human_user_id UUID REFERENCES public.profiles(id),
  ultima_mensagem_at TIMESTAMPTZ,
  ultima_mensagem_preview TEXT,
  mensagens_nao_lidas INTEGER DEFAULT 0,
  ai_contexto JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.orbit_conversas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view conversas" ON public.orbit_conversas
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert conversas" ON public.orbit_conversas
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update conversas" ON public.orbit_conversas
  FOR UPDATE TO authenticated USING (true);

-- Habilitar realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.orbit_conversas;

-- 4. Mensagens
CREATE TABLE public.orbit_mensagens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversa_id UUID REFERENCES public.orbit_conversas(id) ON DELETE CASCADE,
  direcao TEXT NOT NULL CHECK (direcao IN ('IN', 'OUT')),
  mensagem TEXT,
  tipo_midia TEXT DEFAULT 'text',
  url_midia TEXT,
  provider_message_id TEXT,
  status TEXT DEFAULT 'enviada',
  erro TEXT,
  canal TEXT DEFAULT 'whatsapp',
  timestamp TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_mensagens_conversa ON public.orbit_mensagens(conversa_id);
CREATE INDEX idx_mensagens_provider ON public.orbit_mensagens(provider_message_id);

ALTER TABLE public.orbit_mensagens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view mensagens" ON public.orbit_mensagens
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert mensagens" ON public.orbit_mensagens
  FOR INSERT TO authenticated WITH CHECK (true);

-- Habilitar realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.orbit_mensagens;

-- 5. Pipeline Stages
CREATE TABLE public.orbit_pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  ordem INTEGER NOT NULL,
  cor TEXT DEFAULT '#3b82f6',
  is_won BOOLEAN DEFAULT false,
  is_lost BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.orbit_pipeline_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view pipeline stages" ON public.orbit_pipeline_stages
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage stages" ON public.orbit_pipeline_stages
  FOR ALL TO authenticated USING (true);

-- Inserir etapas default
INSERT INTO public.orbit_pipeline_stages (nome, ordem, cor, is_won, is_lost) VALUES
  ('Qualificação', 1, '#6366f1', false, false),
  ('Proposta', 2, '#8b5cf6', false, false),
  ('Negociação', 3, '#f59e0b', false, false),
  ('Fechamento', 4, '#10b981', false, false),
  ('Ganho', 5, '#22c55e', true, false),
  ('Perdido', 6, '#ef4444', false, true);

-- 6. Deals (Oportunidades)
CREATE TABLE public.orbit_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID REFERENCES public.orbit_prospects(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  valor_estimado NUMERIC(15,2),
  etapa_id UUID REFERENCES public.orbit_pipeline_stages(id),
  probabilidade INTEGER DEFAULT 50,
  data_prevista_fechamento DATE,
  motivo_perda TEXT,
  responsavel_id UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.orbit_deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view deals" ON public.orbit_deals
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert deals" ON public.orbit_deals
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can update deals" ON public.orbit_deals
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated users can delete deals" ON public.orbit_deals
  FOR DELETE TO authenticated USING (true);

-- 7. Message Templates
CREATE TABLE public.orbit_message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canal TEXT NOT NULL CHECK (canal IN ('whatsapp', 'email')),
  nome TEXT NOT NULL,
  categoria TEXT DEFAULT 'geral',
  assunto_email TEXT,
  corpo_html TEXT,
  corpo_texto TEXT,
  variaveis TEXT[] DEFAULT '{}',
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.orbit_message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view templates" ON public.orbit_message_templates
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage templates" ON public.orbit_message_templates
  FOR ALL TO authenticated USING (true);

-- 8. Campaigns
CREATE TABLE public.orbit_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canal TEXT NOT NULL CHECK (canal IN ('whatsapp', 'email')),
  nome TEXT NOT NULL,
  publico_origem TEXT DEFAULT 'prospects',
  filtros_json JSONB DEFAULT '{}',
  template_id UUID REFERENCES public.orbit_message_templates(id),
  status TEXT DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'agendada', 'enviando', 'concluida', 'pausada', 'cancelada', 'pendente_aprovacao', 'aprovada', 'reprovada')),
  agendada_para TIMESTAMPTZ,
  total_destinatarios INTEGER DEFAULT 0,
  enviados INTEGER DEFAULT 0,
  falhas INTEGER DEFAULT 0,
  aberturas INTEGER DEFAULT 0,
  cliques INTEGER DEFAULT 0,
  respostas INTEGER DEFAULT 0,
  aprovacao_status TEXT CHECK (aprovacao_status IN ('pendente', 'aprovada', 'reprovada')),
  aprovado_por UUID REFERENCES public.profiles(id),
  aprovado_em TIMESTAMPTZ,
  motivo_reprovacao TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.orbit_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view campaigns" ON public.orbit_campaigns
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage campaigns" ON public.orbit_campaigns
  FOR ALL TO authenticated USING (true);

-- 9. Campaign Recipients
CREATE TABLE public.orbit_campaign_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES public.orbit_campaigns(id) ON DELETE CASCADE,
  prospect_id UUID REFERENCES public.orbit_prospects(id),
  telefone TEXT,
  email TEXT,
  status TEXT DEFAULT 'pendente' CHECK (status IN ('pendente', 'enviado', 'falhou', 'entregue', 'lido', 'clicado', 'bounce', 'respondeu')),
  erro TEXT,
  enviado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.orbit_campaign_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view recipients" ON public.orbit_campaign_recipients
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage recipients" ON public.orbit_campaign_recipients
  FOR ALL TO authenticated USING (true);

-- 10. Distribuição Config
CREATE TABLE public.orbit_distribuicao_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vendedor_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  ativo BOOLEAN DEFAULT true,
  ordem_fila INTEGER DEFAULT 0,
  ultima_atribuicao TIMESTAMPTZ,
  total_atribuicoes INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.orbit_distribuicao_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view distribuicao" ON public.orbit_distribuicao_config
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage distribuicao" ON public.orbit_distribuicao_config
  FOR ALL TO authenticated USING (true);

-- 11. AI Config
CREATE TABLE public.orbit_ai_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_treinamento TEXT,
  tom_conversa TEXT DEFAULT 'profissional e amigável',
  modo_automatico BOOLEAN DEFAULT true,
  responder_fora_horario BOOLEAN DEFAULT false,
  horario_inicio TIME DEFAULT '08:00',
  horario_fim TIME DEFAULT '18:00',
  campos_cadastro TEXT[] DEFAULT ARRAY['nome_razao', 'nome_fantasia', 'email_principal', 'cidade', 'segmento'],
  mensagem_boas_vindas TEXT,
  mensagem_fora_horario TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.orbit_ai_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view ai_config" ON public.orbit_ai_config
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage ai_config" ON public.orbit_ai_config
  FOR ALL TO authenticated USING (true);

-- Inserir config default
INSERT INTO public.orbit_ai_config (prompt_treinamento, mensagem_boas_vindas, mensagem_fora_horario) VALUES (
  'Você é um assistente de vendas. Seu objetivo é qualificar leads e coletar informações para a equipe comercial. Seja cordial e objetivo.',
  'Olá! 👋 Bem-vindo! Como posso ajudá-lo hoje?',
  'Olá! Nosso horário de atendimento é das 08h às 18h. Deixe sua mensagem que retornaremos assim que possível!'
);

-- 12. Z-API Config
CREATE TABLE public.orbit_zapi_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id TEXT,
  token TEXT,
  client_token TEXT,
  ativo BOOLEAN DEFAULT false,
  webhook_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.orbit_zapi_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view zapi_config" ON public.orbit_zapi_config
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage zapi_config" ON public.orbit_zapi_config
  FOR ALL TO authenticated USING (true);

-- 13. Activities
CREATE TABLE public.orbit_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID REFERENCES public.orbit_prospects(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES public.orbit_deals(id) ON DELETE SET NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('ligacao', 'email', 'reuniao', 'tarefa', 'nota', 'whatsapp')),
  assunto TEXT NOT NULL,
  descricao TEXT,
  data_atividade TIMESTAMPTZ DEFAULT now(),
  concluida BOOLEAN DEFAULT false,
  responsavel_id UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.orbit_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view activities" ON public.orbit_activities
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage activities" ON public.orbit_activities
  FOR ALL TO authenticated USING (true);

-- 14. Transferências
CREATE TABLE public.orbit_transferencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID REFERENCES public.orbit_prospects(id) ON DELETE CASCADE,
  de_vendedor_id UUID REFERENCES public.profiles(id),
  para_vendedor_id UUID REFERENCES public.profiles(id),
  motivo TEXT,
  notificacao_enviada BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.orbit_transferencias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view transferencias" ON public.orbit_transferencias
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage transferencias" ON public.orbit_transferencias
  FOR ALL TO authenticated USING (true);

-- 15. Integrations Config (Meta, Resend, Apollo)
CREATE TABLE public.orbit_integrations_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN ('meta', 'resend', 'apollo')),
  config_json JSONB DEFAULT '{}',
  ativo BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.orbit_integrations_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view integrations" ON public.orbit_integrations_config
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage integrations" ON public.orbit_integrations_config
  FOR ALL TO authenticated USING (true);

-- Função para atualizar updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers de updated_at
CREATE TRIGGER update_orbit_prospects_updated_at
  BEFORE UPDATE ON public.orbit_prospects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_orbit_conversas_updated_at
  BEFORE UPDATE ON public.orbit_conversas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_orbit_deals_updated_at
  BEFORE UPDATE ON public.orbit_deals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_orbit_message_templates_updated_at
  BEFORE UPDATE ON public.orbit_message_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_orbit_campaigns_updated_at
  BEFORE UPDATE ON public.orbit_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_orbit_ai_config_updated_at
  BEFORE UPDATE ON public.orbit_ai_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_orbit_zapi_config_updated_at
  BEFORE UPDATE ON public.orbit_zapi_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();