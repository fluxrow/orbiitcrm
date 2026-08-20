-- Wave 2 / Part 2: safe tenant-scoped pipeline stage administration.

BEGIN;

INSERT INTO public.orbit_feature_flags (
  empresa_id, feature_key, enabled, enabled_at, rollout_metadata
)
SELECT
  e.id,
  'tenant_pipeline_stages_wave2_v1',
  e.slug = 'fluxrow',
  CASE WHEN e.slug = 'fluxrow' THEN now() ELSE NULL END,
  jsonb_build_object('canary', e.slug = 'fluxrow', 'wave', '2-part2')
FROM public.orbit_empresas e
WHERE e.slug IN (
  'fluxrow', 'bullink-negocios', 'fabrica-de-pesquisadores', 'viver-semijoias'
)
ON CONFLICT (empresa_id, feature_key) DO NOTHING;

DO $rollout_guard$
DECLARE v_invalid text[];
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
    ON f.empresa_id=e.id AND f.feature_key='tenant_pipeline_stages_wave2_v1'
  WHERE e.id IS NULL OR f.enabled IS DISTINCT FROM expected.enabled;

  IF v_invalid IS NOT NULL THEN
    RAISE EXCEPTION 'TENANT_PIPELINE_STAGES_WAVE2_ROLLOUT_MISMATCH: %', v_invalid;
  END IF;
END
$rollout_guard$;

CREATE OR REPLACE FUNCTION public.orbit_tenant_pipeline_stage_impact_scoped(
  p_tenant_slug text,
  p_stage_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_empresa_id uuid;
  v_deals bigint;
  v_flow_actions bigint;
  v_flow_configs bigint;
  v_active_versions bigint;
  v_scheduled_actions bigint;
BEGIN
  v_empresa_id := public.orbit_tenant_mutation_authorize(
    p_tenant_slug, 'tenant_pipeline_stages_wave2_v1'
  );

  IF NOT EXISTS (
    SELECT 1 FROM public.orbit_pipeline_stages s
    WHERE s.id=p_stage_id AND s.empresa_id=v_empresa_id AND s.is_archived=false
  ) THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='PIPELINE_STAGE_NOT_FOUND';
  END IF;

  SELECT count(*) INTO v_deals
  FROM public.orbit_deals d
  WHERE d.empresa_id=v_empresa_id AND d.etapa_id=p_stage_id AND d.deleted_at IS NULL;

  SELECT count(*) INTO v_flow_actions
  FROM public.orbit_flow_actions a
  JOIN public.orbit_flows f ON f.id=a.flow_id
  WHERE f.empresa_id=v_empresa_id AND f.ativo=true AND f.deleted_at IS NULL
    AND a.action_config::text LIKE '%'||p_stage_id::text||'%';

  SELECT count(*) INTO v_flow_configs
  FROM public.orbit_flows f
  WHERE f.empresa_id=v_empresa_id AND f.ativo=true AND f.deleted_at IS NULL
    AND (f.trigger_config::text LIKE '%'||p_stage_id::text||'%'
      OR f.condicoes::text LIKE '%'||p_stage_id::text||'%');

  SELECT count(*) INTO v_active_versions
  FROM public.orbit_flow_versions v
  WHERE v.empresa_id=v_empresa_id AND v.is_active=true
    AND (v.nodes_schema::text LIKE '%'||p_stage_id::text||'%'
      OR v.edges_schema::text LIKE '%'||p_stage_id::text||'%');

  SELECT count(*) INTO v_scheduled_actions
  FROM public.orbit_flow_scheduled_actions a
  WHERE a.empresa_id=v_empresa_id AND a.status IN ('pending','processing')
    AND (a.action_config::text LIKE '%'||p_stage_id::text||'%'
      OR a.context::text LIKE '%'||p_stage_id::text||'%');

  RETURN jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'stage_id', p_stage_id,
      'active_deals', v_deals,
      'active_flow_actions', v_flow_actions,
      'active_flow_configs', v_flow_configs,
      'active_flow_versions', v_active_versions,
      'active_scheduled_actions', v_scheduled_actions,
      'can_archive', (v_deals+v_flow_actions+v_flow_configs+v_active_versions+v_scheduled_actions)=0
    )
  );
END
$function$;

