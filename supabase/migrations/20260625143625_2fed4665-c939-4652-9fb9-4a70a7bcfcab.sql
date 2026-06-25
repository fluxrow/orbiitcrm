-- Hotfix UX/Data — garantir conversão automática Prospect -> Deal na etapa Novo Lead

CREATE OR REPLACE FUNCTION public.orbit_first_stage_id(p_empresa_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id
  FROM public.orbit_pipeline_stages
  WHERE empresa_id = p_empresa_id
    AND COALESCE(is_archived, false) = false
    AND COALESCE(is_lost, false) = false
  ORDER BY
    CASE
      WHEN lower(nome) IN ('novo lead', 'novos leads') THEN 0
      WHEN lower(nome) LIKE 'novo lead%' THEN 1
      WHEN lower(nome) LIKE '%novo%lead%' THEN 2
      ELSE 3
    END,
    ordem ASC,
    created_at ASC
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.orbit_auto_create_deal_for_prospect()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stage_id uuid;
  v_title text;
BEGIN
  IF NEW.empresa_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.orbit_deals d
    WHERE d.prospect_id = NEW.id
      AND d.empresa_id = NEW.empresa_id
      AND d.deleted_at IS NULL
  ) THEN
    RETURN NEW;
  END IF;

  v_stage_id := public.orbit_first_stage_id(NEW.empresa_id);

  IF v_stage_id IS NULL THEN
    INSERT INTO public.orbit_pipeline_stages (empresa_id, nome, cor, ordem, is_won, is_lost, is_archived)
    VALUES (NEW.empresa_id, 'Novo Lead', '#f9b217', 0, false, false, false)
    RETURNING id INTO v_stage_id;
  END IF;

  v_title := COALESCE(NULLIF(BTRIM(NEW.nome_razao), ''), NULLIF(BTRIM(NEW.nome_fantasia), ''), NULLIF(BTRIM(NEW.email_principal), ''), NULLIF(BTRIM(NEW.telefone), ''), 'Novo lead');

  INSERT INTO public.orbit_deals (
    empresa_id,
    prospect_id,
    etapa_id,
    titulo,
    status,
    origem,
    valor_estimado,
    probabilidade,
    moved_at
  ) VALUES (
    NEW.empresa_id,
    NEW.id,
    v_stage_id,
    v_title,
    'open',
    COALESCE(NULLIF(BTRIM(NEW.origem_contato), ''), 'prospect_auto'),
    0,
    10,
    now()
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orbit_auto_create_deal ON public.orbit_prospects;
CREATE TRIGGER trg_orbit_auto_create_deal
AFTER INSERT ON public.orbit_prospects
FOR EACH ROW
EXECUTE FUNCTION public.orbit_auto_create_deal_for_prospect();

INSERT INTO public.orbit_pipeline_stages (empresa_id, nome, cor, ordem, is_won, is_lost, is_archived)
SELECT DISTINCT p.empresa_id, 'Novo Lead', '#f9b217', 0, false, false, false
FROM public.orbit_prospects p
WHERE p.empresa_id IS NOT NULL
  AND public.orbit_first_stage_id(p.empresa_id) IS NULL;

INSERT INTO public.orbit_deals (
  empresa_id,
  prospect_id,
  etapa_id,
  titulo,
  status,
  origem,
  valor_estimado,
  probabilidade,
  moved_at
)
SELECT
  p.empresa_id,
  p.id,
  public.orbit_first_stage_id(p.empresa_id),
  COALESCE(NULLIF(BTRIM(p.nome_razao), ''), NULLIF(BTRIM(p.nome_fantasia), ''), NULLIF(BTRIM(p.email_principal), ''), NULLIF(BTRIM(p.telefone), ''), 'Novo lead'),
  'open',
  COALESCE(NULLIF(BTRIM(p.origem_contato), ''), 'prospect_auto'),
  0,
  10,
  now()
FROM public.orbit_prospects p
WHERE p.empresa_id IS NOT NULL
  AND public.orbit_first_stage_id(p.empresa_id) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.orbit_deals d
    WHERE d.prospect_id = p.id
      AND d.empresa_id = p.empresa_id
      AND d.deleted_at IS NULL
  );