
-- F4.0 — Conversão automática de Prospect → Deal
-- 1) Função helper: pega o etapa_id "inicial" (menor ordem, não is_lost) da empresa
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
  ORDER BY ordem ASC, created_at ASC
  LIMIT 1
$$;

-- 2) Trigger: cria um Deal inicial sempre que um novo prospect é inserido
CREATE OR REPLACE FUNCTION public.orbit_auto_create_deal_for_prospect()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_stage_id uuid;
BEGIN
  IF NEW.empresa_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Idempotência: não cria se já existe deal ativo para esse prospect
  IF EXISTS (
    SELECT 1 FROM public.orbit_deals
    WHERE prospect_id = NEW.id AND deleted_at IS NULL
  ) THEN
    RETURN NEW;
  END IF;

  v_stage_id := public.orbit_first_stage_id(NEW.empresa_id);
  IF v_stage_id IS NULL THEN
    RETURN NEW; -- empresa sem pipeline configurado; ignora silenciosamente
  END IF;

  INSERT INTO public.orbit_deals (
    empresa_id, prospect_id, etapa_id, titulo, status, origem, moved_at
  ) VALUES (
    NEW.empresa_id,
    NEW.id,
    v_stage_id,
    COALESCE(NULLIF(NEW.nome_razao,''), NULLIF(NEW.nome_fantasia,''), 'Nova oportunidade'),
    'open',
    COALESCE(NEW.origem_contato, 'auto_prospect'),
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

-- 3) Backfill: cria deals para prospects existentes que ainda não têm deal
INSERT INTO public.orbit_deals (empresa_id, prospect_id, etapa_id, titulo, status, origem, moved_at)
SELECT
  p.empresa_id,
  p.id,
  public.orbit_first_stage_id(p.empresa_id),
  COALESCE(NULLIF(p.nome_razao,''), NULLIF(p.nome_fantasia,''), 'Nova oportunidade'),
  'open',
  COALESCE(p.origem_contato, 'auto_prospect'),
  now()
FROM public.orbit_prospects p
WHERE p.empresa_id IS NOT NULL
  AND public.orbit_first_stage_id(p.empresa_id) IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.orbit_deals d
    WHERE d.prospect_id = p.id AND d.deleted_at IS NULL
  );
