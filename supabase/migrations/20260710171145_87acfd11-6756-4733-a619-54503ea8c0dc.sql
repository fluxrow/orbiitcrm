
-- === Lead Score global feature ===============================================
-- Per-tenant configurable lead scoring. Disabled by default. Fábrica piloto.

-- 1) Config table
CREATE TABLE IF NOT EXISTS public.orbit_lead_score_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL UNIQUE REFERENCES public.orbit_empresas(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1,
  rules jsonb NOT NULL DEFAULT '{"signals":[],"overrides":[]}'::jsonb,
  thresholds jsonb NOT NULL DEFAULT '[
    {"label":"cold","min":0,"max":29},
    {"label":"warm","min":30,"max":59},
    {"label":"hot","min":60,"max":79},
    {"label":"priority","min":80,"max":100}
  ]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.orbit_lead_score_config TO authenticated;
GRANT ALL ON public.orbit_lead_score_config TO service_role;

ALTER TABLE public.orbit_lead_score_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lead_score_config_select_same_empresa"
  ON public.orbit_lead_score_config FOR SELECT TO authenticated
  USING (
    empresa_id = public.get_user_empresa_id(auth.uid())
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE POLICY "lead_score_config_admin_write"
  ON public.orbit_lead_score_config FOR ALL TO authenticated
  USING (
    (empresa_id = public.get_user_empresa_id(auth.uid())
      AND public.pe_user_is_orbit_admin(auth.uid()))
    OR public.has_role(auth.uid(), 'super_admin')
  )
  WITH CHECK (
    (empresa_id = public.get_user_empresa_id(auth.uid())
      AND public.pe_user_is_orbit_admin(auth.uid()))
    OR public.has_role(auth.uid(), 'super_admin')
  );

CREATE TRIGGER trg_orbit_lead_score_config_updated_at
  BEFORE UPDATE ON public.orbit_lead_score_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Prospect result columns (reuse existing "score" for numeric)
ALTER TABLE public.orbit_prospects
  ADD COLUMN IF NOT EXISTS lead_score_label text,
  ADD COLUMN IF NOT EXISTS lead_score_reasons jsonb,
  ADD COLUMN IF NOT EXISTS lead_score_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS lead_score_version integer;

-- 3) Helper: flatten prospect + dados_adicionais into a single searchable text
CREATE OR REPLACE FUNCTION public._lead_score_haystack(p_prospect public.orbit_prospects)
RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT lower(coalesce(
    concat_ws(' | ',
      p_prospect.observacoes,
      p_prospect.segmento,
      p_prospect.origem_lead,
      p_prospect.status_qualificacao,
      array_to_string(p_prospect.tags, ' | '),
      coalesce(p_prospect.dados_adicionais::text, '')
    ), ''));
$$;

-- 4) RPC: recalculate score for a prospect
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
  v_result jsonb;
