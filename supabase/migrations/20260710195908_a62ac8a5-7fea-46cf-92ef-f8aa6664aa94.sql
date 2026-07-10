
WITH targets AS (
  SELECT id FROM orbit_prospects
  WHERE (nome_razao LIKE 'Smoke LS %' OR nome_razao LIKE 'Deploy probe%' OR nome_razao LIKE 'Deploy probeB%')
    AND created_at > now() - interval '2 hours'
)
UPDATE orbit_flow_scheduled_actions
SET status='canceled', canceled_reason='smoke_cleanup', updated_at=now()
WHERE prospect_id IN (SELECT id FROM targets) AND status='pending';

UPDATE orbit_prospects
SET deleted_at=now(), updated_at=now()
WHERE (nome_razao LIKE 'Smoke LS %' OR nome_razao LIKE 'Deploy probe%' OR nome_razao LIKE 'Deploy probeB%')
  AND created_at > now() - interval '2 hours';
