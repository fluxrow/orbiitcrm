-- Janela de atendimento usada pelo agente ao consultar freeBusy.
-- Defaults preservam o comportamento anterior (09:00-18:00) para todos os tenants.
ALTER TABLE public.orbit_google_tokens
  ADD COLUMN IF NOT EXISTS availability_start time NOT NULL DEFAULT '09:00',
  ADD COLUMN IF NOT EXISTS availability_end time NOT NULL DEFAULT '18:00';

ALTER TABLE public.orbit_google_tokens
  DROP CONSTRAINT IF EXISTS orbit_google_tokens_availability_window_check;

ALTER TABLE public.orbit_google_tokens
  ADD CONSTRAINT orbit_google_tokens_availability_window_check
  CHECK (availability_start < availability_end);

