ALTER TABLE public.orbit_ai_config
  ADD COLUMN IF NOT EXISTS scheduling_mode text NOT NULL DEFAULT 'auto_calendar',
  ADD COLUMN IF NOT EXISTS scheduling_handoff_whatsapp text,
  ADD COLUMN IF NOT EXISTS scheduling_handoff_message text,
  ADD COLUMN IF NOT EXISTS scheduling_meeting_duration_minutes integer NOT NULL DEFAULT 60;

ALTER TABLE public.orbit_ai_config
  DROP CONSTRAINT IF EXISTS orbit_ai_config_scheduling_mode_check,
  ADD CONSTRAINT orbit_ai_config_scheduling_mode_check
    CHECK (scheduling_mode IN ('auto_calendar', 'human_handoff_after_period')),
  DROP CONSTRAINT IF EXISTS orbit_ai_config_scheduling_duration_check,
  ADD CONSTRAINT orbit_ai_config_scheduling_duration_check
    CHECK (scheduling_meeting_duration_minutes BETWEEN 10 AND 240);

COMMENT ON COLUMN public.orbit_ai_config.scheduling_mode IS
  'Modo de agendamento por tenant. auto_calendar oferece slots e agenda; human_handoff_after_period coleta manha/tarde/noite e transfere para um humano.';
COMMENT ON COLUMN public.orbit_ai_config.scheduling_handoff_whatsapp IS
  'WhatsApp opcional que recebe o handoff de agendamento no modo human_handoff_after_period.';
COMMENT ON COLUMN public.orbit_ai_config.scheduling_handoff_message IS
  'Resposta fixa opcional enviada ao lead quando o periodo foi coletado e a conversa sera assumida por um humano.';
COMMENT ON COLUMN public.orbit_ai_config.scheduling_meeting_duration_minutes IS
  'Duracao padrao da reuniao usada pelo modo de agendamento do tenant.';