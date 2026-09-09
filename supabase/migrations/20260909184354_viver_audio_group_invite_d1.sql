-- Route the low-capital D+1 follow-up to Fernanda's own invitation audio.
-- It remains cancel-on-reply and is never reused as a meeting reminder.

DO $$
DECLARE
  v_empresa_id CONSTANT uuid := '36f26579-66ad-4ef1-9788-141e4c727232'::uuid;
  v_template_id CONSTANT uuid := '049f5dbd-dc41-49d7-a02b-b7e1beaa4ac6'::uuid;
  v_action_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.orbit_message_templates t
    WHERE t.id = v_template_id
      AND t.empresa_id = v_empresa_id
      AND t.ativo = true
      AND t.audio_url IS NOT NULL
      AND t.imagem_url IS NULL
  ) THEN
    RAISE EXCEPTION 'Viver group invitation audio template is not ready';
  END IF;

  SELECT a.id INTO STRICT v_action_id
  FROM public.orbit_flow_actions a
  JOIN public.orbit_flows f ON f.id = a.flow_id
  WHERE f.empresa_id = v_empresa_id
    AND f.nome = 'VIVER - Baixo capital -> Aula Grupo'
    AND f.ativo = true
    AND a.ordem = 2
    AND a.delay_seconds = 86400
    AND a.action_type::text = 'send_whatsapp_template';

  INSERT INTO public.orbit_quarantine_backups
    (empresa_id, batch_label, entity_type, entity_id, snapshot)
  SELECT v_empresa_id,
    'viver_audio_group_invite_d1_2026-09-09',
    'orbit_flow_action_before',
    a.id,
    to_jsonb(a)
  FROM public.orbit_flow_actions a
  WHERE a.id = v_action_id
    AND NOT EXISTS (
      SELECT 1
      FROM public.orbit_quarantine_backups b
      WHERE b.empresa_id = v_empresa_id
        AND b.batch_label = 'viver_audio_group_invite_d1_2026-09-09'
        AND b.entity_type = 'orbit_flow_action_before'
        AND b.entity_id = a.id
    );

  UPDATE public.orbit_flow_actions
  SET action_config = coalesce(action_config, '{}'::jsonb) || jsonb_build_object(
        'template_id', v_template_id,
        'enabled', true,
        'cancel_on_reply', true,
        'dry_run', false,
        'viver_controlled_followup', true,
        'viver_group_invite_audio', true,
        'pilot_not_before', '2026-09-09T03:00:00Z'
      ),
      updated_at = now()
  WHERE id = v_action_id;

  IF NOT EXISTS (
    SELECT 1
    FROM public.orbit_flow_actions a
    WHERE a.id = v_action_id
      AND a.action_config->>'template_id' = v_template_id::text
      AND a.action_config->>'enabled' = 'true'
      AND a.action_config->>'cancel_on_reply' = 'true'
      AND a.action_config->>'viver_group_invite_audio' = 'true'
  ) THEN
    RAISE EXCEPTION 'Viver group invitation audio routing validation failed';
  END IF;
END $$;
