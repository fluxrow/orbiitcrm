CREATE INDEX IF NOT EXISTS idx_orbit_prospects_email
  ON public.orbit_prospects(email_principal);

CREATE INDEX IF NOT EXISTS idx_orbit_prospects_status_qual
  ON public.orbit_prospects(status_qualificacao);

CREATE INDEX IF NOT EXISTS idx_orbit_prospects_created_at
  ON public.orbit_prospects(created_at);

CREATE INDEX IF NOT EXISTS idx_orbit_prospects_responsavel
  ON public.orbit_prospects(responsavel_id);

CREATE INDEX IF NOT EXISTS idx_orbit_deals_status
  ON public.orbit_deals(status);

CREATE INDEX IF NOT EXISTS idx_orbit_deals_etapa
  ON public.orbit_deals(etapa_id);

CREATE INDEX IF NOT EXISTS idx_orbit_deals_created_at
  ON public.orbit_deals(created_at);

CREATE INDEX IF NOT EXISTS idx_orbit_campaigns_status
  ON public.orbit_campaigns(status);

CREATE INDEX IF NOT EXISTS idx_orbit_campaigns_canal
  ON public.orbit_campaigns(canal);

CREATE INDEX IF NOT EXISTS idx_orbit_cr_opened
  ON public.orbit_campaign_recipients(opened_at)
  WHERE opened_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orbit_cr_clicked
  ON public.orbit_campaign_recipients(clicked_at)
  WHERE clicked_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orbit_cr_bounced
  ON public.orbit_campaign_recipients(bounced_at)
  WHERE bounced_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orbit_cr_delivered
  ON public.orbit_campaign_recipients(delivered_at)
  WHERE delivered_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orbit_conversas_status
  ON public.orbit_conversas(status);

CREATE INDEX IF NOT EXISTS idx_orbit_conversas_ultima_msg
  ON public.orbit_conversas(ultima_mensagem_at DESC);

