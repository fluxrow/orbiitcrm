-- 1) Extender lista permitida de source_type do outbox para incluir flow_stage.
ALTER TABLE public.orbit_whatsapp_outbox
  DROP CONSTRAINT IF EXISTS orbit_whatsapp_outbox_source_type_chk;
ALTER TABLE public.orbit_whatsapp_outbox
  ADD CONSTRAINT orbit_whatsapp_outbox_source_type_chk
  CHECK (source_type IN ('ai_reply','meeting_confirmation','manual','flow_initial','flow_followup','flow_stage','campaign'));

-- 2) Trigger de transição de etapa: dedupe curto por (deal, from, to) dentro de janela de 60s.
-- Preserva transições legítimas futuras (voltar à mesma etapa depois de sair) por cair em outro bucket.
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
      'deal_stage_' || NEW.id::text
        || '_' || COALESCE(OLD.etapa_id::text,'null')
        || '_' || COALESCE(NEW.etapa_id::text,'null')
        || '_' || (floor(extract(epoch from now())/60))::bigint::text
    )
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.orbit_emit_deal_stage_changed() FROM PUBLIC, anon;