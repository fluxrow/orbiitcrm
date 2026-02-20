
-- ============================================================
-- Etapa 3A: Pipeline de Turismo Corporativo
-- ============================================================

-- Helper function: check if user is sales or sdr
CREATE OR REPLACE FUNCTION public.pe_user_is_sales_or_sdr(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pe_users u
    JOIN public.pe_roles r ON r.id = u.role_id
    WHERE u.id = p_user_id
      AND r.code IN ('ORG_SALES', 'ORG_SDR')
  )
$$;

-- ============================================================
-- 1) produtos
-- ============================================================
CREATE TABLE public.produtos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  nome text NOT NULL,
  codigo text NOT NULL,
  categoria text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, codigo)
);

CREATE INDEX idx_produtos_org ON public.produtos(organization_id);
CREATE INDEX idx_produtos_org_cat ON public.produtos(organization_id, categoria);

ALTER TABLE public.produtos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin full access produtos" ON public.produtos FOR ALL USING (pe_is_super_admin(auth.uid()));
CREATE POLICY "Org members can view produtos" ON public.produtos FOR SELECT USING (pe_get_user_org_id(auth.uid()) = organization_id);
CREATE POLICY "Writers can insert produtos" ON public.produtos FOR INSERT WITH CHECK (pe_user_can_write(auth.uid(), organization_id));
CREATE POLICY "Writers can update produtos" ON public.produtos FOR UPDATE USING (pe_user_can_write(auth.uid(), organization_id));
CREATE POLICY "Writers can delete produtos" ON public.produtos FOR DELETE USING (pe_user_can_write(auth.uid(), organization_id));

CREATE TRIGGER update_produtos_updated_at BEFORE UPDATE ON public.produtos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 2) funil_etapas
-- ============================================================
CREATE TABLE public.funil_etapas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  nome text NOT NULL,
  ordem int NOT NULL,
  tipo text NOT NULL DEFAULT 'open',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, ordem),
  UNIQUE(organization_id, nome)
);

CREATE INDEX idx_funil_etapas_org ON public.funil_etapas(organization_id);
CREATE INDEX idx_funil_etapas_ordem ON public.funil_etapas(ordem);

ALTER TABLE public.funil_etapas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin full access funil_etapas" ON public.funil_etapas FOR ALL USING (pe_is_super_admin(auth.uid()));
CREATE POLICY "Org members can view funil_etapas" ON public.funil_etapas FOR SELECT USING (pe_get_user_org_id(auth.uid()) = organization_id);
CREATE POLICY "Writers can insert funil_etapas" ON public.funil_etapas FOR INSERT WITH CHECK (pe_user_can_write(auth.uid(), organization_id));
CREATE POLICY "Writers can update funil_etapas" ON public.funil_etapas FOR UPDATE USING (pe_user_can_write(auth.uid(), organization_id));
CREATE POLICY "Writers can delete funil_etapas" ON public.funil_etapas FOR DELETE USING (pe_user_can_write(auth.uid(), organization_id));

CREATE TRIGGER update_funil_etapas_updated_at BEFORE UPDATE ON public.funil_etapas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 3) oportunidades
-- ============================================================
CREATE TABLE public.oportunidades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id),
  etapa_id uuid NOT NULL REFERENCES public.funil_etapas(id),
  owner_user_id uuid NOT NULL REFERENCES public.pe_users(id),
  created_by_user_id uuid NOT NULL REFERENCES public.pe_users(id),
  titulo text NOT NULL,
  destino text,
  data_ida date,
  data_volta date,
  viajantes_qtd int,
  valor_total_estimado numeric,
  probabilidade int NOT NULL DEFAULT 10,
  status text NOT NULL DEFAULT 'open',
  motivo_perda text,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Validation trigger for probabilidade and status (instead of CHECK constraints)
