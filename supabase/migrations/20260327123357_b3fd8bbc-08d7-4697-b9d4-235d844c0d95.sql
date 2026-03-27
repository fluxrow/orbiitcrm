
DROP FUNCTION IF EXISTS get_campaign_events_timeline(uuid, text);

CREATE FUNCTION get_campaign_events_timeline(p_campaign_id uuid, p_interval text DEFAULT '1 day')
RETURNS TABLE(bucket timestamptz, enviados bigint, entregues bigint, aberturas bigint, cliques bigint, leituras bigint, respostas bigint)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  trunc_field text;
BEGIN
  trunc_field := CASE p_interval WHEN '1 hour' THEN 'hour' ELSE 'day' END;

  RETURN QUERY
  WITH all_ts AS (
    SELECT enviado_em AS ts, 'enviado' AS tipo FROM orbit_campaign_recipients WHERE campaign_id = p_campaign_id AND enviado_em IS NOT NULL
    UNION ALL
    SELECT delivered_at, 'entregue' FROM orbit_campaign_recipients WHERE campaign_id = p_campaign_id AND delivered_at IS NOT NULL
    UNION ALL
    SELECT opened_at, 'abertura' FROM orbit_campaign_recipients WHERE campaign_id = p_campaign_id AND opened_at IS NOT NULL
    UNION ALL
    SELECT clicked_at, 'clique' FROM orbit_campaign_recipients WHERE campaign_id = p_campaign_id AND clicked_at IS NOT NULL
    UNION ALL
    SELECT read_at, 'leitura' FROM orbit_campaign_recipients WHERE campaign_id = p_campaign_id AND read_at IS NOT NULL
    UNION ALL
    SELECT replied_at, 'resposta' FROM orbit_campaign_recipients WHERE campaign_id = p_campaign_id AND replied_at IS NOT NULL
  ),
  bucketed AS (
    SELECT date_trunc(trunc_field, ts) AS b, tipo FROM all_ts
  )
  SELECT
    b.b AS bucket,
    count(*) FILTER (WHERE b.tipo = 'enviado') AS enviados,
    count(*) FILTER (WHERE b.tipo = 'entregue') AS entregues,
    count(*) FILTER (WHERE b.tipo = 'abertura') AS aberturas,
    count(*) FILTER (WHERE b.tipo = 'clique') AS cliques,
    count(*) FILTER (WHERE b.tipo = 'leitura') AS leituras,
    count(*) FILTER (WHERE b.tipo = 'resposta') AS respostas
  FROM bucketed b
  GROUP BY b.b
  ORDER BY b.b;
END;
$$;
