
CREATE OR REPLACE FUNCTION public.orbit_seed_default_pipeline(_empresa_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.orbit_pipeline_stages WHERE empresa_id = _empresa_id) THEN
    RETURN;
  END IF;

  INSERT INTO public.orbit_pipeline_stages
    (empresa_id, nome, slug, ordem, cor, is_won, is_lost, probabilidade_default, requer_motivo)
  VALUES
    (_empresa_id, 'Novo Lead',    'novo-lead',    1, '#3b82f6', false, false, 10,  false),
    (_empresa_id, 'Qualificação', 'qualificacao', 2, '#8b5cf6', false, false, 25,  false),
    (_empresa_id, 'Proposta',     'proposta',     3, '#f59e0b', false, false, 50,  false),
    (_empresa_id, 'Negociação',   'negociacao',   4, '#f97316', false, false, 75,  false),
    (_empresa_id, 'Ganho',        'ganho',        5, '#10b981', true,  false, 100, false),
    (_empresa_id, 'Perdido',      'perdido',      6, '#ef4444', false, true,  0,   true);
END;
$$;

CREATE OR REPLACE FUNCTION public.orbit_seed_pipeline_on_empresa_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.orbit_seed_default_pipeline(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orbit_seed_pipeline ON public.orbit_empresas;
CREATE TRIGGER trg_orbit_seed_pipeline
AFTER INSERT ON public.orbit_empresas
FOR EACH ROW
EXECUTE FUNCTION public.orbit_seed_pipeline_on_empresa_insert();

-- Backfill empresas sem etapas
DO $$
DECLARE
  emp record;
BEGIN
  FOR emp IN
    SELECT e.id
    FROM public.orbit_empresas e
    WHERE NOT EXISTS (SELECT 1 FROM public.orbit_pipeline_stages s WHERE s.empresa_id = e.id)
  LOOP
    PERFORM public.orbit_seed_default_pipeline(emp.id);
  END LOOP;
END $$;

-- T2: ensure_deal_for_prospect (idempotente)
CREATE OR REPLACE FUNCTION public.ensure_deal_for_prospect(_prospect_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa_id uuid;
  v_nome text;
  v_etapa_id uuid;
  v_deal_id uuid;
BEGIN
  SELECT empresa_id, COALESCE(nome_razao, nome_fantasia, 'Lead sem nome')
    INTO v_empresa_id, v_nome
  FROM public.orbit_prospects
  WHERE id = _prospect_id;

  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'prospect % nao encontrado', _prospect_id;
  END IF;

  -- Garantir etapas
  PERFORM public.orbit_seed_default_pipeline(v_empresa_id);

  -- Deal ativo existente?
  SELECT id INTO v_deal_id
  FROM public.orbit_deals
  WHERE prospect_id = _prospect_id
    AND deleted_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_deal_id IS NOT NULL THEN
    RETURN v_deal_id;
  END IF;

  -- Primeira etapa aberta
  SELECT id INTO v_etapa_id
  FROM public.orbit_pipeline_stages
  WHERE empresa_id = v_empresa_id
    AND COALESCE(is_won, false) = false
    AND COALESCE(is_lost, false) = false
    AND COALESCE(is_archived, false) = false
  ORDER BY ordem ASC
  LIMIT 1;

  IF v_etapa_id IS NULL THEN
    RAISE EXCEPTION 'sem etapa de pipeline para empresa %', v_empresa_id;
  END IF;

  INSERT INTO public.orbit_deals (empresa_id, prospect_id, etapa_id, titulo, origem, status, moved_at)
  VALUES (v_empresa_id, _prospect_id, v_etapa_id, v_nome, 'auto_agent', 'open', now())
  RETURNING id INTO v_deal_id;

  RETURN v_deal_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.orbit_seed_default_pipeline(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ensure_deal_for_prospect(uuid) TO authenticated, service_role;
