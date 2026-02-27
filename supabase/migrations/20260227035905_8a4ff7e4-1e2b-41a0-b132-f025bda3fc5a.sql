
-- Remove duplicate prospects by nome_razao + empresa_id, keeping the most recently updated one
DELETE FROM orbit_prospects
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY empresa_id, lower(trim(nome_razao))
        ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
      ) AS rn
    FROM orbit_prospects
  ) ranked
  WHERE rn > 1
);
