
-- Fix conversas with null empresa_id using prospect's empresa_id
UPDATE orbit_conversas c
SET empresa_id = p.empresa_id
FROM orbit_prospects p
WHERE c.prospect_id = p.id
  AND c.empresa_id IS NULL
  AND p.empresa_id IS NOT NULL;

-- Fix mensagens with null empresa_id using conversa's empresa_id
UPDATE orbit_mensagens m
SET empresa_id = c.empresa_id
FROM orbit_conversas c
WHERE m.conversa_id = c.id
  AND m.empresa_id IS NULL
  AND c.empresa_id IS NOT NULL;
