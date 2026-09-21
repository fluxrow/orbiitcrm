-- Apply only after the existing group meeting (and therefore its participant)
-- has actually moved to Wednesday. Viver uses one verified recurring Google
-- Meet URL for the group class, so a distinct google_event_id is not required.
-- This migration does not reschedule or send.
DO $wednesday$
DECLARE
  v_empresa_id uuid := '36f26579-66ad-4ef1-9788-141e4c727232';
  v_old_audio_id uuid := '049f5dbd-dc41-49d7-a02b-b7e1beaa4ac6';
  v_invite_id uuid;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.orbit_meetings
    WHERE empresa_id = v_empresa_id
      AND metadata->>'meeting_kind' = 'viver_group_class'
      AND status IN ('scheduled', 'rescheduled')
      AND scheduled_at > now()
      AND extract(isodow FROM (scheduled_at AT TIME ZONE 'America/Sao_Paulo')) = 2
  ) THEN
    RAISE EXCEPTION 'VIVER_TUESDAY_PARTICIPANT_NOT_MOVED';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.orbit_meetings
    WHERE empresa_id = v_empresa_id
      AND metadata->>'meeting_kind' = 'viver_group_class'
      AND status IN ('scheduled', 'rescheduled')
      AND scheduled_at > now()
      AND extract(isodow FROM (scheduled_at AT TIME ZONE 'America/Sao_Paulo')) = 3
      AND meeting_url ~* '^https://meet\.google\.com/[a-z]{3}-[a-z]{4}-[a-z]{3}(?:[/?#].*)?$'
      AND prospect_id IS NOT NULL
      AND conversa_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'VIVER_WEDNESDAY_RECURRING_MEETING_NOT_VERIFIED';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.orbit_whatsapp_outbox
    WHERE empresa_id = v_empresa_id
      AND payload->>'template_id' = v_old_audio_id::text
      AND status NOT IN ('sent', 'delivered', 'read', 'canceled', 'failed', 'SENT', 'DELIVERED', 'READ')
  ) THEN
    RAISE EXCEPTION 'VIVER_TUESDAY_AUDIO_ALREADY_QUEUED';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.orbit_flow_scheduled_actions
    WHERE empresa_id = v_empresa_id
      AND status = 'running'
      AND action_config->>'template_id' = v_old_audio_id::text
  ) THEN
    RAISE EXCEPTION 'VIVER_TUESDAY_AUDIO_ACTION_RUNNING';
  END IF;

  SELECT id INTO v_invite_id
  FROM public.orbit_message_templates
  WHERE empresa_id = v_empresa_id
    AND nome = 'Viver - Convite aula em grupo quarta 19h30 (texto)'
  ORDER BY created_at
  LIMIT 1;

  IF v_invite_id IS NULL THEN
    INSERT INTO public.orbit_message_templates
      (empresa_id, canal, nome, categoria, corpo_texto, variaveis, ativo)
    VALUES
      (v_empresa_id, 'whatsapp',
       'Viver - Convite aula em grupo quarta 19h30 (texto)', 'marketing',
       'Na quarta-feira, às 19h30, teremos uma aula ao vivo. Você quer participar?',
       ARRAY[]::text[], true)
    RETURNING id INTO v_invite_id;
  END IF;

  UPDATE public.orbit_ai_config
  SET prompt_roteiro = replace(
        coalesce(prompt_roteiro, ''),
        'aula em grupo de terca-feira as 19:30',
        'aula em grupo de quarta-feira as 19:30'
      ),
      updated_at = now()
  WHERE empresa_id = v_empresa_id;

  UPDATE public.orbit_message_templates
  SET corpo_texto = replace(coalesce(corpo_texto, ''),
        'terca-feira, as 19:30', 'quarta-feira, as 19:30'),
      updated_at = now()
  WHERE empresa_id = v_empresa_id AND nome = 'Aula Grupo - Envio Link';

  -- Preserve the D+1 cadence but do not send the obsolete Tuesday recording.
  UPDATE public.orbit_flow_actions
  SET action_config = jsonb_set(action_config, '{template_id}', to_jsonb(v_invite_id::text), true)
  WHERE flow_id = '9f20eab5-abfe-4998-a8ac-a7afa616f1e6'
    AND ordem = 2
    AND action_config->>'template_id' = v_old_audio_id::text;

  UPDATE public.orbit_flow_scheduled_actions
  SET action_config = jsonb_set(action_config, '{template_id}', to_jsonb(v_invite_id::text), true)
  WHERE empresa_id = v_empresa_id
    AND status = 'pending'
    AND action_config->>'template_id' = v_old_audio_id::text;

  UPDATE public.orbit_message_templates
  SET ativo = false, updated_at = now()
  WHERE empresa_id = v_empresa_id AND id = v_old_audio_id;

  UPDATE public.orbit_audio_library
  SET ativo = false, updated_at = now()
  WHERE empresa_id = v_empresa_id AND id = v_old_audio_id;
END
$wednesday$;
