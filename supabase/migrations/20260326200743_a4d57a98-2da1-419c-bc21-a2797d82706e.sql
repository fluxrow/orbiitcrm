
DELETE FROM orbit_email_events WHERE recipient_id IN (
  SELECT id FROM orbit_campaign_recipients WHERE campaign_id = 'dd899fc6-a6bb-4dad-a9e2-94ce772087e4'
);
DELETE FROM orbit_campaign_recipients WHERE campaign_id = 'dd899fc6-a6bb-4dad-a9e2-94ce772087e4';
DELETE FROM orbit_campaign_approvals WHERE campaign_id = 'dd899fc6-a6bb-4dad-a9e2-94ce772087e4';
DELETE FROM orbit_mensagens WHERE campaign_id = 'dd899fc6-a6bb-4dad-a9e2-94ce772087e4';
DELETE FROM orbit_campaigns WHERE id = 'dd899fc6-a6bb-4dad-a9e2-94ce772087e4';
