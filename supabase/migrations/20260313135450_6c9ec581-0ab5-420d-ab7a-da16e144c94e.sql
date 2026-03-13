
-- 1) Delete messages from the conversation
DELETE FROM orbit_mensagens WHERE conversa_id = '1310cd7c-09f4-45aa-aa9b-1d449173e6e6';

-- 2) Delete the conversation
DELETE FROM orbit_conversas WHERE id = '1310cd7c-09f4-45aa-aa9b-1d449173e6e6';

-- 3) Delete the duplicate prospect
DELETE FROM orbit_prospects WHERE id = 'be8631c7-485e-477f-9b42-c2816799ee85';
