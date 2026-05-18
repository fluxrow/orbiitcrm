
CREATE OR REPLACE FUNCTION public.pe_backfill_import_as_lista(
  p_import_id uuid,
  p_empresa_id uuid,
  p_lista_tag text,
  p_window_minutes int DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_created_at timestamptz;
  v_start timestamptz;
  v_end timestamptz;
  v_candidates int;
  v_already int;
  v_tagged int;
BEGIN
  IF p_lista_tag IS NULL OR p_lista_tag = '' OR position('lista:' in p_lista_tag) <> 1 THEN
    RAISE EXCEPTION 'invalid_lista_tag';
  END IF;

  SELECT created_at INTO v_created_at
  FROM orbit_import_history
  WHERE id = p_import_id AND empresa_id = p_empresa_id;

  IF v_created_at IS NULL THEN
    RAISE EXCEPTION 'import_not_found';
  END IF;

  v_start := v_created_at - make_interval(mins => p_window_minutes);
  v_end   := v_created_at + make_interval(mins => p_window_minutes);

  SELECT count(*) INTO v_candidates
  FROM orbit_prospects
  WHERE empresa_id = p_empresa_id
    AND origem_contato = 'IMPORTACAO'
    AND created_at BETWEEN v_start AND v_end;

  SELECT count(*) INTO v_already
  FROM orbit_prospects
  WHERE empresa_id = p_empresa_id
    AND origem_contato = 'IMPORTACAO'
    AND created_at BETWEEN v_start AND v_end
    AND p_lista_tag = ANY(COALESCE(tags, ARRAY[]::text[]));

  WITH upd AS (
    UPDATE orbit_prospects
    SET tags = (
      SELECT array_agg(DISTINCT x)
      FROM unnest(COALESCE(tags, ARRAY[]::text[]) || ARRAY[p_lista_tag]) AS x
    )
    WHERE empresa_id = p_empresa_id
      AND origem_contato = 'IMPORTACAO'
      AND created_at BETWEEN v_start AND v_end
      AND NOT (p_lista_tag = ANY(COALESCE(tags, ARRAY[]::text[])))
    RETURNING 1
  )
  SELECT count(*) INTO v_tagged FROM upd;

  RETURN jsonb_build_object(
    'lista_tag', p_lista_tag,
    'candidates', v_candidates,
    'tagged', v_tagged,
    'already_tagged', v_already
  );
END;
$$;
