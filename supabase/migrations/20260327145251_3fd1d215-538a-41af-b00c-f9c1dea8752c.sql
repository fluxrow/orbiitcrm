
CREATE OR REPLACE FUNCTION public.get_orbit_analytics_summary(p_empresa_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
  v_total_prospects bigint;
  v_prospects_mes_atual bigint;
  v_prospects_mes_anterior bigint;
  v_conversas_ativas bigint;
  v_conversas_ontem bigint;
  v_pipeline_total numeric;
  v_pipeline_mes_anterior numeric;
  v_deals_total bigint;
  v_deals_won bigint;
  v_deals_won_anterior bigint;
  v_deals_total_anterior bigint;
  v_origem jsonb;
  v_prospects_por_mes jsonb;
  v_deals_por_mes jsonb;
  v_performance jsonb;
BEGIN
  -- Total prospects
  SELECT count(*) INTO v_total_prospects FROM orbit_prospects WHERE empresa_id = p_empresa_id;

  -- Prospects mês atual vs anterior
  SELECT count(*) INTO v_prospects_mes_atual FROM orbit_prospects
  WHERE empresa_id = p_empresa_id AND created_at >= date_trunc('month', now());

  SELECT count(*) INTO v_prospects_mes_anterior FROM orbit_prospects
  WHERE empresa_id = p_empresa_id
    AND created_at >= date_trunc('month', now() - interval '1 month')
    AND created_at < date_trunc('month', now());

  -- Conversas ativas
  SELECT count(*) INTO v_conversas_ativas FROM orbit_conversas
  WHERE empresa_id = p_empresa_id AND status = 'aberta';

  -- Conversas abertas desde ontem
  SELECT count(*) INTO v_conversas_ontem FROM orbit_conversas
  WHERE empresa_id = p_empresa_id AND status = 'aberta'
    AND created_at >= now() - interval '1 day';

  -- Pipeline total (deals abertos)
  SELECT COALESCE(sum(valor_estimado), 0) INTO v_pipeline_total FROM orbit_deals
  WHERE empresa_id = p_empresa_id AND status = 'open';

  -- Pipeline mês anterior
  SELECT COALESCE(sum(valor_estimado), 0) INTO v_pipeline_mes_anterior FROM orbit_deals
  WHERE empresa_id = p_empresa_id AND status = 'open'
    AND created_at < date_trunc('month', now());

  -- Deals total e won (all time)
  SELECT count(*) INTO v_deals_total FROM orbit_deals WHERE empresa_id = p_empresa_id;
  SELECT count(*) INTO v_deals_won FROM orbit_deals WHERE empresa_id = p_empresa_id AND status = 'won';

  -- Deals mês anterior para variação de taxa
  SELECT count(*) INTO v_deals_total_anterior FROM orbit_deals
  WHERE empresa_id = p_empresa_id
    AND created_at >= date_trunc('month', now() - interval '1 month')
    AND created_at < date_trunc('month', now());
  SELECT count(*) INTO v_deals_won_anterior FROM orbit_deals
  WHERE empresa_id = p_empresa_id AND status = 'won'
    AND created_at >= date_trunc('month', now() - interval '1 month')
    AND created_at < date_trunc('month', now());

  -- Origem contato distribution
  SELECT COALESCE(jsonb_agg(jsonb_build_object('name', COALESCE(origem_contato, 'Não informado'), 'value', cnt)), '[]'::jsonb)
  INTO v_origem
  FROM (
    SELECT origem_contato, count(*) as cnt FROM orbit_prospects
    WHERE empresa_id = p_empresa_id
    GROUP BY origem_contato ORDER BY cnt DESC
  ) sub;

  -- Prospects por mês (últimos 6 meses)
  SELECT COALESCE(jsonb_agg(jsonb_build_object('month', m, 'leads', cnt) ORDER BY m), '[]'::jsonb)
  INTO v_prospects_por_mes
  FROM (
    SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') as m, count(*) as cnt
    FROM orbit_prospects WHERE empresa_id = p_empresa_id
      AND created_at >= date_trunc('month', now() - interval '5 months')
    GROUP BY m
  ) sub;

  -- Deals por mês (últimos 6 meses)
  SELECT COALESCE(jsonb_agg(jsonb_build_object('month', m, 'total', total, 'won', won) ORDER BY m), '[]'::jsonb)
  INTO v_deals_por_mes
  FROM (
    SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') as m,
      count(*) as total,
      count(*) FILTER (WHERE status = 'won') as won
    FROM orbit_deals WHERE empresa_id = p_empresa_id
      AND created_at >= date_trunc('month', now() - interval '5 months')
    GROUP BY m
  ) sub;

  -- Performance equipe (top 10 por prospects)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'name', COALESCE(p.nome, p.email, 'Sem nome'),
    'leads', sub.leads,
    'conversao', sub.won
  ) ORDER BY sub.leads DESC), '[]'::jsonb)
  INTO v_performance
  FROM (
    SELECT responsavel_id, count(*) as leads,
      (SELECT count(*) FROM orbit_deals d WHERE d.responsavel_id = op.responsavel_id AND d.empresa_id = p_empresa_id AND d.status = 'won') as won
    FROM orbit_prospects op
    WHERE op.empresa_id = p_empresa_id AND op.responsavel_id IS NOT NULL
    GROUP BY op.responsavel_id
    LIMIT 10
  ) sub
  JOIN profiles p ON p.id = sub.responsavel_id;

  v_result := jsonb_build_object(
    'total_prospects', v_total_prospects,
    'prospects_mes_atual', v_prospects_mes_atual,
    'prospects_mes_anterior', v_prospects_mes_anterior,
    'conversas_ativas', v_conversas_ativas,
    'conversas_ontem', v_conversas_ontem,
    'pipeline_total', v_pipeline_total,
    'pipeline_mes_anterior', v_pipeline_mes_anterior,
    'deals_total', v_deals_total,
    'deals_won', v_deals_won,
    'deals_total_anterior', v_deals_total_anterior,
    'deals_won_anterior', v_deals_won_anterior,
    'origem_distribution', v_origem,
    'prospects_por_mes', v_prospects_por_mes,
    'deals_por_mes', v_deals_por_mes,
    'performance_equipe', v_performance
  );

  RETURN v_result;
END;
$$;
