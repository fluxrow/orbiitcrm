-- Wave 2 / Part 1: tenant-scoped atomic prospect and deal mutations.
-- Canary rollout only. No customer tenant is enabled by this migration.

BEGIN;

INSERT INTO public.orbit_feature_flags (
  empresa_id, feature_key, enabled, enabled_at, rollout_metadata
)
SELECT
  e.id,
  'tenant_explicit_mutations_wave2_v1',
  e.slug = 'fluxrow',
  CASE WHEN e.slug = 'fluxrow' THEN now() ELSE NULL END,
  jsonb_build_object('canary', e.slug = 'fluxrow', 'wave', '2-part1')
FROM public.orbit_empresas e
WHERE e.slug IN (
  'fluxrow', 'bullink-negocios', 'fabrica-de-pesquisadores', 'viver-semijoias'
)
ON CONFLICT (empresa_id, feature_key) DO NOTHING;

DO $rollout_guard$
DECLARE
  v_invalid text[];
BEGIN
  SELECT array_agg(expected.slug ORDER BY expected.slug)
  INTO v_invalid
  FROM (
    VALUES
      ('fluxrow'::text, true),
      ('bullink-negocios'::text, false),
      ('fabrica-de-pesquisadores'::text, false),
      ('viver-semijoias'::text, false)
  ) AS expected(slug, enabled)
  LEFT JOIN public.orbit_empresas e ON e.slug = expected.slug
  LEFT JOIN public.orbit_feature_flags f
    ON f.empresa_id = e.id
   AND f.feature_key = 'tenant_explicit_mutations_wave2_v1'
  WHERE e.id IS NULL OR f.enabled IS DISTINCT FROM expected.enabled;

  IF v_invalid IS NOT NULL THEN
    RAISE EXCEPTION 'TENANT_EXPLICIT_MUTATIONS_WAVE2_ROLLOUT_MISMATCH: %', v_invalid;
  END IF;
END
$rollout_guard$;

