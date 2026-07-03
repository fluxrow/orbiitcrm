
ALTER TABLE public.orbit_ai_config
  ADD COLUMN IF NOT EXISTS advisor_thresholds jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.get_advisor_snapshot_admin(p_empresa_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_empresa jsonb;
  v_ai_config jsonb;
  v_pipeline jsonb;
  v_flows jsonb;
  v_kpis jsonb;
  v_since_24h timestamptz := now() - interval '24 hours';
  v_since_7d timestamptz := now() - interval '7 days';
  v_since_30d timestamptz := now() - interval '30 days';
BEGIN
  SELECT jsonb_build_object(
    'id', id, 'nome', nome, 'plano', plano, 'slug', slug,
    'seats_max', max_usuarios
  ) INTO v_empresa
  FROM public.orbit_empresas WHERE id = p_empresa_id;

  IF v_empresa IS NULL THEN
    RETURN jsonb_build_object('error','empresa_not_found');
  END IF;

  SELECT jsonb_build_object(
    'tom', tom_conversa, 'idioma', idioma, 'modelo', modelo_ia,
    'modo_automatico', modo_automatico,
    'identidade_resumo', LEFT(COALESCE(prompt_identidade,''), 400),
    'regras_resumo', LEFT(COALESCE(prompt_regras,''), 400),
    'advisor_locked_paths', COALESCE(advisor_locked_paths, '[]'::jsonb),
    'advisor_thresholds', COALESCE(advisor_thresholds, '{}'::jsonb)
  ) INTO v_ai_config
  FROM public.orbit_ai_config WHERE empresa_id = p_empresa_id
  ORDER BY updated_at DESC LIMIT 1;

  SELECT COALESCE(jsonb_agg(to_jsonb(s) ORDER BY s.ordem), '[]'::jsonb)
  INTO v_pipeline
  FROM (
    SELECT st.id, st.nome, st.ordem, st.is_won, st.is_lost, st.sla_dias,
      (SELECT count(*) FROM public.orbit_deals d
        WHERE d.empresa_id = p_empresa_id AND d.etapa_id = st.id) AS leads_ativos,
      (SELECT count(*) FROM public.orbit_deals d
        WHERE d.empresa_id = p_empresa_id AND d.etapa_id = st.id
          AND d.updated_at >= v_since_7d) AS mov_7d,
      (SELECT count(*) FROM public.orbit_deals d
        WHERE d.empresa_id = p_empresa_id AND d.etapa_id = st.id
          AND d.updated_at >= v_since_30d) AS mov_30d
    FROM public.orbit_pipeline_stages st
    WHERE st.empresa_id = p_empresa_id AND st.is_archived = false
  ) s;

  SELECT COALESCE(jsonb_agg(to_jsonb(f) ORDER BY f.erros_24h DESC NULLS LAST), '[]'::jsonb)
  INTO v_flows
  FROM (
    SELECT fl.id, fl.nome, fl.ativo,
      (SELECT count(*) FROM public.orbit_flow_runs r
         WHERE r.flow_id = fl.id AND r.created_at >= v_since_24h) AS runs_24h,
      (SELECT count(*) FROM public.orbit_flow_runs r
         WHERE r.flow_id = fl.id AND r.created_at >= v_since_24h AND r.error IS NOT NULL) AS erros_24h,
      (SELECT extract(epoch FROM percentile_cont(0.95) WITHIN GROUP (ORDER BY (r.finished_at - r.started_at)))
         FROM public.orbit_flow_runs r
         WHERE r.flow_id = fl.id AND r.created_at >= v_since_24h AND r.finished_at IS NOT NULL) AS latencia_p95_s,
      (SELECT r.error FROM public.orbit_flow_runs r
         WHERE r.flow_id = fl.id AND r.error IS NOT NULL
         ORDER BY r.created_at DESC LIMIT 1) AS ultimo_erro
    FROM public.orbit_flows fl
    WHERE fl.empresa_id = p_empresa_id AND fl.deleted_at IS NULL
  ) f;

  SELECT jsonb_build_object(
    'prospects_24h', (SELECT count(*) FROM public.orbit_prospects
                       WHERE empresa_id = p_empresa_id AND created_at >= v_since_24h),
    'prospects_7d', (SELECT count(*) FROM public.orbit_prospects
                      WHERE empresa_id = p_empresa_id AND created_at >= v_since_7d),
    'tasks_atrasadas', (SELECT count(*) FROM public.orbit_tasks
                         WHERE empresa_id = p_empresa_id
                           AND status <> 'concluida'
                           AND (data_prazo IS NOT NULL AND data_prazo < now())),
    'conversas_abertas', (SELECT count(*) FROM public.orbit_conversas
                           WHERE empresa_id = p_empresa_id AND status = 'aberta'),
    'handoffs_pendentes', (SELECT count(*) FROM public.orbit_handoffs
                            WHERE empresa_id = p_empresa_id AND status = 'pendente')
  ) INTO v_kpis;

  v_result := jsonb_build_object(
    'gerado_em', now(),
    'empresa', v_empresa,
    'ai_config', v_ai_config,
    'pipeline', COALESCE(v_pipeline, '[]'::jsonb),
    'flows', COALESCE(v_flows, '[]'::jsonb),
    'kpis', v_kpis
  );
  RETURN v_result;
EXCEPTION WHEN undefined_column OR undefined_table THEN
  RETURN jsonb_build_object(
    'gerado_em', now(), 'empresa', v_empresa, 'ai_config', v_ai_config,
    'pipeline', COALESCE(v_pipeline,'[]'::jsonb),
    'flows', COALESCE(v_flows,'[]'::jsonb),
    'kpis', COALESCE(v_kpis,'{}'::jsonb),
    'warning','partial_snapshot'
  );
END;
$function$;

-- Fase C: RPCs de aplicação segura (whitelist)
CREATE OR REPLACE FUNCTION public.apply_flow_pause(p_empresa uuid, p_flow uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_before jsonb;
  v_after jsonb;
BEGIN
  SELECT jsonb_build_object('ativo', ativo) INTO v_before
  FROM public.orbit_flows WHERE id = p_flow AND empresa_id = p_empresa;
  IF v_before IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'flow_not_found');
  END IF;

  UPDATE public.orbit_flows SET ativo = false, updated_at = now()
    WHERE id = p_flow AND empresa_id = p_empresa;

  SELECT jsonb_build_object('ativo', ativo) INTO v_after
  FROM public.orbit_flows WHERE id = p_flow AND empresa_id = p_empresa;

  RETURN jsonb_build_object(
    'ok', true,
    'target_table', 'orbit_flows',
    'target_id', p_flow,
    'before', v_before,
    'after', v_after
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_stage_followup(p_empresa uuid, p_stage uuid, p_template jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_before jsonb;
  v_after jsonb;
  v_stage record;
  v_titulo text;
  v_dias int;
BEGIN
  SELECT * INTO v_stage FROM public.orbit_pipeline_stages
    WHERE id = p_stage AND empresa_id = p_empresa;
  IF v_stage IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'stage_not_found');
  END IF;

  v_titulo := COALESCE(p_template->>'titulo', 'Follow-up automático — ' || v_stage.nome);
  v_dias := COALESCE((p_template->>'dias_prazo')::int, 3);

  v_before := jsonb_build_object('stage_id', p_stage, 'existing_followups', (
    SELECT count(*) FROM public.orbit_tasks
     WHERE empresa_id = p_empresa AND titulo = v_titulo
  ));

  INSERT INTO public.orbit_tasks (empresa_id, titulo, descricao, status, data_prazo, origem)
  VALUES (p_empresa, v_titulo,
    COALESCE(p_template->>'descricao', 'Follow-up sugerido pelo Advisor para etapa ' || v_stage.nome),
    'pendente', now() + make_interval(days => v_dias), 'advisor')
  RETURNING jsonb_build_object('id', id, 'titulo', titulo, 'data_prazo', data_prazo) INTO v_after;

  RETURN jsonb_build_object(
    'ok', true,
    'target_table', 'orbit_tasks',
    'target_id', p_stage,
    'before', v_before,
    'after', v_after
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_flow_variation_draft(p_empresa uuid, p_flow uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_flow record;
  v_new_id uuid;
  v_before jsonb;
  v_after jsonb;
BEGIN
  SELECT * INTO v_flow FROM public.orbit_flows
    WHERE id = p_flow AND empresa_id = p_empresa;
  IF v_flow IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'flow_not_found');
  END IF;

  v_before := jsonb_build_object('source_flow_id', v_flow.id, 'source_nome', v_flow.nome);

  INSERT INTO public.orbit_flow_templates (empresa_id, nome, descricao, definicao, status, criado_por_advisor, source_flow_id)
  VALUES (p_empresa,
    v_flow.nome || ' (Draft Advisor)',
    'Variação sugerida pelo Advisor. Revise antes de publicar. Fluxo original permanece intocado.',
    to_jsonb(v_flow),
    'draft', true, v_flow.id)
  RETURNING id INTO v_new_id;

  v_after := jsonb_build_object('draft_template_id', v_new_id, 'status', 'draft');

  RETURN jsonb_build_object(
    'ok', true,
    'target_table', 'orbit_flow_templates',
    'target_id', v_new_id,
    'before', v_before,
    'after', v_after
  );
END;
$$;

-- Adicionar colunas ao orbit_flow_templates para suporte a rascunhos do Advisor
ALTER TABLE public.orbit_flow_templates
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS criado_por_advisor boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source_flow_id uuid REFERENCES public.orbit_flows(id) ON DELETE SET NULL;

REVOKE EXECUTE ON FUNCTION public.apply_flow_pause(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.apply_stage_followup(uuid, uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.apply_flow_variation_draft(uuid, uuid) FROM anon;

GRANT EXECUTE ON FUNCTION public.apply_flow_pause(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_stage_followup(uuid, uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_flow_variation_draft(uuid, uuid) TO authenticated, service_role;
