DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_rel pr
    JOIN pg_class c ON c.oid = pr.prrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_publication p ON p.oid = pr.prpubid
    WHERE p.pubname = 'supabase_realtime'
      AND n.nspname = 'public'
      AND c.relname = 'orbit_deals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orbit_deals;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_rel pr
    JOIN pg_class c ON c.oid = pr.prrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_publication p ON p.oid = pr.prpubid
    WHERE p.pubname = 'supabase_realtime'
      AND n.nspname = 'public'
      AND c.relname = 'orbit_campaigns'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orbit_campaigns;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_rel pr
    JOIN pg_class c ON c.oid = pr.prrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_publication p ON p.oid = pr.prpubid
    WHERE p.pubname = 'supabase_realtime'
      AND n.nspname = 'public'
      AND c.relname = 'orbit_campaign_recipients'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orbit_campaign_recipients;
  END IF;
END;
$$;

ALTER TABLE public.orbit_prospects
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.orbit_deals
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_orbit_prospects_active
  ON public.orbit_prospects(empresa_id, created_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_orbit_deals_active
  ON public.orbit_deals(empresa_id, created_at)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public.normalize_tags()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.tags := array(
    SELECT DISTINCT lower(trim(t))
    FROM unnest(COALESCE(NEW.tags, '{}'::text[])) AS t
    WHERE trim(t) <> ''
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_normalize_tags ON public.orbit_prospects;

CREATE TRIGGER tg_normalize_tags
  BEFORE INSERT OR UPDATE OF tags ON public.orbit_prospects
  FOR EACH ROW EXECUTE FUNCTION public.normalize_tags();

CREATE OR REPLACE FUNCTION public.preview_campaign_recipients(
  p_empresa_id uuid,
  p_canal text,
  p_filtros jsonb DEFAULT '{}'::jsonb,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 25
)
RETURNS TABLE(
  prospect_id uuid,
  nome_razao text,
  nome_fantasia text,
  email_principal text,
  whatsapp text,
  telefone text,
  status_qualificacao text,
  segmento text,
  cidade text,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_filtros jsonb := COALESCE(p_filtros, '{}'::jsonb);
  v_tags text[];
  v_status_qual text[];
  v_selected_prospect_ids uuid[];
  v_selected_group_ids uuid[];
  v_segmento text;
  v_cidade text;
  v_estado text;
  v_origem_contato text;
  v_origem_lead text;
  v_score_min int;
  v_responsavel_id uuid;
  v_apenas_consent boolean := false;
  v_tem_email boolean := false;
  v_tem_telefone boolean := false;
  v_tipo text;
  v_excluir_campanha_id uuid;
  v_apenas_abriu_campanha_id uuid;
  v_nao_abriu_campanha_id uuid;
  v_page integer := GREATEST(COALESCE(p_page, 1), 1);
  v_page_size integer := GREATEST(COALESCE(p_page_size, 25), 1);
  v_offset integer;
BEGIN
  IF NOT (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR get_user_empresa_id(auth.uid()) = p_empresa_id
  ) THEN
    RAISE EXCEPTION 'Não autorizado para esta empresa';
  END IF;

  IF jsonb_typeof(v_filtros->'tags') = 'array' THEN
    SELECT array_agg(value::text) INTO v_tags
    FROM jsonb_array_elements_text(v_filtros->'tags');
  END IF;

  IF jsonb_typeof(v_filtros->'status_qualificacao') = 'array' THEN
    SELECT array_agg(value::text) INTO v_status_qual
    FROM jsonb_array_elements_text(v_filtros->'status_qualificacao');
  END IF;

  IF jsonb_typeof(v_filtros->'selected_prospect_ids') = 'array' THEN
    SELECT array_agg(value::uuid) INTO v_selected_prospect_ids
    FROM jsonb_array_elements_text(v_filtros->'selected_prospect_ids');
  END IF;

  IF jsonb_typeof(v_filtros->'selected_group_ids') = 'array' THEN
    SELECT array_agg(value::uuid) INTO v_selected_group_ids
    FROM jsonb_array_elements_text(v_filtros->'selected_group_ids');
  END IF;

  v_segmento := NULLIF(v_filtros->>'segmento', '');
  v_cidade := NULLIF(v_filtros->>'cidade', '');
  v_estado := NULLIF(v_filtros->>'estado', '');
  v_origem_contato := NULLIF(v_filtros->>'origem_contato', '');
  v_origem_lead := NULLIF(v_filtros->>'origem_lead', '');
  v_score_min := NULLIF(v_filtros->>'score_min', '')::int;
  v_responsavel_id := NULLIF(v_filtros->>'responsavel_id', '')::uuid;
  v_apenas_consent := COALESCE((v_filtros->>'apenas_consentimento')::boolean, false);
  v_tem_email := COALESCE((v_filtros->>'tem_email')::boolean, false);
  v_tem_telefone := COALESCE((v_filtros->>'tem_telefone')::boolean, false);
  v_tipo := NULLIF(v_filtros->>'tipo', '');
  v_excluir_campanha_id := NULLIF(v_filtros->>'excluir_campanha_id', '')::uuid;
  v_apenas_abriu_campanha_id := NULLIF(v_filtros->>'apenas_abriu_campanha_id', '')::uuid;
  v_nao_abriu_campanha_id := NULLIF(v_filtros->>'nao_abriu_campanha_id', '')::uuid;
  v_offset := (v_page - 1) * v_page_size;

  RETURN QUERY
  WITH selected_group_members AS (
    SELECT DISTINCT unnest(g.prospect_ids) AS prospect_id
    FROM public.orbit_send_groups g
    WHERE v_selected_group_ids IS NOT NULL
      AND g.empresa_id = p_empresa_id
      AND g.id = ANY(v_selected_group_ids)
  ),
  manual_ids AS (
    SELECT unnest(COALESCE(v_selected_prospect_ids, '{}'::uuid[])) AS prospect_id
    UNION
    SELECT prospect_id FROM selected_group_members
  ),
  filtered_ids AS (
    SELECT p.id AS prospect_id
    FROM public.orbit_prospects p
    WHERE p.empresa_id = p_empresa_id
      AND p.deleted_at IS NULL
      AND (v_tags IS NULL OR p.tags && v_tags)
      AND (v_status_qual IS NULL OR p.status_qualificacao = ANY(v_status_qual))
      AND (v_segmento IS NULL OR p.segmento = v_segmento)
      AND (v_cidade IS NULL OR p.cidade ILIKE '%' || v_cidade || '%')
      AND (v_estado IS NULL OR p.estado = v_estado)
      AND (v_origem_contato IS NULL OR p.origem_contato = v_origem_contato)
      AND (v_origem_lead IS NULL OR p.origem_lead = v_origem_lead)
      AND (v_score_min IS NULL OR COALESCE(p.score, 0) >= v_score_min)
      AND (v_responsavel_id IS NULL OR p.responsavel_id = v_responsavel_id)
      AND (v_tipo IS NULL OR p.tipo = v_tipo)
      AND (NOT v_tem_email OR (p.email_principal IS NOT NULL AND p.email_principal <> ''))
      AND (NOT v_tem_telefone OR (COALESCE(p.whatsapp, p.telefone) IS NOT NULL AND COALESCE(p.whatsapp, p.telefone) <> ''))
      AND (
        v_excluir_campanha_id IS NULL OR NOT EXISTS (
          SELECT 1
          FROM public.orbit_campaign_recipients r
          WHERE r.campaign_id = v_excluir_campanha_id
            AND r.prospect_id = p.id
        )
      )
      AND (
        v_apenas_abriu_campanha_id IS NULL OR EXISTS (
          SELECT 1
          FROM public.orbit_campaign_recipients r
          WHERE r.campaign_id = v_apenas_abriu_campanha_id
            AND r.prospect_id = p.id
            AND r.opened_at IS NOT NULL
        )
      )
      AND (
        v_nao_abriu_campanha_id IS NULL OR (
          EXISTS (
            SELECT 1
            FROM public.orbit_campaign_recipients r
            WHERE r.campaign_id = v_nao_abriu_campanha_id
              AND r.prospect_id = p.id
          )
          AND NOT EXISTS (
            SELECT 1
            FROM public.orbit_campaign_recipients r
            WHERE r.campaign_id = v_nao_abriu_campanha_id
              AND r.prospect_id = p.id
              AND r.opened_at IS NOT NULL
          )
        )
      )
  ),
  combined_ids AS (
    SELECT prospect_id FROM filtered_ids
    UNION
    SELECT prospect_id FROM manual_ids
  ),
  eligible AS (
    SELECT
      p.id AS prospect_id,
      p.nome_razao,
      p.nome_fantasia,
      p.email_principal,
      p.whatsapp,
      p.telefone,
      p.status_qualificacao,
      p.segmento,
      p.cidade,
      p.created_at
    FROM public.orbit_prospects p
    JOIN combined_ids c ON c.prospect_id = p.id
    WHERE p.empresa_id = p_empresa_id
      AND p.deleted_at IS NULL
      AND (
        p_canal <> 'email' OR (
          p.email_principal IS NOT NULL
          AND p.email_principal <> ''
          AND COALESCE(p.optout_email, false) = false
          AND (NOT v_apenas_consent OR COALESCE(p.consentimento_email, false) = true)
        )
      )
      AND (
        p_canal = 'email' OR (
          COALESCE(p.whatsapp, p.telefone) IS NOT NULL
          AND COALESCE(p.whatsapp, p.telefone) <> ''
          AND COALESCE(p.optout_whatsapp, false) = false
          AND (NOT v_apenas_consent OR COALESCE(p.consentimento_whatsapp, false) = true)
        )
      )
  ),
  numbered AS (
    SELECT
      e.prospect_id,
      e.nome_razao,
      e.nome_fantasia,
      e.email_principal,
      e.whatsapp,
      e.telefone,
      e.status_qualificacao,
      e.segmento,
      e.cidade,
      count(*) OVER() AS total_count,
      row_number() OVER (
        ORDER BY COALESCE(e.nome_razao, e.nome_fantasia, ''), e.created_at DESC NULLS LAST
      ) AS rn
    FROM eligible e
  )
  SELECT
    n.prospect_id,
    n.nome_razao,
    n.nome_fantasia,
    n.email_principal,
    n.whatsapp,
    n.telefone,
    n.status_qualificacao,
    n.segmento,
    n.cidade,
    n.total_count
  FROM numbered n
  WHERE n.rn > v_offset
    AND n.rn <= v_offset + v_page_size
  ORDER BY n.rn;
END;
$$;

GRANT EXECUTE ON FUNCTION public.preview_campaign_recipients(uuid, text, jsonb, integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.pe_populate_campaign_recipients(p_campaign_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_campaign RECORD;
  v_inserted int := 0;
  v_already int := 0;
  v_total int := 0;
BEGIN
  SELECT * INTO v_campaign FROM public.orbit_campaigns WHERE id = p_campaign_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Campanha não encontrada: %', p_campaign_id;
  END IF;

  IF NOT (
    has_role(auth.uid(), 'super_admin'::app_role)
    OR get_user_empresa_id(auth.uid()) = v_campaign.empresa_id
  ) THEN
    RAISE EXCEPTION 'Não autorizado para esta campanha';
  END IF;

  WITH eligible AS (
    SELECT
      p.prospect_id,
      p.email_principal,
      COALESCE(p.whatsapp, p.telefone) AS telefone
    FROM public.preview_campaign_recipients(
      v_campaign.empresa_id,
      v_campaign.canal,
      COALESCE(v_campaign.filtros_json, '{}'::jsonb),
      1,
      2147483647
    ) p
  ),
  ins AS (
    INSERT INTO public.orbit_campaign_recipients (campaign_id, empresa_id, prospect_id, email, telefone, status)
    SELECT p_campaign_id, v_campaign.empresa_id, e.prospect_id, e.email_principal, e.telefone, 'pendente'
    FROM eligible e
    ON CONFLICT (campaign_id, prospect_id) WHERE campaign_id IS NOT NULL AND prospect_id IS NOT NULL DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_inserted FROM ins;

  SELECT count(*) INTO v_total
  FROM public.orbit_campaign_recipients
  WHERE campaign_id = p_campaign_id;

  v_already := GREATEST(v_total - v_inserted, 0);

  UPDATE public.orbit_campaigns
  SET total_destinatarios = v_total, updated_at = now()
  WHERE id = p_campaign_id;

  RETURN jsonb_build_object(
    'inserted', v_inserted,
    'already_present', v_already,
    'total', v_total
  );
END;
$$;