CREATE OR REPLACE FUNCTION public.validate_oportunidade()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.probabilidade < 0 OR NEW.probabilidade > 100 THEN
    RAISE EXCEPTION 'probabilidade must be between 0 and 100';
  END IF;
  IF NEW.status NOT IN ('open', 'won', 'lost') THEN
    RAISE EXCEPTION 'status must be open, won, or lost';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_oportunidade_trigger BEFORE INSERT OR UPDATE ON public.oportunidades FOR EACH ROW EXECUTE FUNCTION public.validate_oportunidade();

CREATE INDEX idx_oportunidades_org ON public.oportunidades(organization_id);
CREATE INDEX idx_oportunidades_cliente ON public.oportunidades(cliente_id);
CREATE INDEX idx_oportunidades_etapa ON public.oportunidades(etapa_id);
CREATE INDEX idx_oportunidades_owner ON public.oportunidades(owner_user_id);
CREATE INDEX idx_oportunidades_status ON public.oportunidades(status);
CREATE INDEX idx_oportunidades_data_ida ON public.oportunidades(data_ida);
CREATE INDEX idx_oportunidades_data_volta ON public.oportunidades(data_volta);

ALTER TABLE public.oportunidades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin full access oportunidades" ON public.oportunidades FOR ALL USING (pe_is_super_admin(auth.uid()));
CREATE POLICY "Org members can view oportunidades" ON public.oportunidades FOR SELECT USING (pe_get_user_org_id(auth.uid()) = organization_id);
CREATE POLICY "Writers can insert oportunidades" ON public.oportunidades FOR INSERT WITH CHECK (pe_user_can_write(auth.uid(), organization_id));
CREATE POLICY "Writers can update oportunidades" ON public.oportunidades FOR UPDATE USING (pe_user_can_write(auth.uid(), organization_id));
CREATE POLICY "Writers can delete oportunidades" ON public.oportunidades FOR DELETE USING (pe_user_can_write(auth.uid(), organization_id));
CREATE POLICY "Sales can insert own oportunidades" ON public.oportunidades FOR INSERT WITH CHECK (pe_user_is_sales_or_sdr(auth.uid()) AND pe_get_user_org_id(auth.uid()) = organization_id AND owner_user_id = auth.uid());
CREATE POLICY "Sales can update own oportunidades" ON public.oportunidades FOR UPDATE USING (pe_user_is_sales_or_sdr(auth.uid()) AND pe_get_user_org_id(auth.uid()) = organization_id AND owner_user_id = auth.uid());
CREATE POLICY "Sales can delete own oportunidades" ON public.oportunidades FOR DELETE USING (pe_user_is_sales_or_sdr(auth.uid()) AND pe_get_user_org_id(auth.uid()) = organization_id AND owner_user_id = auth.uid());

CREATE TRIGGER update_oportunidades_updated_at BEFORE UPDATE ON public.oportunidades FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 4) oportunidade_itens
-- ============================================================
CREATE TABLE public.oportunidade_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  oportunidade_id uuid NOT NULL REFERENCES public.oportunidades(id) ON DELETE CASCADE,
  produto_id uuid NOT NULL REFERENCES public.produtos(id),
  descricao text,
  quantidade int NOT NULL DEFAULT 1,
  valor_unitario numeric,
  valor_total numeric,
  status text NOT NULL DEFAULT 'open',
  fornecedor text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.validate_oportunidade_item()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status NOT IN ('open', 'confirmed', 'canceled') THEN
    RAISE EXCEPTION 'status must be open, confirmed, or canceled';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_oportunidade_item_trigger BEFORE INSERT OR UPDATE ON public.oportunidade_itens FOR EACH ROW EXECUTE FUNCTION public.validate_oportunidade_item();

CREATE INDEX idx_oportunidade_itens_org ON public.oportunidade_itens(organization_id);
CREATE INDEX idx_oportunidade_itens_oport ON public.oportunidade_itens(oportunidade_id);
CREATE INDEX idx_oportunidade_itens_produto ON public.oportunidade_itens(produto_id);
CREATE INDEX idx_oportunidade_itens_status ON public.oportunidade_itens(status);

ALTER TABLE public.oportunidade_itens ENABLE ROW LEVEL SECURITY;

