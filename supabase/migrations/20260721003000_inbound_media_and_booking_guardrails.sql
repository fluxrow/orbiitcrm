ALTER TABLE public.orbit_ai_config
  ADD COLUMN IF NOT EXISTS inbound_image_understanding_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS inbound_audio_transcription_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.orbit_google_tokens
  ADD COLUMN IF NOT EXISTS booking_min_notice_minutes integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS booking_max_horizon_days integer NOT NULL DEFAULT 60;

ALTER TABLE public.orbit_google_tokens
  DROP CONSTRAINT IF EXISTS orbit_google_tokens_booking_notice_check,
  ADD CONSTRAINT orbit_google_tokens_booking_notice_check
    CHECK (booking_min_notice_minutes BETWEEN 0 AND 10080),
  DROP CONSTRAINT IF EXISTS orbit_google_tokens_booking_horizon_check,
  ADD CONSTRAINT orbit_google_tokens_booking_horizon_check
    CHECK (booking_max_horizon_days BETWEEN 1 AND 365);

ALTER TABLE public.orbit_mensagens
  ADD COLUMN IF NOT EXISTS media_processing_status text,
  ADD COLUMN IF NOT EXISTS media_extracted_text text,
  ADD COLUMN IF NOT EXISTS media_processing_error text,
  ADD COLUMN IF NOT EXISTS media_processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS media_provider text,
  ADD COLUMN IF NOT EXISTS media_model text;

ALTER TABLE public.orbit_mensagens
  DROP CONSTRAINT IF EXISTS orbit_mensagens_media_processing_status_check,
  ADD CONSTRAINT orbit_mensagens_media_processing_status_check
    CHECK (media_processing_status IS NULL OR media_processing_status IN ('pending','processing','processed','failed','disabled'));

CREATE INDEX IF NOT EXISTS idx_orbit_mensagens_media_pending
  ON public.orbit_mensagens (empresa_id, media_processing_status, timestamp)
  WHERE media_processing_status IN ('pending','processing');

-- Ativação inicial restrita aos tenants já em validação operacional.
UPDATE public.orbit_ai_config
SET inbound_image_understanding_enabled = true,
    inbound_audio_transcription_enabled = true,
    updated_at = now()
WHERE empresa_id IN (
  '36f26579-66ad-4ef1-9788-141e4c727232'::uuid,
  'fa0ac793-5c5a-43c6-b4c2-eacc276d0d67'::uuid
);

COMMENT ON COLUMN public.orbit_ai_config.inbound_image_understanding_enabled IS
  'Permite descrever imagens recebidas antes de acionar o agente. Feature flag por tenant.';
COMMENT ON COLUMN public.orbit_ai_config.inbound_audio_transcription_enabled IS
  'Permite transcrever áudios recebidos antes de acionar o agente. Feature flag por tenant.';
COMMENT ON COLUMN public.orbit_google_tokens.booking_min_notice_minutes IS
  'Antecedência mínima para sugestões e criação automática de eventos.';
COMMENT ON COLUMN public.orbit_google_tokens.booking_max_horizon_days IS
  'Horizonte máximo futuro para sugestões e criação automática de eventos.';