CREATE OR REPLACE FUNCTION public.orbit_tenant_pipeline_stage_mutate_scoped(
  p_tenant_slug text,
  p_action_type text,
  p_stage_id uuid DEFAULT NULL,
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
  v_before public.orbit_pipeline_stages%ROWTYPE;
  v_after public.orbit_pipeline_stages%ROWTYPE;
  v_result jsonb;
  v_impact jsonb;
  v_allowed text[] := ARRAY[
    'nome','descricao','cor','probabilidade_default','sla_dias','requer_motivo',
    'is_won','is_lost','ordem','automacoes_config','ai_config'
  ];
  v_unknown text[];
  v_ordered_ids uuid[];
  v_active_ids uuid[];
BEGIN
  v_empresa_id := public.orbit_tenant_mutation_authorize(
    p_tenant_slug, 'tenant_pipeline_stages_wave2_v1'
  );
  p_payload := coalesce(p_payload, '{}'::jsonb);
  IF jsonb_typeof(p_payload) <> 'object' THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PAYLOAD_OBJECT_REQUIRED';
  END IF;

  IF p_action_type IN ('create_stage','update_stage') THEN
    SELECT array_agg(k) INTO v_unknown
    FROM jsonb_object_keys(p_payload) k WHERE NOT (k=ANY(v_allowed));
    IF v_unknown IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PIPELINE_STAGE_FIELDS_NOT_ALLOWED';
    END IF;

    IF p_action_type='update_stage' THEN
      IF p_stage_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='STAGE_ID_REQUIRED';
      END IF;
      SELECT * INTO v_before FROM public.orbit_pipeline_stages s
      WHERE s.id=p_stage_id AND s.empresa_id=v_empresa_id AND s.is_archived=false
      FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='PIPELINE_STAGE_NOT_FOUND';
      END IF;
      v_after := jsonb_populate_record(v_before,p_payload);
    ELSE
      IF p_stage_id IS NOT NULL THEN
        RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='NEW_STAGE_ID_NOT_ALLOWED';
      END IF;
      v_after := jsonb_populate_record(NULL::public.orbit_pipeline_stages,p_payload);
      v_after.id := gen_random_uuid();
      v_after.empresa_id := v_empresa_id;
      v_after.is_archived := false;
      v_after.created_at := now();
      v_after.updated_at := now();
      v_after.ordem := coalesce(v_after.ordem,(
        SELECT coalesce(max(s.ordem),0)+1 FROM public.orbit_pipeline_stages s
        WHERE s.empresa_id=v_empresa_id AND s.is_archived=false
      ));
      v_after.cor := coalesce(v_after.cor,'#3b82f6');
      v_after.requer_motivo := coalesce(v_after.requer_motivo,false);
      v_after.automacoes_config := coalesce(v_after.automacoes_config,'{}'::jsonb);
      v_after.is_won := coalesce(v_after.is_won,false);
      v_after.is_lost := coalesce(v_after.is_lost,false);
    END IF;

    IF nullif(btrim(v_after.nome),'') IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='PIPELINE_STAGE_NAME_REQUIRED';
    END IF;
    IF v_after.ordem IS NULL OR v_after.ordem<1 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_PIPELINE_STAGE_ORDER';
    END IF;
    IF v_after.probabilidade_default IS NOT NULL
       AND (v_after.probabilidade_default<0 OR v_after.probabilidade_default>100) THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_STAGE_PROBABILITY';
    END IF;
    IF v_after.sla_dias IS NOT NULL AND v_after.sla_dias<0 THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_STAGE_SLA';
    END IF;
    IF coalesce(v_after.is_won,false) AND coalesce(v_after.is_lost,false) THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='STAGE_CANNOT_BE_WON_AND_LOST';
    END IF;
    IF coalesce(v_after.is_won,false) AND EXISTS (
      SELECT 1 FROM public.orbit_pipeline_stages s
      WHERE s.empresa_id=v_empresa_id AND s.is_archived=false AND s.is_won=true
        AND s.id<>v_after.id
    ) THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='ACTIVE_WON_STAGE_ALREADY_EXISTS';
    END IF;
    IF coalesce(v_after.is_lost,false) AND EXISTS (
      SELECT 1 FROM public.orbit_pipeline_stages s
      WHERE s.empresa_id=v_empresa_id AND s.is_archived=false AND s.is_lost=true
        AND s.id<>v_after.id
    ) THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='ACTIVE_LOST_STAGE_ALREADY_EXISTS';
    END IF;

    IF p_action_type='create_stage' THEN
      INSERT INTO public.orbit_pipeline_stages (
        id,empresa_id,nome,descricao,ordem,cor,is_won,is_lost,
        probabilidade_default,sla_dias,requer_motivo,automacoes_config,ai_config,
        is_archived,created_at,updated_at
      ) VALUES (
        v_after.id,v_empresa_id,v_after.nome,v_after.descricao,v_after.ordem,v_after.cor,
        v_after.is_won,v_after.is_lost,v_after.probabilidade_default,v_after.sla_dias,
        v_after.requer_motivo,v_after.automacoes_config,v_after.ai_config,false,now(),now()
      ) RETURNING to_jsonb(orbit_pipeline_stages) INTO v_result;
    ELSE
      UPDATE public.orbit_pipeline_stages s SET
        nome=v_after.nome, descricao=v_after.descricao, cor=v_after.cor,
        probabilidade_default=v_after.probabilidade_default, sla_dias=v_after.sla_dias,
        requer_motivo=v_after.requer_motivo, is_won=v_after.is_won,
        is_lost=v_after.is_lost, ordem=v_after.ordem,
        automacoes_config=v_after.automacoes_config, ai_config=v_after.ai_config,
        updated_at=now()
      WHERE s.id=p_stage_id AND s.empresa_id=v_empresa_id
      RETURNING to_jsonb(s) INTO v_result;
    END IF;

  ELSIF p_action_type='archive_stage' THEN
    IF p_stage_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='STAGE_ID_REQUIRED';
    END IF;
    SELECT * INTO v_before FROM public.orbit_pipeline_stages s
    WHERE s.id=p_stage_id AND s.empresa_id=v_empresa_id AND s.is_archived=false
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='PIPELINE_STAGE_NOT_FOUND';
    END IF;
    IF (SELECT count(*) FROM public.orbit_pipeline_stages s
        WHERE s.empresa_id=v_empresa_id AND s.is_archived=false)<=1 THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='CANNOT_ARCHIVE_LAST_PIPELINE_STAGE';
    END IF;
    v_impact := public.orbit_tenant_pipeline_stage_impact_scoped(p_tenant_slug,p_stage_id);
    IF NOT coalesce((v_impact->'data'->>'can_archive')::boolean,false) THEN
      RAISE EXCEPTION USING ERRCODE='23514', MESSAGE='PIPELINE_STAGE_HAS_ACTIVE_DEPENDENCIES';
    END IF;
    UPDATE public.orbit_pipeline_stages s SET is_archived=true,updated_at=now()
    WHERE s.id=p_stage_id AND s.empresa_id=v_empresa_id
    RETURNING to_jsonb(s) INTO v_result;

  ELSIF p_action_type='reorder_stages' THEN
    SELECT array_agg(value::uuid ORDER BY ordinality) INTO v_ordered_ids
    FROM jsonb_array_elements_text(p_payload->'ordered_ids') WITH ORDINALITY;
    PERFORM 1 FROM public.orbit_pipeline_stages s
    WHERE s.empresa_id=v_empresa_id AND s.is_archived=false
    FOR UPDATE;
    SELECT array_agg(s.id ORDER BY s.id) INTO v_active_ids
    FROM public.orbit_pipeline_stages s
    WHERE s.empresa_id=v_empresa_id AND s.is_archived=false;
    IF v_ordered_ids IS NULL
      OR cardinality(v_ordered_ids)<>cardinality(v_active_ids)
      OR cardinality(v_ordered_ids)<>(SELECT count(DISTINCT x) FROM unnest(v_ordered_ids) x)
      OR (SELECT array_agg(x ORDER BY x) FROM unnest(v_ordered_ids) x)<>v_active_ids THEN
      RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_COMPLETE_STAGE_ORDER';
    END IF;
    UPDATE public.orbit_pipeline_stages s
    SET ordem=u.ord,updated_at=now()
    FROM unnest(v_ordered_ids) WITH ORDINALITY u(id,ord)
    WHERE s.id=u.id AND s.empresa_id=v_empresa_id;
    SELECT jsonb_agg(to_jsonb(s) ORDER BY s.ordem) INTO v_result
    FROM public.orbit_pipeline_stages s
    WHERE s.empresa_id=v_empresa_id AND s.is_archived=false;
  ELSE
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='INVALID_PIPELINE_STAGE_ACTION';
  END IF;

  INSERT INTO public.orbit_audit_log(
    empresa_id,user_id,acao,entidade,entidade_id,detalhes
  ) VALUES (
    v_empresa_id,v_uid,p_action_type,'orbit_pipeline_stages',p_stage_id,
    jsonb_build_object(
      'tenant_slug',btrim(p_tenant_slug),
      'before',CASE WHEN p_action_type IN ('update_stage','archive_stage')
        THEN to_jsonb(v_before)-'empresa_id' ELSE NULL END,
      'after',v_result
    )
  );

  RETURN jsonb_build_object('ok',true,'action',p_action_type,'data',v_result);
END
$function$;

REVOKE ALL ON FUNCTION public.orbit_tenant_pipeline_stage_impact_scoped(text,uuid)
  FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.orbit_tenant_pipeline_stage_mutate_scoped(text,text,uuid,jsonb)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.orbit_tenant_pipeline_stage_impact_scoped(text,uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.orbit_tenant_pipeline_stage_mutate_scoped(text,text,uuid,jsonb)
  TO authenticated;

COMMIT;
