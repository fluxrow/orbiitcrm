-- Tabela para histórico de importações
CREATE TABLE public.orbit_import_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id UUID REFERENCES public.orbit_empresas(id),
  arquivo_nome TEXT NOT NULL,
  total_registros INTEGER DEFAULT 0,
  sucesso INTEGER DEFAULT 0,
  erros INTEGER DEFAULT 0,
  detalhes_erros JSONB DEFAULT '[]'::jsonb,
  importado_por UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.orbit_import_history ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own empresa import history"
ON public.orbit_import_history FOR SELECT
USING (empresa_id = get_user_empresa_id(auth.uid()));

CREATE POLICY "Users can insert own empresa import history"
ON public.orbit_import_history FOR INSERT
WITH CHECK (empresa_id = get_user_empresa_id(auth.uid()));

CREATE POLICY "Super admin can manage all import history"
ON public.orbit_import_history FOR ALL
USING (has_role(auth.uid(), 'super_admin'::app_role));