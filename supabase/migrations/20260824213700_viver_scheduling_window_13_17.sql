-- Viver Semijoias only: constrain automatic Google Calendar scheduling to
-- the tenant-local half-open window [13:00, 17:00).
BEGIN;

DO $migration$
DECLARE
  v_empresa_id uuid;
  v_google_token_id uuid;
  v_previous_start time;
  v_previous_end time;
  v_row_count integer;
BEGIN
  SELECT e.id,
         g.id,
         g.availability_start,
         g.availability_end
    INTO v_empresa_id,
         v_google_token_id,
         v_previous_start,
         v_previous_end
  FROM public.orbit_empresas e
  JOIN public.orbit_google_tokens g
    ON g.empresa_id = e.id
  WHERE e.slug = 'viver-semijoias'
    AND e.id = '36f26579-66ad-4ef1-9788-141e4c727232'::uuid
  FOR UPDATE OF g;

  IF v_empresa_id IS NULL OR v_google_token_id IS NULL THEN
    RAISE EXCEPTION 'VIVER_SCHEDULING_CONFIG_NOT_FOUND';
  END IF;

  SELECT count(*)
    INTO v_row_count
  FROM public.orbit_google_tokens g
  WHERE g.empresa_id = v_empresa_id;

  IF v_row_count <> 1 THEN
    RAISE EXCEPTION 'VIVER_SCHEDULING_CONFIG_AMBIGUOUS: % rows', v_row_count;
  END IF;

  UPDATE public.orbit_google_tokens
  SET availability_start = '13:00'::time,
      availability_end = '17:00'::time,
      updated_at = now()
  WHERE id = v_google_token_id
    AND empresa_id = v_empresa_id;

  GET DIAGNOSTICS v_row_count = ROW_COUNT;
  IF v_row_count <> 1 THEN
    RAISE EXCEPTION 'VIVER_SCHEDULING_CONFIG_UPDATE_FAILED';
  END IF;

  INSERT INTO public.orbit_audit_log(
    empresa_id,
    user_id,
    acao,
    entidade,
    entidade_id,
    detalhes
  )
  VALUES (
    v_empresa_id,
    NULL,
    'update_scheduling_window',
    'orbit_google_tokens',
    v_google_token_id,
    jsonb_build_object(
      'source', 'migration_viver_scheduling_window_13_17',
      'changed_fields', jsonb_build_array('availability_start', 'availability_end'),
      'previous_window', jsonb_build_object(
        'start', v_previous_start::text,
        'end', v_previous_end::text
      ),
      'new_window', jsonb_build_object(
        'start', '13:00:00',
        'end', '17:00:00'
      ),
      'timezone', 'America/Sao_Paulo'
    )
  );
END
$migration$;

COMMIT;
