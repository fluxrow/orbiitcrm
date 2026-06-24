
-- ETAPA 1: Pipeline configurável por cliente + templates (aditivo, sem breaking changes)

-- 1) Enriquecer orbit_pipeline_stages com campos opcionais
ALTER TABLE public.orbit_pipeline_stages
  ADD COLUMN IF NOT EXISTS descricao text,
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS probabilidade_default integer CHECK (probabilidade_default IS NULL OR (probabilidade_default >= 0 AND probabilidade_default <= 100)),
  ADD COLUMN IF NOT EXISTS sla_dias integer,
  ADD COLUMN IF NOT EXISTS requer_motivo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS automacoes_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ai_config jsonb,
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_orbit_pipeline_stages_updated_at ON public.orbit_pipeline_stages;
CREATE TRIGGER trg_orbit_pipeline_stages_updated_at
  BEFORE UPDATE ON public.orbit_pipeline_stages
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Templates de pipeline (sistema + por empresa)
CREATE TABLE IF NOT EXISTS public.orbit_pipeline_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid REFERENCES public.orbit_empresas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descricao text,
  vertical text,
  stages jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.orbit_pipeline_templates TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.orbit_pipeline_templates TO authenticated;
GRANT ALL ON public.orbit_pipeline_templates TO service_role;

ALTER TABLE public.orbit_pipeline_templates ENABLE ROW LEVEL SECURITY;

-- Read: system templates OR own empresa templates
CREATE POLICY "view pipeline templates"
  ON public.orbit_pipeline_templates FOR SELECT TO authenticated
  USING (
    is_system = true
    OR has_role(auth.uid(), 'super_admin'::app_role)
    OR (empresa_id IS NOT NULL AND empresa_id = get_user_empresa_id(auth.uid()))
  );

-- Write: super_admin OR empresa admin on own empresa
CREATE POLICY "manage pipeline templates"
  ON public.orbit_pipeline_templates FOR ALL TO authenticated
  USING (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR (empresa_id IS NOT NULL AND empresa_id = get_user_empresa_id(auth.uid()) AND pe_user_is_orbit_admin(auth.uid()))
  )
  WITH CHECK (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR (empresa_id IS NOT NULL AND empresa_id = get_user_empresa_id(auth.uid()) AND pe_user_is_orbit_admin(auth.uid()))
  );

DROP TRIGGER IF EXISTS trg_orbit_pipeline_templates_updated_at ON public.orbit_pipeline_templates;
CREATE TRIGGER trg_orbit_pipeline_templates_updated_at
  BEFORE UPDATE ON public.orbit_pipeline_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) Função de aplicar template (não-destrutiva: adiciona stages, não apaga)
CREATE OR REPLACE FUNCTION public.apply_pipeline_template(
  p_empresa_id uuid,
  p_template_id uuid,
  p_replace boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_template public.orbit_pipeline_templates%ROWTYPE;
  v_stage jsonb;
  v_base_ordem int;
  v_inserted int := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR (get_user_empresa_id(auth.uid()) = p_empresa_id AND pe_user_is_orbit_admin(auth.uid()))
  ) THEN
    RAISE EXCEPTION 'access_denied';
  END IF;

  SELECT * INTO v_template FROM public.orbit_pipeline_templates WHERE id = p_template_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'template_not_found'; END IF;
  IF NOT v_template.is_system AND v_template.empresa_id IS NOT NULL AND v_template.empresa_id <> p_empresa_id
     AND NOT has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'access_denied: template not available for this empresa';
  END IF;

  IF p_replace THEN
    UPDATE public.orbit_pipeline_stages SET is_archived = true
      WHERE empresa_id = p_empresa_id AND is_archived = false;
    v_base_ordem := 0;
  ELSE
    SELECT COALESCE(MAX(ordem), 0) INTO v_base_ordem
      FROM public.orbit_pipeline_stages WHERE empresa_id = p_empresa_id AND is_archived = false;
  END IF;

  FOR v_stage IN SELECT * FROM jsonb_array_elements(v_template.stages) LOOP
    INSERT INTO public.orbit_pipeline_stages (
      empresa_id, nome, descricao, slug, ordem, cor,
      is_won, is_lost, probabilidade_default, sla_dias, requer_motivo
    ) VALUES (
      p_empresa_id,
      v_stage->>'nome',
      v_stage->>'descricao',
      v_stage->>'slug',
      v_base_ordem + COALESCE((v_stage->>'ordem')::int, v_inserted + 1),
      COALESCE(v_stage->>'cor', '#3b82f6'),
      COALESCE((v_stage->>'is_won')::boolean, false),
      COALESCE((v_stage->>'is_lost')::boolean, false),
      NULLIF(v_stage->>'probabilidade_default', '')::int,
      NULLIF(v_stage->>'sla_dias', '')::int,
      COALESCE((v_stage->>'requer_motivo')::boolean, false)
    );
    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'inserted', v_inserted, 'replaced', p_replace);
END;
$$;

