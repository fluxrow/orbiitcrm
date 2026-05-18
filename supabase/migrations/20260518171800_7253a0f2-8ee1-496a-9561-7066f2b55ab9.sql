CREATE OR REPLACE FUNCTION public.pe_populate_campaign_recipients(p_campaign_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign RECORD;
  v_filtros jsonb;
  v_canal text;
  v_empresa_id uuid;
  v_tags text[];
  v_status_qual text[];
  v_segmento text;
  v_cidade text;
  v_estado text;
  v_origem_contato text;
  v_origem_lead text;
  v_score_min int;
  v_responsavel_id uuid;
  v_apenas_consent boolean;
  v_inserted int := 0;
  v_already int := 0;
  v_total int := 0;
BEGIN
  SELECT * INTO v_campaign FROM orbit_campaigns WHERE id = p_campaign_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campanha não encontrada: %', p_campaign_id;
  END IF;

  v_empresa_id := v_campaign.empresa_id;
  v_canal := v_campaign.canal;
  v_filtros := COALESCE(v_campaign.filtros_json, '{}'::jsonb);

  -- Authorization: caller must belong to the same empresa OR be super_admin
  IF NOT (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR get_user_empresa_id(auth.uid()) = v_empresa_id
  ) THEN
    RAISE EXCEPTION 'Não autorizado para esta campanha';
  END IF;

  -- Parse filters
  IF jsonb_typeof(v_filtros->'tags') = 'array' THEN
    SELECT array_agg(value::text) INTO v_tags FROM jsonb_array_elements_text(v_filtros->'tags');
  END IF;
  IF jsonb_typeof(v_filtros->'status_qualificacao') = 'array' THEN
    SELECT array_agg(value::text) INTO v_status_qual FROM jsonb_array_elements_text(v_filtros->'status_qualificacao');
  END IF;
  v_segmento := NULLIF(v_filtros->>'segmento', '');
  v_cidade := NULLIF(v_filtros->>'cidade', '');
  v_estado := NULLIF(v_filtros->>'estado', '');
  v_origem_contato := NULLIF(v_filtros->>'origem_contato', '');
  v_origem_lead := NULLIF(v_filtros->>'origem_lead', '');
  v_score_min := NULLIF(v_filtros->>'score_min', '')::int;
  v_responsavel_id := NULLIF(v_filtros->>'responsavel_id', '')::uuid;
  v_apenas_consent := COALESCE((v_filtros->>'apenas_consentimento')::boolean, false);

  WITH eligible AS (
    SELECT p.id, p.email_principal, COALESCE(p.whatsapp, p.telefone) AS telefone
    FROM orbit_prospects p
    WHERE p.empresa_id = v_empresa_id
      AND (v_tags IS NULL OR p.tags && v_tags)
      AND (v_status_qual IS NULL OR p.status_qualificacao = ANY(v_status_qual))
      AND (v_segmento IS NULL OR p.segmento = v_segmento)
      AND (v_cidade IS NULL OR p.cidade ILIKE '%' || v_cidade || '%')
      AND (v_estado IS NULL OR p.estado = v_estado)
      AND (v_origem_contato IS NULL OR p.origem_contato = v_origem_contato)
      AND (v_origem_lead IS NULL OR p.origem_lead = v_origem_lead)
      AND (v_score_min IS NULL OR COALESCE(p.score, 0) >= v_score_min)
      AND (v_responsavel_id IS NULL OR p.responsavel_id = v_responsavel_id)
      AND (
        v_canal <> 'email' OR (
          p.email_principal IS NOT NULL AND p.email_principal <> ''
          AND COALESCE(p.optout_email, false) = false
          AND (NOT v_apenas_consent OR COALESCE(p.consentimento_email, false) = true)
        )
      )
      AND (
        v_canal = 'email' OR (
          COALESCE(p.whatsapp, p.telefone) IS NOT NULL AND COALESCE(p.whatsapp, p.telefone) <> ''
          AND COALESCE(p.optout_whatsapp, false) = false
          AND (NOT v_apenas_consent OR COALESCE(p.consentimento_whatsapp, false) = true)
        )
      )
  ),
  ins AS (
    INSERT INTO orbit_campaign_recipients (campaign_id, empresa_id, prospect_id, email, telefone, status)
    SELECT p_campaign_id, v_empresa_id, e.id, e.email_principal, e.telefone, 'pendente'
    FROM eligible e
    ON CONFLICT (campaign_id, prospect_id) WHERE campaign_id IS NOT NULL AND prospect_id IS NOT NULL DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM ins;

  SELECT count(*) INTO v_total FROM orbit_campaign_recipients WHERE campaign_id = p_campaign_id;
  v_already := GREATEST(v_total - v_inserted, 0);

  UPDATE orbit_campaigns SET total_destinatarios = v_total, updated_at = now() WHERE id = p_campaign_id;

  RETURN jsonb_build_object(
    'inserted', v_inserted,
    'already_present', v_already,
    'total', v_total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.pe_populate_campaign_recipients(uuid) TO authenticated;