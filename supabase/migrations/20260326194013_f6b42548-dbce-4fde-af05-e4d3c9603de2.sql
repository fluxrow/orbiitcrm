CREATE OR REPLACE FUNCTION get_campaign_recipient_counts(p_campaign_ids uuid[])
RETURNS TABLE(campaign_id uuid, total bigint, pendente bigint, enviado bigint, falhou bigint, ignorado bigint)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    cr.campaign_id,
    count(*) as total,
    count(*) FILTER (WHERE cr.status = 'pendente') as pendente,
    count(*) FILTER (WHERE cr.status IN ('enviado', 'simulated')) as enviado,
    count(*) FILTER (WHERE cr.status = 'falhou') as falhou,
    count(*) FILTER (WHERE cr.status = 'ignorado') as ignorado
  FROM orbit_campaign_recipients cr
  WHERE cr.campaign_id = ANY(p_campaign_ids)
  GROUP BY cr.campaign_id;
$$;