-- 4) Seed: templates do sistema (vertical pré-prontos)
INSERT INTO public.orbit_pipeline_templates (empresa_id, nome, descricao, vertical, is_system, stages) VALUES
(NULL, 'Vendas Padrão', 'Pipeline genérico para B2B', 'geral', true, '[
  {"nome":"Lead","cor":"#94a3b8","ordem":1,"probabilidade_default":10,"sla_dias":2},
  {"nome":"Qualificação","cor":"#3b82f6","ordem":2,"probabilidade_default":25,"sla_dias":3},
  {"nome":"Proposta","cor":"#8b5cf6","ordem":3,"probabilidade_default":50,"sla_dias":5},
  {"nome":"Negociação","cor":"#f59e0b","ordem":4,"probabilidade_default":75,"sla_dias":7},
  {"nome":"Ganho","cor":"#10b981","ordem":5,"is_won":true,"probabilidade_default":100},
  {"nome":"Perdido","cor":"#ef4444","ordem":6,"is_lost":true,"requer_motivo":true,"probabilidade_default":0}
]'::jsonb),
(NULL, 'Joalheria & Semijoias', 'Fluxo consultivo para venda de joias', 'joalheria', true, '[
  {"nome":"Interesse","cor":"#94a3b8","ordem":1,"probabilidade_default":10,"sla_dias":1},
  {"nome":"Apresentação Catálogo","cor":"#3b82f6","ordem":2,"probabilidade_default":25,"sla_dias":2},
  {"nome":"Provador / Visita","cor":"#8b5cf6","ordem":3,"probabilidade_default":50,"sla_dias":3},
  {"nome":"Orçamento Enviado","cor":"#f59e0b","ordem":4,"probabilidade_default":70,"sla_dias":3},
  {"nome":"Aguardando Pagamento","cor":"#eab308","ordem":5,"probabilidade_default":90,"sla_dias":2},
  {"nome":"Venda Concluída","cor":"#10b981","ordem":6,"is_won":true,"probabilidade_default":100},
  {"nome":"Perdido","cor":"#ef4444","ordem":7,"is_lost":true,"requer_motivo":true,"probabilidade_default":0}
]'::jsonb),
(NULL, 'Imobiliária', 'Captação e fechamento de imóveis', 'imobiliaria', true, '[
  {"nome":"Lead Captado","cor":"#94a3b8","ordem":1,"probabilidade_default":10,"sla_dias":1},
  {"nome":"Qualificação","cor":"#3b82f6","ordem":2,"probabilidade_default":20,"sla_dias":2},
  {"nome":"Visita Agendada","cor":"#8b5cf6","ordem":3,"probabilidade_default":40,"sla_dias":5},
  {"nome":"Proposta","cor":"#f59e0b","ordem":4,"probabilidade_default":60,"sla_dias":7},
  {"nome":"Documentação","cor":"#eab308","ordem":5,"probabilidade_default":80,"sla_dias":10},
  {"nome":"Fechado","cor":"#10b981","ordem":6,"is_won":true,"probabilidade_default":100},
  {"nome":"Perdido","cor":"#ef4444","ordem":7,"is_lost":true,"requer_motivo":true}
]'::jsonb),
(NULL, 'Serviços / Agência', 'Pipeline para venda consultiva de serviços', 'servicos', true, '[
  {"nome":"Briefing","cor":"#94a3b8","ordem":1,"probabilidade_default":15,"sla_dias":2},
  {"nome":"Diagnóstico","cor":"#3b82f6","ordem":2,"probabilidade_default":30,"sla_dias":3},
  {"nome":"Proposta Comercial","cor":"#8b5cf6","ordem":3,"probabilidade_default":55,"sla_dias":5},
  {"nome":"Negociação","cor":"#f59e0b","ordem":4,"probabilidade_default":75,"sla_dias":5},
  {"nome":"Contrato Assinado","cor":"#10b981","ordem":5,"is_won":true,"probabilidade_default":100},
  {"nome":"Perdido","cor":"#ef4444","ordem":6,"is_lost":true,"requer_motivo":true}
]'::jsonb),
(NULL, 'SaaS', 'Pipeline para produtos SaaS com trial', 'saas', true, '[
  {"nome":"Trial Iniciado","cor":"#94a3b8","ordem":1,"probabilidade_default":15,"sla_dias":3},
  {"nome":"Ativado","cor":"#3b82f6","ordem":2,"probabilidade_default":35,"sla_dias":5},
  {"nome":"Demo Realizada","cor":"#8b5cf6","ordem":3,"probabilidade_default":55,"sla_dias":4},
  {"nome":"Proposta","cor":"#f59e0b","ordem":4,"probabilidade_default":75,"sla_dias":5},
  {"nome":"Convertido","cor":"#10b981","ordem":5,"is_won":true,"probabilidade_default":100},
  {"nome":"Churn","cor":"#ef4444","ordem":6,"is_lost":true,"requer_motivo":true}
]'::jsonb)
ON CONFLICT DO NOTHING;
