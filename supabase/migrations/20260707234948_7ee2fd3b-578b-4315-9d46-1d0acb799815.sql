
CREATE OR REPLACE FUNCTION public.orbit_emit_prospect_qualified()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status_qualificacao = 'qualificado'
     AND COALESCE(OLD.status_qualificacao,'') <> 'qualificado'
     AND NEW.empresa_id IS NOT NULL THEN
    INSERT INTO public.orbit_flow_events (empresa_id, event_type, entity_type, entity_id, payload, dedupe_key)
    VALUES (
      NEW.empresa_id,
      'prospect_qualified',
      'prospect',
      NEW.id,
      jsonb_build_object(
        'prospect_id', NEW.id,
        'telefone', NEW.telefone,
        'nome_razao', NEW.nome_razao,
        'origem', COALESCE(NEW.origem_lead, NEW.origem_contato)
      ),
      'prospect_qualified_' || NEW.id::text
    )
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.orbit_emit_prospect_qualified() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_orbit_emit_prospect_qualified ON public.orbit_prospects;
CREATE TRIGGER trg_orbit_emit_prospect_qualified
  AFTER UPDATE OF status_qualificacao ON public.orbit_prospects
  FOR EACH ROW EXECUTE FUNCTION public.orbit_emit_prospect_qualified();
