UPDATE orbit_campaign_recipients
SET clicked_at = now() - interval '2 days',
    status = 'clicado'
WHERE id = '70dd4062-0760-4c98-b707-f51549093f5a';

DELETE FROM prospect_events
WHERE prospect_id = '59cc4839-ac19-4d3a-886f-e5d5d7d0204e'
  AND event_type = 'email_cta_whatsapp_reply';