CREATE OR REPLACE FUNCTION public.find_duplicate_prospects(
  p_empresa_id uuid,
  p_emails text[],
  p_phones text[]
)
RETURNS TABLE(
  id uuid,
  email_principal text,
  telefone text,
  whatsapp text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, email_principal, telefone, whatsapp
  FROM orbit_prospects
  WHERE empresa_id = p_empresa_id
    AND (
      (coalesce(array_length(p_emails, 1), 0) > 0 AND email_principal = ANY(p_emails))
      OR (coalesce(array_length(p_phones, 1), 0) > 0 AND telefone = ANY(p_phones))
      OR (coalesce(array_length(p_phones, 1), 0) > 0 AND whatsapp = ANY(p_phones))
    );
$$;

GRANT EXECUTE ON FUNCTION public.find_duplicate_prospects(uuid, text[], text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_orbit_analytics_summary(p_empresa_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH
  this_month AS (
    SELECT date_trunc('month', now()) AS start
  ),
  last_month AS (
    SELECT date_trunc('month', now() - interval '1 month') AS start
  ),
  prospect_stats AS (
    SELECT
      count(*) AS total,
      count(*) FILTER (WHERE created_at >= (SELECT start FROM this_month)) AS mes_atual,
      count(*) FILTER (
        WHERE created_at >= (SELECT start FROM last_month)
          AND created_at < (SELECT start FROM this_month)
      ) AS mes_anterior
    FROM orbit_prospects
    WHERE empresa_id = p_empresa_id
  ),
  deal_stats AS (
    SELECT
      count(*) AS total,
      count(*) FILTER (WHERE status = 'won') AS won,
      COALESCE(sum(valor_estimado) FILTER (WHERE status = 'open'), 0) AS pipeline_total,
      count(*) FILTER (
        WHERE created_at >= (SELECT start FROM last_month)
          AND created_at < (SELECT start FROM this_month)
      ) AS total_anterior,
      count(*) FILTER (
        WHERE status = 'won'
          AND created_at >= (SELECT start FROM last_month)
          AND created_at < (SELECT start FROM this_month)
      ) AS won_anterior,
      COALESCE(sum(valor_estimado) FILTER (
        WHERE status = 'open' AND created_at < (SELECT start FROM this_month)
      ), 0) AS pipeline_anterior
    FROM orbit_deals
    WHERE empresa_id = p_empresa_id
  ),
  conversa_stats AS (
    SELECT
      count(*) FILTER (WHERE status = 'aberta') AS ativas,
      count(*) FILTER (
        WHERE status = 'aberta'
          AND created_at >= now() - interval '1 day'
      ) AS ontem
    FROM orbit_conversas
    WHERE empresa_id = p_empresa_id
  ),
  origem_distribution AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object('name', origem_nome, 'value', cnt)
        ORDER BY cnt DESC
      ),
      '[]'::jsonb
    ) AS data
    FROM (
      SELECT coalesce(origem_contato, 'Não informado') AS origem_nome, count(*) AS cnt
      FROM orbit_prospects
      WHERE empresa_id = p_empresa_id
      GROUP BY 1
    ) s
  ),
  prospects_por_mes AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object('month', m, 'leads', cnt)
        ORDER BY m
      ),
      '[]'::jsonb
    ) AS data
    FROM (
      SELECT
        to_char(date_trunc('month', created_at), 'YYYY-MM') AS m,
        count(*) AS cnt
      FROM orbit_prospects
      WHERE empresa_id = p_empresa_id
        AND created_at >= date_trunc('month', now() - interval '5 months')
      GROUP BY 1
    ) s
  ),
  deals_por_mes AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object('month', m, 'total', total, 'won', won)
        ORDER BY m
      ),
      '[]'::jsonb
    ) AS data
    FROM (
      SELECT
        to_char(date_trunc('month', created_at), 'YYYY-MM') AS m,
        count(*) AS total,
        count(*) FILTER (WHERE status = 'won') AS won
      FROM orbit_deals
      WHERE empresa_id = p_empresa_id
        AND created_at >= date_trunc('month', now() - interval '5 months')
      GROUP BY 1
    ) s
  ),
  team_leads AS (
    SELECT
      op.responsavel_id,
      coalesce(p.nome, p.email, 'Sem nome') AS nome,
      count(*) AS leads
    FROM orbit_prospects op
    JOIN profiles p
      ON p.id = op.responsavel_id
    WHERE op.empresa_id = p_empresa_id
      AND op.responsavel_id IS NOT NULL
    GROUP BY op.responsavel_id, p.nome, p.email
  ),
  team_wins AS (
    SELECT
      responsavel_id,
      count(*) FILTER (WHERE status = 'won') AS won
    FROM orbit_deals
    WHERE empresa_id = p_empresa_id
      AND responsavel_id IS NOT NULL
    GROUP BY responsavel_id
  ),
  performance_equipe AS (
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'name', nome,
          'leads', leads,
          'conversao', won
        )
        ORDER BY leads DESC
      ),
      '[]'::jsonb
    ) AS data
    FROM (
      SELECT
        tl.nome,
        tl.leads,
        coalesce(tw.won, 0) AS won
      FROM team_leads tl
      LEFT JOIN team_wins tw
        ON tw.responsavel_id = tl.responsavel_id
      ORDER BY tl.leads DESC
      LIMIT 10
    ) s
  )
SELECT jsonb_build_object(
  'total_prospects', ps.total,
  'prospects_mes_atual', ps.mes_atual,
  'prospects_mes_anterior', ps.mes_anterior,
  'conversas_ativas', cs.ativas,
  'conversas_ontem', cs.ontem,
  'pipeline_total', ds.pipeline_total,
  'pipeline_mes_anterior', ds.pipeline_anterior,
  'deals_total', ds.total,
  'deals_won', ds.won,
  'deals_total_anterior', ds.total_anterior,
  'deals_won_anterior', ds.won_anterior,
  'origem_distribution', od.data,
  'prospects_por_mes', ppm.data,
  'deals_por_mes', dpm.data,
  'performance_equipe', pe.data
)
FROM prospect_stats ps
CROSS JOIN deal_stats ds
CROSS JOIN conversa_stats cs
CROSS JOIN origem_distribution od
CROSS JOIN prospects_por_mes ppm
CROSS JOIN deals_por_mes dpm
CROSS JOIN performance_equipe pe;
$$;
