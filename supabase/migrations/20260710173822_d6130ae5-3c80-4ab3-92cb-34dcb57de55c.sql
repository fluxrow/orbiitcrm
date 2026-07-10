
CREATE OR REPLACE FUNCTION public._lead_score_jsonb_values(p_data jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  WITH RECURSIVE walk(node) AS (
    SELECT p_data
    UNION ALL
    SELECT child.value
    FROM walk
    CROSS JOIN LATERAL (
      SELECT value FROM jsonb_each(walk.node)          WHERE jsonb_typeof(walk.node) = 'object'
      UNION ALL
      SELECT value FROM jsonb_array_elements(walk.node) WHERE jsonb_typeof(walk.node) = 'array'
    ) child
    WHERE jsonb_typeof(walk.node) IN ('object','array')
  )
  SELECT coalesce(string_agg(
    CASE jsonb_typeof(node)
      WHEN 'string'  THEN trim(both '"' from node::text)
      WHEN 'number'  THEN node::text
      WHEN 'boolean' THEN node::text
    END, ' | '
  ), '')
  FROM walk
  WHERE jsonb_typeof(node) IN ('string','number','boolean');
$$;
