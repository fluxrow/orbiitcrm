
CREATE OR REPLACE FUNCTION public.get_advisor_snapshot_admin(p_empresa_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
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
    'advisor_locked_paths', COALESCE(advisor_locked_paths, '[]'::jsonb)
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
$$;
