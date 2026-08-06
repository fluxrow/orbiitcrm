ALTER TABLE public.orbit_google_tokens
  ADD COLUMN IF NOT EXISTS availability_break_start time,
  ADD COLUMN IF NOT EXISTS availability_break_end time;

ALTER TABLE public.orbit_google_tokens
  DROP CONSTRAINT IF EXISTS orbit_google_tokens_availability_break_check;

ALTER TABLE public.orbit_google_tokens
  ADD CONSTRAINT orbit_google_tokens_availability_break_check CHECK (
    (availability_break_start IS NULL AND availability_break_end IS NULL)
    OR (
      availability_break_start IS NOT NULL
      AND availability_break_end IS NOT NULL
      AND availability_break_start < availability_break_end
      AND availability_break_start >= availability_start
      AND availability_break_end <= availability_end
    )
  );

COMMENT ON COLUMN public.orbit_google_tokens.availability_break_start
  IS 'Início opcional da pausa diária em que o agente não pode agendar.';
COMMENT ON COLUMN public.orbit_google_tokens.availability_break_end
  IS 'Fim opcional da pausa diária em que o agente não pode agendar.';

UPDATE public.orbit_google_tokens
SET availability_break_start = '12:00'::time,
    availability_break_end = '14:00'::time,
    updated_at = now()
WHERE empresa_id = 'fa0ac793-5c5a-43c6-b4c2-eacc276d0d67';
