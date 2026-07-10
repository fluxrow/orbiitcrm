
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
      SELECT kv.value
      FROM jsonb_each(walk.node) kv
      WHERE jsonb_typeof(walk.node) = 'object'
        AND lower(kv.key) NOT IN (
          'telefone','phone','whatsapp','celular','tel','fone',
          'email','email_principal','email_addr','e_mail','mail',
          'documento','cpf','cnpj','doc','cnpj_cpf',
          'id','uuid','source_id','prospect_id','empresa_id'
        )
      UNION ALL
      SELECT arr.value FROM jsonb_array_elements(walk.node) arr
      WHERE jsonb_typeof(walk.node) = 'array'
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

-- Também exclui telefone/whatsapp do haystack do prospect (colunas), pois são identificadores.
CREATE OR REPLACE FUNCTION public._lead_score_haystack(p_prospect orbit_prospects)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT lower(coalesce(
    concat_ws(' | ',
      p_prospect.observacoes,
      p_prospect.segmento,
      p_prospect.origem_lead,
      p_prospect.status_qualificacao,
      array_to_string(p_prospect.tags, ' | '),
      public._lead_score_jsonb_values(p_prospect.dados_adicionais)
    ), ''));
$$;
