
-- =============================================
-- FASE 1: Fix constraint chk_super_admin_role
-- =============================================
ALTER TABLE public.pe_users DROP CONSTRAINT IF EXISTS chk_super_admin_role;
ALTER TABLE public.pe_users ADD CONSTRAINT chk_super_admin_role
  CHECK (
    (is_super_admin = true AND role_id IS NULL)
    OR
    (is_super_admin = false)
  );

-- =============================================
-- FASE 2: Helper function pe_user_can_write
-- =============================================
CREATE OR REPLACE FUNCTION public.pe_user_can_write(p_user_id uuid, p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT
    pe_is_super_admin(p_user_id)
    OR EXISTS (
      SELECT 1 FROM public.pe_users u
      JOIN public.pe_roles r ON r.id = u.role_id
      WHERE u.id = p_user_id
        AND u.organization_id = p_org_id
        AND r.code IN ('ORG_ADMIN', 'ORG_MANAGER')
    )
$$;

-- =============================================
-- TABLE 1: segmentos
-- =============================================
CREATE TABLE public.segmentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  macro text NOT NULL,
  micro text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.segmentos ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX idx_segmentos_org_macro_micro ON public.segmentos (organization_id, macro, COALESCE(micro, ''));
CREATE INDEX idx_segmentos_org ON public.segmentos (organization_id);
CREATE INDEX idx_segmentos_macro ON public.segmentos (macro);

CREATE TRIGGER update_segmentos_updated_at BEFORE UPDATE ON public.segmentos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Super admin full access segmentos" ON public.segmentos FOR ALL USING (pe_is_super_admin(auth.uid()));
CREATE POLICY "Org members can view segmentos" ON public.segmentos FOR SELECT USING (pe_get_user_org_id(auth.uid()) = organization_id);
CREATE POLICY "Writers can insert segmentos" ON public.segmentos FOR INSERT WITH CHECK (pe_user_can_write(auth.uid(), organization_id));
CREATE POLICY "Writers can update segmentos" ON public.segmentos FOR UPDATE USING (pe_user_can_write(auth.uid(), organization_id));
CREATE POLICY "Writers can delete segmentos" ON public.segmentos FOR DELETE USING (pe_user_can_write(auth.uid(), organization_id));

-- =============================================
-- TABLE 2: origens
-- =============================================
CREATE TABLE public.origens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descricao text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.origens ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX idx_origens_org_nome ON public.origens (organization_id, nome);
CREATE INDEX idx_origens_org ON public.origens (organization_id);

CREATE TRIGGER update_origens_updated_at BEFORE UPDATE ON public.origens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Super admin full access origens" ON public.origens FOR ALL USING (pe_is_super_admin(auth.uid()));
CREATE POLICY "Org members can view origens" ON public.origens FOR SELECT USING (pe_get_user_org_id(auth.uid()) = organization_id);
CREATE POLICY "Writers can insert origens" ON public.origens FOR INSERT WITH CHECK (pe_user_can_write(auth.uid(), organization_id));
CREATE POLICY "Writers can update origens" ON public.origens FOR UPDATE USING (pe_user_can_write(auth.uid(), organization_id));
CREATE POLICY "Writers can delete origens" ON public.origens FOR DELETE USING (pe_user_can_write(auth.uid(), organization_id));

-- =============================================
-- TABLE 3: clientes
-- =============================================
CREATE TABLE public.clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  razao_social text NOT NULL,
  nome_fantasia text,
  cnpj text,
  site text,
  razao_social_normalizada text NOT NULL,
  dominio_principal text,
  segmento_id uuid REFERENCES public.segmentos(id) ON DELETE SET NULL,
  porte text,
  cidade text,
  uf text,
  status_geral text NOT NULL DEFAULT 'ativo',
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX idx_clientes_org_cnpj ON public.clientes (organization_id, cnpj) WHERE cnpj IS NOT NULL;
CREATE INDEX idx_clientes_org ON public.clientes (organization_id);
CREATE INDEX idx_clientes_segmento ON public.clientes (segmento_id);
CREATE INDEX idx_clientes_dominio ON public.clientes (dominio_principal);
CREATE INDEX idx_clientes_razao_norm ON public.clientes (razao_social_normalizada);
CREATE INDEX idx_clientes_cidade_uf ON public.clientes (cidade, uf);
CREATE INDEX idx_clientes_dedupe ON public.clientes (organization_id, razao_social_normalizada, cidade, uf);

CREATE TRIGGER update_clientes_updated_at BEFORE UPDATE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Super admin full access clientes" ON public.clientes FOR ALL USING (pe_is_super_admin(auth.uid()));
CREATE POLICY "Org members can view clientes" ON public.clientes FOR SELECT USING (pe_get_user_org_id(auth.uid()) = organization_id);
CREATE POLICY "Writers can insert clientes" ON public.clientes FOR INSERT WITH CHECK (pe_user_can_write(auth.uid(), organization_id));
CREATE POLICY "Writers can update clientes" ON public.clientes FOR UPDATE USING (pe_user_can_write(auth.uid(), organization_id));
CREATE POLICY "Writers can delete clientes" ON public.clientes FOR DELETE USING (pe_user_can_write(auth.uid(), organization_id));

-- =============================================
-- TABLE 4: contatos
-- =============================================
CREATE TABLE public.contatos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  nome text NOT NULL,
  cargo text,
  area text,
  email text,
  email_normalizado text,
  telefone text,
  whatsapp text,
  decisor boolean NOT NULL DEFAULT false,
  nivel_influencia integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contatos ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX idx_contatos_org_email ON public.contatos (organization_id, email_normalizado) WHERE email_normalizado IS NOT NULL;
CREATE INDEX idx_contatos_org ON public.contatos (organization_id);
CREATE INDEX idx_contatos_cliente ON public.contatos (cliente_id);
CREATE INDEX idx_contatos_decisor ON public.contatos (decisor);
CREATE INDEX idx_contatos_email_norm ON public.contatos (email_normalizado);
CREATE INDEX idx_contatos_whatsapp ON public.contatos (whatsapp);

CREATE TRIGGER update_contatos_updated_at BEFORE UPDATE ON public.contatos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Super admin full access contatos" ON public.contatos FOR ALL USING (pe_is_super_admin(auth.uid()));
CREATE POLICY "Org members can view contatos" ON public.contatos FOR SELECT USING (pe_get_user_org_id(auth.uid()) = organization_id);
CREATE POLICY "Writers can insert contatos" ON public.contatos FOR INSERT WITH CHECK (pe_user_can_write(auth.uid(), organization_id));
CREATE POLICY "Writers can update contatos" ON public.contatos FOR UPDATE USING (pe_user_can_write(auth.uid(), organization_id));
CREATE POLICY "Writers can delete contatos" ON public.contatos FOR DELETE USING (pe_user_can_write(auth.uid(), organization_id));

-- =============================================
-- TABLE 5: cliente_origem
-- =============================================
CREATE TABLE public.cliente_origem (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  cliente_id uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  origem_id uuid NOT NULL REFERENCES public.origens(id) ON DELETE CASCADE,
  lista text,
  data_importacao timestamptz NOT NULL DEFAULT now(),
  observacao text
);

ALTER TABLE public.cliente_origem ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX idx_cliente_origem_unique ON public.cliente_origem (organization_id, cliente_id, origem_id);
CREATE INDEX idx_cliente_origem_org ON public.cliente_origem (organization_id);
CREATE INDEX idx_cliente_origem_cliente ON public.cliente_origem (cliente_id);
CREATE INDEX idx_cliente_origem_origem ON public.cliente_origem (origem_id);
CREATE INDEX idx_cliente_origem_data ON public.cliente_origem (data_importacao);

CREATE POLICY "Super admin full access cliente_origem" ON public.cliente_origem FOR ALL USING (pe_is_super_admin(auth.uid()));
CREATE POLICY "Org members can view cliente_origem" ON public.cliente_origem FOR SELECT USING (pe_get_user_org_id(auth.uid()) = organization_id);
CREATE POLICY "Writers can insert cliente_origem" ON public.cliente_origem FOR INSERT WITH CHECK (pe_user_can_write(auth.uid(), organization_id));
CREATE POLICY "Writers can update cliente_origem" ON public.cliente_origem FOR UPDATE USING (pe_user_can_write(auth.uid(), organization_id));
CREATE POLICY "Writers can delete cliente_origem" ON public.cliente_origem FOR DELETE USING (pe_user_can_write(auth.uid(), organization_id));
