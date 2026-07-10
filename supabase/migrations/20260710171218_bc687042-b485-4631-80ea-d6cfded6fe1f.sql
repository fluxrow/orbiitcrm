
CREATE OR REPLACE FUNCTION public.recalculate_lead_score(
  p_empresa_id uuid,
  p_prospect_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cfg public.orbit_lead_score_config%ROWTYPE;
  v_prospect public.orbit_prospects%ROWTYPE;
  v_hay text;
  v_score int := 0;
  v_reasons jsonb := '[]'::jsonb;
  v_label text;
  v_min_label text;
  v_signal jsonb;
  v_override jsonb;
  v_pat text;
  v_matched boolean;
  v_all_ok boolean;
  v_thr jsonb;
  v_label_rank int;
  v_min_rank int;
  v_is_privileged boolean;
BEGIN
  v_is_privileged := session_user IN ('postgres','supabase_admin','service_role')
    OR (auth.jwt() IS NOT NULL AND auth.role() = 'service_role');

  IF NOT v_is_privileged THEN
    IF NOT (
      public.has_role(auth.uid(), 'super_admin')
      OR p_empresa_id = public.get_user_empresa_id(auth.uid())
    ) THEN
      RAISE EXCEPTION 'not_authorized';
    END IF;
  END IF;

  SELECT * INTO v_cfg FROM public.orbit_lead_score_config WHERE empresa_id = p_empresa_id;
  IF NOT FOUND OR NOT v_cfg.enabled THEN
    RETURN jsonb_build_object('ok', true, 'skipped', 'feature_disabled');
  END IF;

  SELECT * INTO v_prospect FROM public.orbit_prospects
    WHERE id = p_prospect_id AND empresa_id = p_empresa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'prospect_not_found';
  END IF;

  v_hay := public._lead_score_haystack(v_prospect);

  FOR v_signal IN SELECT * FROM jsonb_array_elements(coalesce(v_cfg.rules->'signals','[]'::jsonb))
  LOOP
    v_matched := false;
    FOR v_pat IN SELECT jsonb_array_elements_text(coalesce(v_signal->'patterns','[]'::jsonb))
    LOOP
      IF v_hay ~* v_pat THEN v_matched := true; EXIT; END IF;
    END LOOP;
    IF v_matched THEN
      v_score := v_score + coalesce((v_signal->>'weight')::int, 0);
      v_reasons := v_reasons || jsonb_build_object('id', v_signal->>'id','weight', (v_signal->>'weight')::int);
    END IF;
  END LOOP;

  IF v_score < 0 THEN v_score := 0; END IF;
  IF v_score > 100 THEN v_score := 100; END IF;

  v_label := 'cold';
  FOR v_thr IN SELECT * FROM jsonb_array_elements(v_cfg.thresholds)
  LOOP
    IF v_score >= (v_thr->>'min')::int AND v_score <= (v_thr->>'max')::int THEN
      v_label := v_thr->>'label'; EXIT;
    END IF;
  END LOOP;

  FOR v_override IN SELECT * FROM jsonb_array_elements(coalesce(v_cfg.rules->'overrides','[]'::jsonb))
  LOOP
    v_all_ok := true;
    FOR v_pat IN SELECT jsonb_array_elements_text(coalesce(v_override->'patterns_all','[]'::jsonb))
    LOOP
      IF v_hay !~* v_pat THEN v_all_ok := false; EXIT; END IF;
    END LOOP;
    IF v_all_ok THEN
      v_min_label := v_override->>'min_label';
      SELECT ord INTO v_label_rank FROM (
        SELECT (t->>'label') AS lbl, row_number() OVER () AS ord FROM jsonb_array_elements(v_cfg.thresholds) t
      ) x WHERE lbl = v_label;
      SELECT ord INTO v_min_rank FROM (
        SELECT (t->>'label') AS lbl, row_number() OVER () AS ord FROM jsonb_array_elements(v_cfg.thresholds) t
      ) x WHERE lbl = v_min_label;
      IF v_min_rank IS NOT NULL AND (v_label_rank IS NULL OR v_min_rank > v_label_rank) THEN
        v_label := v_min_label;
        v_reasons := v_reasons || jsonb_build_object('id', v_override->>'id','override_min_label', v_min_label);
      END IF;
    END IF;
  END LOOP;

  UPDATE public.orbit_prospects
     SET score = v_score,
         lead_score_label = v_label,
         lead_score_reasons = v_reasons,
         lead_score_updated_at = now(),
         lead_score_version = v_cfg.version
   WHERE id = p_prospect_id;

  RETURN jsonb_build_object('ok', true, 'score', v_score, 'label', v_label, 'reasons', v_reasons, 'version', v_cfg.version);
END;
$$;
