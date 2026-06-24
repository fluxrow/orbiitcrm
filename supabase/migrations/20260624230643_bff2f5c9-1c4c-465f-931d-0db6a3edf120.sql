
-- Lock down the helper from F1
REVOKE EXECUTE ON FUNCTION public.user_has_empresa_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_has_empresa_access(uuid) TO authenticated, service_role;

-- ===== Trigger fn: deal_stage_changed =====
CREATE OR REPLACE FUNCTION public.orbit_emit_deal_stage_changed()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.etapa_id IS DISTINCT FROM OLD.etapa_id AND NEW.empresa_id IS NOT NULL THEN
    INSERT INTO public.orbit_flow_events (empresa_id, event_type, entity_type, entity_id, payload, dedupe_key)
    VALUES (
      NEW.empresa_id,
      'deal_stage_changed',
      'deal',
      NEW.id,
      jsonb_build_object(
        'deal_id', NEW.id,
        'from_stage_id', OLD.etapa_id,
        'to_stage_id', NEW.etapa_id,
        'valor_estimado', NEW.valor_estimado,
        'prospect_id', NEW.prospect_id,
        'origem', NEW.origem
      ),
      'deal_stage_' || NEW.id::text || '_' || COALESCE(NEW.etapa_id::text,'null') || '_' || extract(epoch from now())::bigint::text
    );
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.orbit_emit_deal_stage_changed() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_orbit_emit_deal_stage_changed ON public.orbit_deals;
CREATE TRIGGER trg_orbit_emit_deal_stage_changed
  AFTER UPDATE OF etapa_id ON public.orbit_deals
  FOR EACH ROW EXECUTE FUNCTION public.orbit_emit_deal_stage_changed();

-- ===== Trigger fn: prospect_qualified =====
CREATE OR REPLACE FUNCTION public.orbit_emit_prospect_qualified()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
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
        'origem', NEW.origem
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
