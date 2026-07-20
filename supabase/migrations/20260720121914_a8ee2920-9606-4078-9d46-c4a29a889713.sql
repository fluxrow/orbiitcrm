
-- 1) Guarda prévia: se já houver duplicata ativa, aborta com mensagem clara (sem apagar/alterar reuniões existentes).
DO $$
DECLARE
  _dup_count int;
BEGIN
  SELECT COUNT(*) INTO _dup_count
  FROM (
    SELECT empresa_id, prospect_id, scheduled_at
    FROM public.orbit_meetings
    WHERE prospect_id IS NOT NULL
      AND status IN ('scheduled','rescheduled')
    GROUP BY empresa_id, prospect_id, scheduled_at
    HAVING COUNT(*) > 1
  ) t;

  IF _dup_count > 0 THEN
    RAISE EXCEPTION 'orbit_meetings possui % grupos duplicados (empresa_id, prospect_id, scheduled_at) ativos. Resolva manualmente antes de aplicar o índice único.', _dup_count;
  END IF;
END
$$;

-- 2) Índice único parcial idempotente
CREATE UNIQUE INDEX IF NOT EXISTS orbit_meetings_uniq_active_slot
  ON public.orbit_meetings (empresa_id, prospect_id, scheduled_at)
  WHERE prospect_id IS NOT NULL
    AND status IN ('scheduled','rescheduled');
