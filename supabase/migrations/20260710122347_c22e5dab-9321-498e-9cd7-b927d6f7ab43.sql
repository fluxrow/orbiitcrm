
ALTER TABLE public.orbit_ai_config
  ADD COLUMN IF NOT EXISTS advisor_playbook_flow_prefixes text[];

-- Seed Viver Semijoias
UPDATE public.orbit_ai_config
   SET advisor_playbook_flow_prefixes = ARRAY['VIVER -']
 WHERE empresa_id = '36f26579-66ad-4ef1-9788-141e4c727232'
   AND (advisor_playbook_flow_prefixes IS NULL
        OR NOT ('VIVER -' = ANY(advisor_playbook_flow_prefixes)));

CREATE OR REPLACE FUNCTION public.advisor_apply_gate(
  p_empresa uuid,
  p_kind text,
  p_target_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_flow_id uuid;
  v_flow_name text;
  v_trigger text;
  v_flow_ativo boolean;
  v_prefixes text[];
  v_playbook_ok boolean := true;
  v_depends_zapi boolean := false;
  v_depends_calendar boolean := false;
  v_zapi_available boolean := false;
  v_envio_liberado boolean := false;
  v_calendar_ready boolean := false;
  v_reasons text[] := ARRAY[]::text[];
  v_stage_nome text;
BEGIN
  SELECT advisor_playbook_flow_prefixes INTO v_prefixes
    FROM orbit_ai_config
   WHERE empresa_id = p_empresa
   ORDER BY updated_at DESC
   LIMIT 1;

  IF p_kind IN ('flow_pause','flow_variation_propose') THEN
    SELECT id, nome, trigger_type, ativo
      INTO v_flow_id, v_flow_name, v_trigger, v_flow_ativo
      FROM orbit_flows
     WHERE id = p_target_id AND empresa_id = p_empresa;

    IF v_flow_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'reasons', ARRAY['flow_not_found']);
    END IF;

    IF v_prefixes IS NOT NULL AND array_length(v_prefixes, 1) > 0 THEN
      v_playbook_ok := EXISTS (
        SELECT 1 FROM unnest(v_prefixes) p
         WHERE v_flow_name ILIKE p || '%'
      );
      IF NOT v_playbook_ok THEN
        v_reasons := v_reasons || 'flow_not_in_playbook';
      END IF;
    END IF;

    v_depends_zapi := EXISTS (
      SELECT 1 FROM orbit_flow_actions a
       WHERE a.flow_id = v_flow_id
         AND a.action_type IN ('send_whatsapp_template','send_whatsapp','send_message','send_audio')
    );
    v_depends_calendar := EXISTS (
      SELECT 1 FROM orbit_flow_actions a
       WHERE a.flow_id = v_flow_id
         AND a.action_type IN ('schedule_meeting','create_meeting','calendar_event','book_meeting')
    );
  ELSIF p_kind = 'stage_add_followup_task' THEN
    SELECT nome INTO v_stage_nome
      FROM orbit_pipeline_stages
     WHERE id = p_target_id AND empresa_id = p_empresa;
    IF v_stage_nome IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'reasons', ARRAY['stage_not_found']);
    END IF;
  ELSE
    RETURN jsonb_build_object('ok', false, 'reasons', ARRAY['kind_not_gated']);
  END IF;

  SELECT true, COALESCE(envio_real_liberado, false)
    INTO v_zapi_available, v_envio_liberado
    FROM orbit_zapi_config
   WHERE empresa_id = p_empresa
   ORDER BY updated_at DESC
   LIMIT 1;
  v_zapi_available := COALESCE(v_zapi_available, false);

  v_calendar_ready := EXISTS (
    SELECT 1 FROM orbit_google_tokens WHERE empresa_id = p_empresa
  );

  IF v_depends_zapi THEN
    IF NOT v_zapi_available THEN
      v_reasons := v_reasons || 'zapi_not_configured';
    ELSIF NOT v_envio_liberado THEN
      v_reasons := v_reasons || 'zapi_envio_real_bloqueado';
    END IF;
  END IF;

  IF v_depends_calendar AND NOT v_calendar_ready THEN
    v_reasons := v_reasons || 'calendar_not_ready';
  END IF;

  RETURN jsonb_build_object(
    'ok', COALESCE(array_length(v_reasons, 1), 0) = 0,
    'reasons', v_reasons,
    'empresa_id', p_empresa,
    'kind', p_kind,
    'flow_id', v_flow_id,
    'flow_name', v_flow_name,
    'trigger_type', v_trigger,
    'flow_ativo', v_flow_ativo,
    'stage_nome', v_stage_nome,
    'playbook_ok', v_playbook_ok,
    'playbook_prefixes', COALESCE(v_prefixes, ARRAY[]::text[]),
    'depends_on_whatsapp', v_depends_zapi,
    'depends_on_calendar', v_depends_calendar,
    'zapi_available', v_zapi_available,
    'envio_real_liberado', v_envio_liberado,
    'calendar_ready', v_calendar_ready,
    'dry_run', (v_depends_zapi AND NOT v_envio_liberado)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.advisor_apply_gate(uuid, text, uuid) TO authenticated, service_role;
