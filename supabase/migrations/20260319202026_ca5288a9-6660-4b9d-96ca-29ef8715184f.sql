-- Reset última campanha para reenvio
UPDATE orbit_campaigns 
SET status = 'aprovada', 
    enviados = 0, 
    falhas = 0,
    aprovacao_status = 'aprovada'
WHERE id = 'eb08928d-9413-40e9-a8bd-728aff8f3866';

-- Reset destinatários da campanha
UPDATE orbit_campaign_recipients 
SET status = 'pendente', 
    enviado_em = NULL, 
    erro = NULL 
WHERE campaign_id = 'eb08928d-9413-40e9-a8bd-728aff8f3866';

-- Apagar mensagens de todas as conversas
DELETE FROM orbit_mensagens 
WHERE conversa_id IN (SELECT id FROM orbit_conversas);

-- Apagar handoffs
DELETE FROM orbit_handoffs 
WHERE conversa_id IN (SELECT id FROM orbit_conversas);

-- Apagar conversas
DELETE FROM orbit_conversas;