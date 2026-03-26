CREATE OR REPLACE FUNCTION get_campaign_analytics_summary(p_campaign_id uuid)
RETURNS TABLE(total_recipients bigint, total_sent bigint, delivered bigint, opened bigint, clicked bigint, bounced bigint, complained bigint, no_interaction bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT 
    count(*),
    count(*) FILTER (WHERE status != 'pendente'),
    count(*) FILTER (WHERE delivered_at IS NOT NULL),
    count(*) FILTER (WHERE opened_at IS NOT NULL),
    count(*) FILTER (WHERE clicked_at IS NOT NULL),
    count(*) FILTER (WHERE bounced_at IS NOT NULL),
    count(*) FILTER (WHERE complained_at IS NOT NULL),
    count(*) FILTER (WHERE delivered_at IS NOT NULL AND opened_at IS NULL AND clicked_at IS NULL AND bounced_at IS NULL AND complained_at IS NULL)
  FROM orbit_campaign_recipients
  WHERE campaign_id = p_campaign_id;
$$;