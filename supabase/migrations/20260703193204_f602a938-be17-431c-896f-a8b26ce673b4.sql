-- Trigger to prevent editing/deleting official flow templates from client roles
CREATE OR REPLACE FUNCTION public.prevent_official_flow_template_edit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow service_role to bypass (seed / broadcast / edge functions)
  IF current_setting('role', true) = 'service_role' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.is_official IS TRUE THEN
      RAISE EXCEPTION 'Templates oficiais não podem ser excluídos (%).', OLD.nome
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.is_official IS TRUE THEN
    IF NEW.nome IS DISTINCT FROM OLD.nome
       OR NEW.descricao IS DISTINCT FROM OLD.descricao
       OR NEW.categoria IS DISTINCT FROM OLD.categoria
       OR NEW.definicao::text IS DISTINCT FROM OLD.definicao::text
       OR NEW.is_official IS DISTINCT FROM OLD.is_official THEN
      RAISE EXCEPTION 'Template oficial "%": apenas ativar/desativar é permitido pela UI.', OLD.nome
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_official_flow_template_edit ON public.orbit_flow_templates;
CREATE TRIGGER trg_prevent_official_flow_template_edit
BEFORE UPDATE OR DELETE ON public.orbit_flow_templates
FOR EACH ROW EXECUTE FUNCTION public.prevent_official_flow_template_edit();