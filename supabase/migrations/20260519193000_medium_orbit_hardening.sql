CREATE OR REPLACE FUNCTION public.create_default_pipeline_stages(p_empresa_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_empresa_id IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.orbit_pipeline_stages
    WHERE empresa_id = p_empresa_id
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.orbit_pipeline_stages (empresa_id, nome, ordem, cor, is_won, is_lost) VALUES
    (p_empresa_id, 'Qualificação', 1, '#6366f1', false, false),
    (p_empresa_id, 'Proposta', 2, '#8b5cf6', false, false),
    (p_empresa_id, 'Negociação', 3, '#f59e0b', false, false),
    (p_empresa_id, 'Fechamento', 4, '#10b981', false, false),
    (p_empresa_id, 'Ganho', 5, '#22c55e', true, false),
    (p_empresa_id, 'Perdido', 6, '#ef4444', false, true);
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_create_default_pipeline_stages()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.create_default_pipeline_stages(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_default_pipeline_stages ON public.orbit_empresas;

CREATE TRIGGER trg_create_default_pipeline_stages
  AFTER INSERT ON public.orbit_empresas
  FOR EACH ROW EXECUTE FUNCTION public.handle_create_default_pipeline_stages();

DO $$
DECLARE
  empresa_record record;
BEGIN
  FOR empresa_record IN
    SELECT id
    FROM public.orbit_empresas
    WHERE id IS NOT NULL
  LOOP
    PERFORM public.create_default_pipeline_stages(empresa_record.id);
  END LOOP;
END;
$$;

DELETE FROM public.orbit_ai_config
WHERE empresa_id IS NULL;

ALTER TABLE public.orbit_ai_config
  DROP CONSTRAINT IF EXISTS orbit_ai_config_empresa_id_unique;

ALTER TABLE public.orbit_ai_config
  ADD CONSTRAINT orbit_ai_config_empresa_id_unique UNIQUE (empresa_id);
