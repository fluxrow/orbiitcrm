
-- 1.1 Validar funil_etapas.tipo
CREATE OR REPLACE FUNCTION public.validate_funil_etapa()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.tipo NOT IN ('open', 'won', 'lost') THEN
    RAISE EXCEPTION 'funil_etapas.tipo must be open, won, or lost (got: %)', NEW.tipo;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_funil_etapa
  BEFORE INSERT OR UPDATE ON public.funil_etapas
  FOR EACH ROW EXECUTE FUNCTION public.validate_funil_etapa();

-- 1.2 Status automático ao mudar etapa_id em oportunidades
CREATE OR REPLACE FUNCTION public.auto_oportunidade_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_tipo text;
  v_etapa_org_id uuid;
BEGIN
  -- Só executa quando etapa_id muda (INSERT ou UPDATE com etapa_id diferente)
  IF TG_OP = 'UPDATE' AND NEW.etapa_id = OLD.etapa_id THEN
    RETURN NEW;
  END IF;

  -- Busca tipo e organization_id da nova etapa
  SELECT tipo, organization_id INTO v_tipo, v_etapa_org_id
  FROM public.funil_etapas
  WHERE id = NEW.etapa_id;

  IF v_tipo IS NULL THEN
    RAISE EXCEPTION 'etapa_id % not found in funil_etapas', NEW.etapa_id;
  END IF;

  -- Valida consistência de organization_id
  IF v_etapa_org_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'etapa organization_id (%) does not match oportunidade organization_id (%)', v_etapa_org_id, NEW.organization_id;
  END IF;

  -- Define status e closed_at conforme tipo da etapa
  IF v_tipo = 'won' THEN
    NEW.status := 'won';
    NEW.closed_at := now();
  ELSIF v_tipo = 'lost' THEN
    NEW.status := 'lost';
    NEW.closed_at := now();
  ELSE
    NEW.status := 'open';
    NEW.closed_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_oportunidade_status
  BEFORE INSERT OR UPDATE ON public.oportunidades
  FOR EACH ROW EXECUTE FUNCTION public.auto_oportunidade_status();

-- 1.3 Recálculo automático de valor_total_estimado
CREATE OR REPLACE FUNCTION public.recalc_oportunidade_total()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_oportunidade_id uuid;
  v_total numeric;
BEGIN
  -- Determina o oportunidade_id afetado
  IF TG_OP = 'DELETE' THEN
    v_oportunidade_id := OLD.oportunidade_id;
  ELSE
    v_oportunidade_id := NEW.oportunidade_id;
  END IF;

  -- Calcula soma
  SELECT COALESCE(SUM(COALESCE(valor_total, quantidade * valor_unitario, 0)), 0)
  INTO v_total
  FROM public.oportunidade_itens
  WHERE oportunidade_id = v_oportunidade_id;

  -- Atualiza oportunidade
  UPDATE public.oportunidades
  SET valor_total_estimado = v_total
  WHERE id = v_oportunidade_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_recalc_total_insert
  AFTER INSERT ON public.oportunidade_itens
  FOR EACH ROW EXECUTE FUNCTION public.recalc_oportunidade_total();

CREATE TRIGGER trg_recalc_total_update
  AFTER UPDATE ON public.oportunidade_itens
  FOR EACH ROW EXECUTE FUNCTION public.recalc_oportunidade_total();

CREATE TRIGGER trg_recalc_total_delete
  AFTER DELETE ON public.oportunidade_itens
  FOR EACH ROW EXECUTE FUNCTION public.recalc_oportunidade_total();
