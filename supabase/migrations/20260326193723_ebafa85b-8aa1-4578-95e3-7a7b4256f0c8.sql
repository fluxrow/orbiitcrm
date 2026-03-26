UPDATE orbit_campaigns oc SET enviados = sub.cnt
FROM (
  SELECT campaign_id, count(*) as cnt 
  FROM orbit_campaign_recipients 
  WHERE status IN ('enviado', 'simulated') 
  GROUP BY campaign_id
) sub
WHERE oc.id = sub.campaign_id AND (oc.enviados IS DISTINCT FROM sub.cnt);