-- Itens follow the same access as the parent oportunidade
CREATE POLICY "Super admin full access oportunidade_itens" ON public.oportunidade_itens FOR ALL USING (pe_is_super_admin(auth.uid()));
CREATE POLICY "Org members can view oportunidade_itens" ON public.oportunidade_itens FOR SELECT USING (pe_get_user_org_id(auth.uid()) = organization_id);
CREATE POLICY "Writers can insert oportunidade_itens" ON public.oportunidade_itens FOR INSERT WITH CHECK (pe_user_can_write(auth.uid(), organization_id));
CREATE POLICY "Writers can update oportunidade_itens" ON public.oportunidade_itens FOR UPDATE USING (pe_user_can_write(auth.uid(), organization_id));
CREATE POLICY "Writers can delete oportunidade_itens" ON public.oportunidade_itens FOR DELETE USING (pe_user_can_write(auth.uid(), organization_id));
CREATE POLICY "Sales can insert own oportunidade_itens" ON public.oportunidade_itens FOR INSERT WITH CHECK (
  pe_user_is_sales_or_sdr(auth.uid()) AND pe_get_user_org_id(auth.uid()) = organization_id
  AND EXISTS (SELECT 1 FROM public.oportunidades o WHERE o.id = oportunidade_id AND o.owner_user_id = auth.uid())
);
CREATE POLICY "Sales can update own oportunidade_itens" ON public.oportunidade_itens FOR UPDATE USING (
  pe_user_is_sales_or_sdr(auth.uid()) AND pe_get_user_org_id(auth.uid()) = organization_id
  AND EXISTS (SELECT 1 FROM public.oportunidades o WHERE o.id = oportunidade_id AND o.owner_user_id = auth.uid())
);
CREATE POLICY "Sales can delete own oportunidade_itens" ON public.oportunidade_itens FOR DELETE USING (
  pe_user_is_sales_or_sdr(auth.uid()) AND pe_get_user_org_id(auth.uid()) = organization_id
  AND EXISTS (SELECT 1 FROM public.oportunidades o WHERE o.id = oportunidade_id AND o.owner_user_id = auth.uid())
);

CREATE TRIGGER update_oportunidade_itens_updated_at BEFORE UPDATE ON public.oportunidade_itens FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 5) interacoes
-- ============================================================
CREATE TABLE public.interacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  oportunidade_id uuid REFERENCES public.oportunidades(id),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id),
  contato_id uuid REFERENCES public.contatos(id),
  user_id uuid NOT NULL REFERENCES public.pe_users(id),
  tipo text NOT NULL,
  resumo text NOT NULL,
  data_interacao timestamptz NOT NULL DEFAULT now(),
  proxima_acao text,
  data_followup date,
  anexos jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_interacoes_org ON public.interacoes(organization_id);
CREATE INDEX idx_interacoes_cliente ON public.interacoes(cliente_id);
CREATE INDEX idx_interacoes_oport ON public.interacoes(oportunidade_id);
CREATE INDEX idx_interacoes_user ON public.interacoes(user_id);
CREATE INDEX idx_interacoes_data ON public.interacoes(data_interacao);
CREATE INDEX idx_interacoes_followup ON public.interacoes(data_followup);

ALTER TABLE public.interacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin full access interacoes" ON public.interacoes FOR ALL USING (pe_is_super_admin(auth.uid()));
CREATE POLICY "Org members can view interacoes" ON public.interacoes FOR SELECT USING (pe_get_user_org_id(auth.uid()) = organization_id);
CREATE POLICY "Writers can insert interacoes" ON public.interacoes FOR INSERT WITH CHECK (pe_user_can_write(auth.uid(), organization_id));
CREATE POLICY "Writers can update interacoes" ON public.interacoes FOR UPDATE USING (pe_user_can_write(auth.uid(), organization_id));
CREATE POLICY "Writers can delete interacoes" ON public.interacoes FOR DELETE USING (pe_user_can_write(auth.uid(), organization_id));
CREATE POLICY "Sales can insert own interacoes" ON public.interacoes FOR INSERT WITH CHECK (pe_user_is_sales_or_sdr(auth.uid()) AND pe_get_user_org_id(auth.uid()) = organization_id AND user_id = auth.uid());
CREATE POLICY "Sales can update own interacoes" ON public.interacoes FOR UPDATE USING (pe_user_is_sales_or_sdr(auth.uid()) AND pe_get_user_org_id(auth.uid()) = organization_id AND user_id = auth.uid());
CREATE POLICY "Sales can delete own interacoes" ON public.interacoes FOR DELETE USING (pe_user_is_sales_or_sdr(auth.uid()) AND pe_get_user_org_id(auth.uid()) = organization_id AND user_id = auth.uid());

