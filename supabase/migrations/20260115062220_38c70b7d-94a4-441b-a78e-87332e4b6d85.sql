-- 1. Fontes de Leads (Apollo, LinkedIn, Manual, CSV)
CREATE TABLE public.orbit_lead_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES orbit_empresas(id),
  nome TEXT NOT NULL,
  tipo TEXT NOT NULL, -- 'apollo', 'linkedin', 'manual', 'csv'
  config JSONB DEFAULT '{}'::jsonb,
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. ICPs - Perfis de Cliente Ideal
CREATE TABLE public.orbit_icps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES orbit_empresas(id),
  nome TEXT NOT NULL,
  filtros JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Buscas de Leads
CREATE TABLE public.orbit_lead_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES orbit_empresas(id),
  source_id UUID REFERENCES orbit_lead_sources(id),
  icp_id UUID REFERENCES orbit_icps(id),
  nome TEXT NOT NULL,
  filtros JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'pendente',
  leads_encontrados INTEGER DEFAULT 0,
  leads_importados INTEGER DEFAULT 0,
  observacoes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  executed_at TIMESTAMPTZ
);

-- 4. Leads Encontrados (pipeline antes de virar prospect)
CREATE TABLE public.orbit_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES orbit_empresas(id),
  search_id UUID REFERENCES orbit_lead_searches(id),
  nome TEXT,
  cargo TEXT,
  empresa_nome TEXT,
  empresa_linkedin TEXT,
  email TEXT,
  telefone TEXT,
  linkedin_url TEXT,
  pais TEXT,
  estado TEXT,
  cidade TEXT,
  score INTEGER DEFAULT 0,
  status TEXT DEFAULT 'novo',
  dados_raw JSONB DEFAULT '{}'::jsonb,
  enrichment_status TEXT DEFAULT 'pendente',
  enrichment_tentativas INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Política de Enrichment
CREATE TABLE public.orbit_enrichment_policy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES orbit_empresas(id) UNIQUE,
  ativa BOOLEAN DEFAULT true,
  limite_diario INTEGER DEFAULT 1000,
  limite_por_job INTEGER DEFAULT 100,
  tentativas_por_lead INTEGER DEFAULT 3,
  cooldown_horas INTEGER DEFAULT 24,
  status_permitidos TEXT[] DEFAULT ARRAY['aprovado', 'novo'],
  custo_email INTEGER DEFAULT 1,
  custo_telefone INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Jobs de Enrichment
CREATE TABLE public.orbit_enrichment_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES orbit_empresas(id),
  tipo TEXT DEFAULT 'individual',
  status TEXT DEFAULT 'pendente',
  total_leads INTEGER DEFAULT 0,
  processados INTEGER DEFAULT 0,
  sucesso INTEGER DEFAULT 0,
  falhas INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- 7. Fila de Enrichment
CREATE TABLE public.orbit_enrichment_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES orbit_empresas(id),
  lead_id UUID REFERENCES orbit_leads(id),
  job_id UUID REFERENCES orbit_enrichment_jobs(id),
  prioridade INTEGER DEFAULT 0,
  status TEXT DEFAULT 'aguardando',
  motivo_skip TEXT,
  erro TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ
);

-- 8. Uso de Créditos
CREATE TABLE public.orbit_enrichment_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES orbit_empresas(id),
  data DATE DEFAULT CURRENT_DATE,
  creditos_usados INTEGER DEFAULT 0,
  creditos_limite INTEGER DEFAULT 1000,
  UNIQUE(empresa_id, data)
);

-- Enable RLS
ALTER TABLE orbit_lead_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE orbit_icps ENABLE ROW LEVEL SECURITY;
ALTER TABLE orbit_lead_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE orbit_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE orbit_enrichment_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE orbit_enrichment_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE orbit_enrichment_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE orbit_enrichment_credits ENABLE ROW LEVEL SECURITY;

-- RLS Policies for orbit_lead_sources
CREATE POLICY "Super admin can manage all lead_sources" ON orbit_lead_sources FOR ALL USING (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Users can manage own empresa lead_sources" ON orbit_lead_sources FOR ALL USING (empresa_id = get_user_empresa_id(auth.uid()));

-- RLS Policies for orbit_icps
CREATE POLICY "Super admin can manage all icps" ON orbit_icps FOR ALL USING (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Users can manage own empresa icps" ON orbit_icps FOR ALL USING (empresa_id = get_user_empresa_id(auth.uid()));

-- RLS Policies for orbit_lead_searches
CREATE POLICY "Super admin can manage all lead_searches" ON orbit_lead_searches FOR ALL USING (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Users can manage own empresa lead_searches" ON orbit_lead_searches FOR ALL USING (empresa_id = get_user_empresa_id(auth.uid()));

-- RLS Policies for orbit_leads
CREATE POLICY "Super admin can manage all leads" ON orbit_leads FOR ALL USING (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Users can manage own empresa leads" ON orbit_leads FOR ALL USING (empresa_id = get_user_empresa_id(auth.uid()));

-- RLS Policies for orbit_enrichment_policy
CREATE POLICY "Super admin can manage all enrichment_policy" ON orbit_enrichment_policy FOR ALL USING (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Users can manage own empresa enrichment_policy" ON orbit_enrichment_policy FOR ALL USING (empresa_id = get_user_empresa_id(auth.uid()));

-- RLS Policies for orbit_enrichment_jobs
CREATE POLICY "Super admin can manage all enrichment_jobs" ON orbit_enrichment_jobs FOR ALL USING (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Users can manage own empresa enrichment_jobs" ON orbit_enrichment_jobs FOR ALL USING (empresa_id = get_user_empresa_id(auth.uid()));

-- RLS Policies for orbit_enrichment_queue
CREATE POLICY "Super admin can manage all enrichment_queue" ON orbit_enrichment_queue FOR ALL USING (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Users can manage own empresa enrichment_queue" ON orbit_enrichment_queue FOR ALL USING (empresa_id = get_user_empresa_id(auth.uid()));

-- RLS Policies for orbit_enrichment_credits
CREATE POLICY "Super admin can manage all enrichment_credits" ON orbit_enrichment_credits FOR ALL USING (has_role(auth.uid(), 'super_admin'::app_role));
CREATE POLICY "Users can manage own empresa enrichment_credits" ON orbit_enrichment_credits FOR ALL USING (empresa_id = get_user_empresa_id(auth.uid()));