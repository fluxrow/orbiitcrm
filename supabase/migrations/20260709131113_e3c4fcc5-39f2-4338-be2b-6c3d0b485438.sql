
-- 1) Adiciona valor 'lead_replied' ao enum de gatilhos de fluxo
ALTER TYPE public.orbit_flow_trigger_type ADD VALUE IF NOT EXISTS 'lead_replied';

-- 2) Nova função: cancela apenas ações marcadas explicitamente como canceláveis
--    (cancel_on_reply=true OU category IN follow_up/nutricao). Não toca tarefas
--    operacionais internas sem marcação.
CREATE OR REPLACE FUNCTION public.cancel_scheduled_actions_on_reply(
  _empresa_id uuid,
  _prospect_id uuid,
  _reason text DEFAULT 'lead_replied'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count integer;
BEGIN
  IF _empresa_id IS NULL OR _prospect_id IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.orbit_flow_scheduled_actions
  SET status = 'canceled',
      canceled_reason = COALESCE(_reason, 'lead_replied'),
      last_error = NULL
  WHERE status = 'pending'
    AND empresa_id = _empresa_id
    AND prospect_id = _prospect_id
    AND (
      (action_config->>'cancel_on_reply')::text = 'true'
      OR (action_config->>'category') IN ('follow_up', 'nutricao')
    );
  GET DIAGNOSTICS _count = ROW_COUNT;
  RETURN _count;
END;
$$;

-- 3) Trigger: ao inserir mensagem IN em orbit_mensagens, cancelar follow-ups
--    e emitir evento lead_replied para o dispatcher/agente reagirem.
CREATE OR REPLACE FUNCTION public.orbit_on_inbound_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _prospect_id uuid;
  _empresa_id uuid;
  _canal text;
  _canceled integer := 0;
  _dedupe text;
BEGIN
  IF NEW.direcao IS DISTINCT FROM 'IN' THEN
    RETURN NEW;
  END IF;
  IF NEW.conversa_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT c.prospect_id, c.empresa_id, c.canal
    INTO _prospect_id, _empresa_id, _canal
  FROM public.orbit_conversas c
  WHERE c.id = NEW.conversa_id;

  IF _empresa_id IS NULL OR _prospect_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Cancela apenas ações marcadas explicitamente (cancel_on_reply / category)
  _canceled := public.cancel_scheduled_actions_on_reply(_empresa_id, _prospect_id, 'lead_replied');

  -- Emite evento lead_replied (idempotente por mensagem)
  _dedupe := 'lead_replied:' || NEW.id::text;
  BEGIN
    INSERT INTO public.orbit_flow_events (
      empresa_id, event_type, entity_type, entity_id, payload, dedupe_key
    ) VALUES (
      _empresa_id,
      'lead_replied'::orbit_flow_trigger_type,
      'prospect',
      _prospect_id,
      jsonb_build_object(
        'prospect_id', _prospect_id,
        'conversa_id', NEW.conversa_id,
        'mensagem_id', NEW.id,
        'mensagem', NEW.mensagem,
        'canal', COALESCE(NEW.canal, _canal, 'whatsapp'),
        'timestamp', COALESCE(NEW.timestamp, now()),
        'scheduled_canceled', _canceled
      ),
      _dedupe
    );
  EXCEPTION WHEN unique_violation THEN
    -- duplicata silenciosa (mesma mensagem processada 2x)
    NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orbit_on_inbound_message ON public.orbit_mensagens;
CREATE TRIGGER trg_orbit_on_inbound_message
  AFTER INSERT ON public.orbit_mensagens
  FOR EACH ROW
  EXECUTE FUNCTION public.orbit_on_inbound_message();

-- 4) Marca os follow-ups longos existentes (WhatsApp com dry_run=true) como
--    canceláveis quando o lead responder. Mantém tarefas operacionais intactas.
UPDATE public.orbit_flow_actions a
SET action_config = a.action_config
  || jsonb_build_object('cancel_on_reply', true, 'category', 'follow_up')
FROM public.orbit_flows f
WHERE a.flow_id = f.id
  AND a.action_type = 'send_whatsapp_template'
  AND (a.action_config->>'dry_run') = 'true'
  AND (a.action_config->>'cancel_on_reply') IS DISTINCT FROM 'true';
