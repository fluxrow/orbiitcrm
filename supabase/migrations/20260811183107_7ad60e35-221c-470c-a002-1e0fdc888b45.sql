-- 1) Root cause: instance_id duplicado entre tenants fazia o inbound do Bullink
--    ser resolvido para o tenant master (Fluxrow). Neutraliza o cadastro antigo.
UPDATE public.orbit_zapi_config
SET instance_id = NULL,
    ativo = false,
    updated_at = now()
WHERE empresa_id = '4de0ed22-0fe5-40ef-aaed-703dd3070291'
  AND instance_id = '3E122A05B56100A46A0E96870211A73F';

-- 2) Impede reincidência: uma instância Z-API pertence a no máximo um tenant.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_orbit_zapi_config_instance_id
  ON public.orbit_zapi_config (upper(instance_id))
  WHERE instance_id IS NOT NULL;

-- 3) Cancelamento atômico de cadência ao receber resposta do lead:
--    ações agendadas pendentes + itens futuros do outbox ligados a elas.
CREATE OR REPLACE FUNCTION public.cancel_cadence_on_reply(
  _empresa_id uuid,
  _prospect_id uuid,
  _reason text DEFAULT 'replied'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _actions uuid[] := '{}';
  _outbox_count integer := 0;
BEGIN
  IF _empresa_id IS NULL OR _prospect_id IS NULL THEN
    RETURN jsonb_build_object('actions_canceled', 0, 'outbox_canceled', 0);
  END IF;

  WITH canceled AS (
    UPDATE public.orbit_flow_scheduled_actions
    SET status = 'canceled',
        canceled_reason = COALESCE(_reason, 'replied'),
        last_error = NULL,
        locked_at = NULL,
        locked_by = NULL,
        updated_at = now()
    WHERE empresa_id = _empresa_id
      AND prospect_id = _prospect_id
      AND status IN ('pending', 'running')
      AND (
        (action_config->>'cancel_on_reply') = 'true'
        OR (action_config->>'category') IN ('follow_up', 'nutricao')
      )
    RETURNING id
  )
  SELECT COALESCE(array_agg(id), '{}') INTO _actions FROM canceled;

  UPDATE public.orbit_whatsapp_outbox
  SET status = 'canceled',
      canceled_at = now(),
      canceled_reason = COALESCE(_reason, 'replied'),
      locked_at = NULL,
      locked_by = NULL,
      updated_at = now()
  WHERE empresa_id = _empresa_id
    AND status IN ('pending', 'queued')
    AND source_type IN ('flow_followup', 'flow_initial', 'flow_stage')
    AND (
      scheduled_action_id = ANY(_actions)
      OR (prospect_id = _prospect_id AND scheduled_for > now())
    );
  GET DIAGNOSTICS _outbox_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'actions_canceled', COALESCE(array_length(_actions, 1), 0),
    'outbox_canceled', _outbox_count
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.cancel_cadence_on_reply(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_cadence_on_reply(uuid, uuid, text) TO service_role;