CREATE TRIGGER update_interacoes_updated_at BEFORE UPDATE ON public.interacoes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- 6) tarefas
-- ============================================================
CREATE TABLE public.tarefas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  oportunidade_id uuid REFERENCES public.oportunidades(id),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id),
  contato_id uuid REFERENCES public.contatos(id),
  assigned_to_user_id uuid NOT NULL REFERENCES public.pe_users(id),
  created_by_user_id uuid NOT NULL REFERENCES public.pe_users(id),
  titulo text NOT NULL,
  descricao text,
  prioridade text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'open',
  due_date date,
  done_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.validate_tarefa()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status NOT IN ('open', 'done', 'canceled') THEN
    RAISE EXCEPTION 'status must be open, done, or canceled';
  END IF;
  IF NEW.prioridade NOT IN ('low', 'normal', 'high') THEN
    RAISE EXCEPTION 'prioridade must be low, normal, or high';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_tarefa_trigger BEFORE INSERT OR UPDATE ON public.tarefas FOR EACH ROW EXECUTE FUNCTION public.validate_tarefa();

CREATE INDEX idx_tarefas_org ON public.tarefas(organization_id);
CREATE INDEX idx_tarefas_assigned ON public.tarefas(assigned_to_user_id);
CREATE INDEX idx_tarefas_status ON public.tarefas(status);
CREATE INDEX idx_tarefas_due ON public.tarefas(due_date);
CREATE INDEX idx_tarefas_cliente ON public.tarefas(cliente_id);
CREATE INDEX idx_tarefas_oport ON public.tarefas(oportunidade_id);

ALTER TABLE public.tarefas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin full access tarefas" ON public.tarefas FOR ALL USING (pe_is_super_admin(auth.uid()));
CREATE POLICY "Org members can view tarefas" ON public.tarefas FOR SELECT USING (pe_get_user_org_id(auth.uid()) = organization_id);
CREATE POLICY "Writers can insert tarefas" ON public.tarefas FOR INSERT WITH CHECK (pe_user_can_write(auth.uid(), organization_id));
CREATE POLICY "Writers can update tarefas" ON public.tarefas FOR UPDATE USING (pe_user_can_write(auth.uid(), organization_id));
CREATE POLICY "Writers can delete tarefas" ON public.tarefas FOR DELETE USING (pe_user_can_write(auth.uid(), organization_id));
CREATE POLICY "Sales can insert own tarefas" ON public.tarefas FOR INSERT WITH CHECK (pe_user_is_sales_or_sdr(auth.uid()) AND pe_get_user_org_id(auth.uid()) = organization_id AND assigned_to_user_id = auth.uid());
CREATE POLICY "Sales can update own tarefas" ON public.tarefas FOR UPDATE USING (pe_user_is_sales_or_sdr(auth.uid()) AND pe_get_user_org_id(auth.uid()) = organization_id AND assigned_to_user_id = auth.uid());
CREATE POLICY "Sales can delete own tarefas" ON public.tarefas FOR DELETE USING (pe_user_is_sales_or_sdr(auth.uid()) AND pe_get_user_org_id(auth.uid()) = organization_id AND assigned_to_user_id = auth.uid());

CREATE TRIGGER update_tarefas_updated_at BEFORE UPDATE ON public.tarefas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
