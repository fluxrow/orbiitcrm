CREATE OR REPLACE FUNCTION get_campaign_events_timeline(
  p_campaign_id uuid,
  p_interval text DEFAULT '1 day'
)
RETURNS TABLE(bucket timestamptz, enviados bigint, entregues bigint, aberturas bigint, cliques bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH buckets AS (
    SELECT DISTINCT date_trunc(
      CASE p_interval
        WHEN '1 hour' THEN 'hour'
        WHEN '1 day'  THEN 'day'
        WHEN '7 days' THEN 'day'
        WHEN '30 days' THEN 'day'
        ELSE 'day'
      END,
      ts
    ) AS b
    FROM orbit_campaign_recipients r,
    LATERAL (
      VALUES (r.enviado_em), (r.delivered_at), (r.opened_at), (r.clicked_at)
    ) v(ts)
    WHERE r.campaign_id = p_campaign_id AND ts IS NOT NULL
  )
  SELECT
    b.b AS bucket,
    (SELECT count(*) FROM orbit_campaign_recipients WHERE campaign_id = p_campaign_id AND date_trunc(
      CASE p_interval WHEN '1 hour' THEN 'hour' ELSE 'day' END, enviado_em
    ) = b.b) AS enviados,
    (SELECT count(*) FROM orbit_campaign_recipients WHERE campaign_id = p_campaign_id AND date_trunc(
      CASE p_interval WHEN '1 hour' THEN 'hour' ELSE 'day' END, delivered_at
    ) = b.b) AS entregues,
    (SELECT count(*) FROM orbit_campaign_recipients WHERE campaign_id = p_campaign_id AND date_trunc(
      CASE p_interval WHEN '1 hour' THEN 'hour' ELSE 'day' END, opened_at
    ) = b.b) AS aberturas,
    (SELECT count(*) FROM orbit_campaign_recipients WHERE campaign_id = p_campaign_id AND date_trunc(
      CASE p_interval WHEN '1 hour' THEN 'hour' ELSE 'day' END, clicked_at
    ) = b.b) AS cliques
  FROM buckets b
  ORDER BY b.b;
$$;