BEGIN
  -- Auth: allow same-empresa user, super_admin or service_role
  IF NOT (
    public.has_role(auth.uid(), 'super_admin')
    OR auth.role() = 'service_role'
    OR p_empresa_id = public.get_user_empresa_id(auth.uid())
  ) THEN
    RAISE EXCEPTION 'not_authorized';
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

  -- Signals: each has { id, weight, patterns:[regex...] }. Fires if ANY pattern matches.
  FOR v_signal IN SELECT * FROM jsonb_array_elements(coalesce(v_cfg.rules->'signals','[]'::jsonb))
  LOOP
    v_matched := false;
    FOR v_pat IN SELECT jsonb_array_elements_text(coalesce(v_signal->'patterns','[]'::jsonb))
    LOOP
      IF v_hay ~* v_pat THEN v_matched := true; EXIT; END IF;
    END LOOP;
    IF v_matched THEN
      v_score := v_score + coalesce((v_signal->>'weight')::int, 0);
      v_reasons := v_reasons || jsonb_build_object(
        'id', v_signal->>'id',
        'weight', (v_signal->>'weight')::int
      );
    END IF;
  END LOOP;

  IF v_score < 0 THEN v_score := 0; END IF;
  IF v_score > 100 THEN v_score := 100; END IF;

  -- Compute base label from thresholds
  v_label := 'cold';
  FOR v_thr IN SELECT * FROM jsonb_array_elements(v_cfg.thresholds)
  LOOP
    IF v_score >= (v_thr->>'min')::int AND v_score <= (v_thr->>'max')::int THEN
      v_label := v_thr->>'label'; EXIT;
    END IF;
  END LOOP;

  -- Overrides: { id, min_label, patterns_all:[regex...] } (all must match)
  FOR v_override IN SELECT * FROM jsonb_array_elements(coalesce(v_cfg.rules->'overrides','[]'::jsonb))
  LOOP
    v_all_ok := true;
    FOR v_pat IN SELECT jsonb_array_elements_text(coalesce(v_override->'patterns_all','[]'::jsonb))
    LOOP
      IF v_hay !~* v_pat THEN v_all_ok := false; EXIT; END IF;
    END LOOP;
    IF v_all_ok THEN
      v_min_label := v_override->>'min_label';
      -- rank by threshold order
      SELECT ord INTO v_label_rank FROM (
        SELECT (t->>'label') AS lbl, row_number() OVER () AS ord
        FROM jsonb_array_elements(v_cfg.thresholds) t
      ) x WHERE lbl = v_label;
      SELECT ord INTO v_min_rank FROM (
        SELECT (t->>'label') AS lbl, row_number() OVER () AS ord
        FROM jsonb_array_elements(v_cfg.thresholds) t
      ) x WHERE lbl = v_min_label;
      IF v_min_rank IS NOT NULL AND (v_label_rank IS NULL OR v_min_rank > v_label_rank) THEN
        v_label := v_min_label;
        v_reasons := v_reasons || jsonb_build_object(
          'id', v_override->>'id',
          'override_min_label', v_min_label
        );
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

  v_result := jsonb_build_object(
    'ok', true,
    'score', v_score,
    'label', v_label,
    'reasons', v_reasons,
    'version', v_cfg.version
  );
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.recalculate_lead_score(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.recalculate_lead_score(uuid, uuid) TO authenticated, service_role;

-- 5) Seed Fábrica piloto config (enabled)
INSERT INTO public.orbit_lead_score_config (empresa_id, enabled, version, rules, thresholds)
VALUES (
  'fa0ac793-5c5a-43c6-b4c2-eacc276d0d67',
  true,
  1,
  jsonb_build_object(
    'signals', jsonb_build_array(
      jsonb_build_object('id','renda_6_7','weight',10,'patterns',jsonb_build_array('r\$\s*6', 'r\$\s*7', '6\.?000', '7\.?000', '6 mil', '7 mil')),
      jsonb_build_object('id','renda_8_9','weight',20,'patterns',jsonb_build_array('r\$\s*8', 'r\$\s*9', '8\.?000', '9\.?000', '8 mil', '9 mil')),
      jsonb_build_object('id','renda_10_15','weight',25,'patterns',jsonb_build_array('r\$\s*1[0-5]','1[0-5]\.?000','1[0-5] mil','10 a 15','entre 10 e 15')),
      jsonb_build_object('id','renda_16_plus','weight',30,'patterns',jsonb_build_array('r\$\s*(1[6-9]|[2-9][0-9])','(1[6-9]|[2-9][0-9])\.?000','(1[6-9]|[2-9][0-9]) mil','acima de 16','mais de 16')),
      jsonb_build_object('id','servidor_professor','weight',15,'patterns',jsonb_build_array('servidor','professor','docente','profissional com progress','plano de carreira')),
      jsonb_build_object('id','motivacao_profissional','weight',15,'patterns',jsonb_build_array('motivac[aã]o profissional','crescer na carreira','progress[aã]o','ascens[aã]o profissional')),
      jsonb_build_object('id','edital_aberto','weight',30,'patterns',jsonb_build_array('edital aberto','edital publicado','inscri[cç][oõ]es abertas')),
      jsonb_build_object('id','prazo_proximo','weight',25,'patterns',jsonb_build_array('prazo pr[oó]ximo','pouco tempo','urgente','fecha em','poucos dias')),
      jsonb_build_object('id','instituicao_definida','weight',15,'patterns',jsonb_build_array('institui[cç][aã]o definida','programa definido','universidade escolhida','ppg')),
      jsonb_build_object('id','falta_de_tempo','weight',20,'patterns',jsonb_build_array('falta de tempo','sem tempo','tempo curto','n[aã]o tenho tempo')),
      jsonb_build_object('id','dificuldade_edital','weight',15,'patterns',jsonb_build_array('dificuldade com edital','dificuldade com projeto','n[aã]o sei fazer projeto','n[aã]o entendo edital')),
      jsonb_build_object('id','respondeu_primeira','weight',10,'patterns',jsonb_build_array('respondeu','primeira resposta','engaj')),
      jsonb_build_object('id','pediu_diagnostico','weight',30,'patterns',jsonb_build_array('diagn[oó]stico','quero uma reuni[aã]o','agendar reuni[aã]o','marcar call')),
      jsonb_build_object('id','decisao_propria','weight',10,'patterns',jsonb_build_array('decis[aã]o s[oó] depende de mim','s[oó] depende de mim','decido sozinh')),
      jsonb_build_object('id','iniciar_em_breve','weight',20,'patterns',jsonb_build_array('come[cç]ar nos pr[oó]ximos dias','iniciar em breve','quero come[cç]ar j[aá]','pr[oó]xima semana'))
    ),
    'overrides', jsonb_build_array(
      jsonb_build_object(
        'id','edital_aberto_com_prazo_proximo',
        'min_label','hot',
        'patterns_all', jsonb_build_array('edital', 'prazo|urgente|pouco tempo|poucos dias|fecha em')
      )
    )
  ),
  '[
    {"label":"cold","min":0,"max":29},
    {"label":"warm","min":30,"max":59},
    {"label":"hot","min":60,"max":79},
    {"label":"priority","min":80,"max":100}
  ]'::jsonb
)
ON CONFLICT (empresa_id) DO UPDATE
  SET enabled = EXCLUDED.enabled,
      rules = EXCLUDED.rules,
      thresholds = EXCLUDED.thresholds,
      version = public.orbit_lead_score_config.version + 1,
      updated_at = now();