CREATE OR REPLACE FUNCTION public.orbit_tenant_mutation_authorize(
  p_tenant_slug text,
  p_required_flag text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_empresa_id uuid;
  v_is_super boolean;
  v_is_tenant_admin boolean;
  v_flag_enabled boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'UNAUTHENTICATED';
  END IF;
  IF nullif(btrim(p_tenant_slug), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'TENANT_CONTEXT_MISSING';
  END IF;

  SELECT e.id INTO v_empresa_id
  FROM public.orbit_empresas e
  WHERE e.slug = btrim(p_tenant_slug) AND coalesce(e.ativo, false) = true;

  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'TENANT_NOT_FOUND';
  END IF;

  v_is_super := public.has_role(v_uid, 'super_admin'::public.app_role)
    OR public.pe_is_super_admin(v_uid);

  SELECT
    (
      EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = v_uid AND p.empresa_id = v_empresa_id AND p.ativo = true
      )
      OR EXISTS (
        SELECT 1 FROM public.user_empresa_memberships m
        WHERE m.user_id = v_uid AND m.empresa_id = v_empresa_id
      )
    )
    AND (
      public.has_role(v_uid, 'admin'::public.app_role)
      OR EXISTS (
        SELECT 1 FROM public.user_empresa_memberships m
        WHERE m.user_id = v_uid AND m.empresa_id = v_empresa_id AND m.role = 'admin'
      )
    )
  INTO v_is_tenant_admin;

  IF NOT (coalesce(v_is_super, false) OR coalesce(v_is_tenant_admin, false)) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TENANT_ADMIN_ACCESS_DENIED';
  END IF;

  SELECT f.enabled INTO v_flag_enabled
  FROM public.orbit_feature_flags f
  WHERE f.empresa_id = v_empresa_id AND f.feature_key = p_required_flag;

  IF NOT coalesce(v_flag_enabled, false) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'TENANT_FEATURE_DISABLED';
  END IF;

  RETURN v_empresa_id;
END
$function$;

REVOKE ALL ON FUNCTION public.orbit_tenant_mutation_authorize(text, text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.orbit_tenant_entity_mutate_scoped(
  p_tenant_slug text,
  p_action_type text,
  p_entity_id uuid,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_empresa_id uuid;
  v_prospect_before public.orbit_prospects%ROWTYPE;
  v_prospect_after public.orbit_prospects%ROWTYPE;
  v_deal_before public.orbit_deals%ROWTYPE;
  v_deal_after public.orbit_deals%ROWTYPE;
  v_before_diff jsonb := '{}'::jsonb;
  v_after_diff jsonb := '{}'::jsonb;
  v_allowed text[];
  v_unknown text[];
  v_result jsonb;
BEGIN
  v_empresa_id := public.orbit_tenant_mutation_authorize(
    p_tenant_slug, 'tenant_explicit_mutations_wave2_v1'
  );
  p_payload := coalesce(p_payload, '{}'::jsonb);
  IF jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'PAYLOAD_OBJECT_REQUIRED';
  END IF;

  IF p_entity_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ENTITY_ID_REQUIRED';
  END IF;

  IF p_action_type IN ('update_prospect', 'soft_delete_prospect') THEN
    SELECT * INTO v_prospect_before
    FROM public.orbit_prospects p
    WHERE p.id = p_entity_id
      AND p.empresa_id = v_empresa_id
      AND p.deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'PROSPECT_NOT_FOUND';
    END IF;

    IF p_action_type = 'update_prospect' THEN
      v_allowed := ARRAY[
        'origem_contato','tipo','nome_razao','nome_fantasia','cnpj_cpf',
        'email_principal','telefone','cidade','estado','segmento','origem_lead',
        'observacoes','responsavel_id','status_qualificacao','score','tags',
        'consentimento_email','consentimento_whatsapp','optout_email',
        'optout_whatsapp','whatsapp','nome_contato','tipo_documento','dados_adicionais'
      ];
      SELECT array_agg(k) INTO v_unknown
      FROM jsonb_object_keys(p_payload) k
      WHERE NOT (k = ANY(v_allowed));
      IF v_unknown IS NOT NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'PROSPECT_FIELDS_NOT_ALLOWED';
      END IF;

      v_prospect_after := jsonb_populate_record(v_prospect_before, p_payload);
      IF nullif(btrim(v_prospect_after.nome_razao), '') IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'PROSPECT_NAME_REQUIRED';
      END IF;
      IF v_prospect_after.responsavel_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = v_prospect_after.responsavel_id
          AND p.empresa_id = v_empresa_id AND p.ativo = true
      ) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_PROSPECT_OWNER';
      END IF;

      UPDATE public.orbit_prospects p SET
        origem_contato = v_prospect_after.origem_contato,
        tipo = v_prospect_after.tipo,
        nome_razao = v_prospect_after.nome_razao,
        nome_fantasia = v_prospect_after.nome_fantasia,
        cnpj_cpf = v_prospect_after.cnpj_cpf,
        email_principal = v_prospect_after.email_principal,
        telefone = v_prospect_after.telefone,
        cidade = v_prospect_after.cidade,
        estado = v_prospect_after.estado,
        segmento = v_prospect_after.segmento,
        origem_lead = v_prospect_after.origem_lead,
        observacoes = v_prospect_after.observacoes,
        responsavel_id = v_prospect_after.responsavel_id,
        status_qualificacao = v_prospect_after.status_qualificacao,
        score = v_prospect_after.score,
        tags = v_prospect_after.tags,
        consentimento_email = v_prospect_after.consentimento_email,
        consentimento_whatsapp = v_prospect_after.consentimento_whatsapp,
        optout_email = v_prospect_after.optout_email,
        optout_whatsapp = v_prospect_after.optout_whatsapp,
        whatsapp = v_prospect_after.whatsapp,
        nome_contato = v_prospect_after.nome_contato,
        tipo_documento = v_prospect_after.tipo_documento,
        dados_adicionais = v_prospect_after.dados_adicionais,
        updated_at = now()
      WHERE p.id = p_entity_id AND p.empresa_id = v_empresa_id
      RETURNING to_jsonb(p) INTO v_result;
    ELSE
      UPDATE public.orbit_prospects p
      SET deleted_at = now(), updated_at = now()
      WHERE p.id = p_entity_id AND p.empresa_id = v_empresa_id
      RETURNING to_jsonb(p) INTO v_result;
    END IF;

    SELECT coalesce(jsonb_object_agg(k, to_jsonb(v_prospect_before)->k), '{}'::jsonb),
           coalesce(jsonb_object_agg(k, v_result->k), '{}'::jsonb)
    INTO v_before_diff, v_after_diff
    FROM unnest(CASE WHEN p_action_type = 'update_prospect'
      THEN v_allowed ELSE ARRAY['deleted_at']::text[] END) k
    WHERE p_action_type <> 'update_prospect' OR p_payload ? k;

  ELSIF p_action_type IN ('update_deal', 'move_deal', 'soft_delete_deal') THEN
    SELECT * INTO v_deal_before
    FROM public.orbit_deals d
    WHERE d.id = p_entity_id
      AND d.empresa_id = v_empresa_id
      AND d.deleted_at IS NULL
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'DEAL_NOT_FOUND';
    END IF;

    IF p_action_type = 'soft_delete_deal' THEN
      UPDATE public.orbit_deals d
      SET deleted_at = now(), updated_at = now()
      WHERE d.id = p_entity_id AND d.empresa_id = v_empresa_id
      RETURNING to_jsonb(d) INTO v_result;
      v_allowed := ARRAY['deleted_at'];
    ELSE
      v_allowed := CASE WHEN p_action_type = 'move_deal'
        THEN ARRAY['etapa_id','motivo_perda']
        ELSE ARRAY[
          'prospect_id','titulo','valor_estimado','etapa_id','probabilidade',
          'data_prevista_fechamento','motivo_perda','responsavel_id','status',
          'ultima_interacao_at','documentos_checklist','data_conversao'
        ] END;
      SELECT array_agg(k) INTO v_unknown
      FROM jsonb_object_keys(p_payload) k
      WHERE NOT (k = ANY(v_allowed));
      IF v_unknown IS NOT NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'DEAL_FIELDS_NOT_ALLOWED';
      END IF;

      v_deal_after := jsonb_populate_record(v_deal_before, p_payload);
      IF nullif(btrim(v_deal_after.titulo), '') IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'DEAL_TITLE_REQUIRED';
      END IF;
      IF v_deal_after.probabilidade IS NOT NULL
         AND (v_deal_after.probabilidade < 0 OR v_deal_after.probabilidade > 100) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_DEAL_PROBABILITY';
      END IF;
      IF v_deal_after.etapa_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.orbit_pipeline_stages s
        WHERE s.id = v_deal_after.etapa_id
          AND s.empresa_id = v_empresa_id AND s.is_archived = false
      ) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_DEAL_STAGE';
      END IF;
      IF v_deal_after.prospect_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.orbit_prospects p
        WHERE p.id = v_deal_after.prospect_id
          AND p.empresa_id = v_empresa_id AND p.deleted_at IS NULL
      ) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_DEAL_PROSPECT';
      END IF;
      IF v_deal_after.responsavel_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE p.id = v_deal_after.responsavel_id
          AND p.empresa_id = v_empresa_id AND p.ativo = true
      ) THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_DEAL_OWNER';
      END IF;

      UPDATE public.orbit_deals d SET
        prospect_id = v_deal_after.prospect_id,
        titulo = v_deal_after.titulo,
        valor_estimado = v_deal_after.valor_estimado,
        etapa_id = v_deal_after.etapa_id,
        probabilidade = v_deal_after.probabilidade,
        data_prevista_fechamento = v_deal_after.data_prevista_fechamento,
        motivo_perda = v_deal_after.motivo_perda,
        responsavel_id = v_deal_after.responsavel_id,
        status = v_deal_after.status,
        ultima_interacao_at = v_deal_after.ultima_interacao_at,
        documentos_checklist = v_deal_after.documentos_checklist,
        data_conversao = v_deal_after.data_conversao,
        moved_at = CASE WHEN p_action_type = 'move_deal' THEN now() ELSE d.moved_at END,
        updated_at = now()
      WHERE d.id = p_entity_id AND d.empresa_id = v_empresa_id
      RETURNING to_jsonb(d) INTO v_result;
    END IF;

    SELECT coalesce(jsonb_object_agg(k, to_jsonb(v_deal_before)->k), '{}'::jsonb),
           coalesce(jsonb_object_agg(k, v_result->k), '{}'::jsonb)
    INTO v_before_diff, v_after_diff
    FROM unnest(v_allowed) k
    WHERE p_action_type = 'soft_delete_deal' OR p_payload ? k;
  ELSE
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_TENANT_MUTATION_ACTION';
  END IF;

  INSERT INTO public.orbit_audit_log (
    empresa_id, user_id, acao, entidade, entidade_id, detalhes
  ) VALUES (
    v_empresa_id,
    v_uid,
    p_action_type,
    CASE WHEN p_action_type LIKE '%prospect' THEN 'orbit_prospects' ELSE 'orbit_deals' END,
    p_entity_id,
    jsonb_build_object(
      'tenant_slug', btrim(p_tenant_slug),
      'changed_fields', CASE WHEN p_action_type LIKE 'soft_delete_%'
        THEN jsonb_build_array('deleted_at') ELSE to_jsonb(v_allowed) END,
      'diff', jsonb_build_object('before', v_before_diff, 'after', v_after_diff)
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'action', p_action_type,
    'entity_id', p_entity_id,
    'data', jsonb_build_object('entity', v_result)
  );
END
$function$;

REVOKE ALL ON FUNCTION public.orbit_tenant_entity_mutate_scoped(text, text, uuid, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orbit_tenant_entity_mutate_scoped(text, text, uuid, jsonb)
  TO authenticated;

COMMIT;
