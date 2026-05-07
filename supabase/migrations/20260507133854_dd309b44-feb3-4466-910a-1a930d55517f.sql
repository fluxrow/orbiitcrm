
-- WhatsApp CTA columns on templates
ALTER TABLE public.orbit_message_templates
  ADD COLUMN IF NOT EXISTS whatsapp_cta_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_cta_numero text,
  ADD COLUMN IF NOT EXISTS whatsapp_cta_texto_botao text DEFAULT 'Falar no WhatsApp',
  ADD COLUMN IF NOT EXISTS whatsapp_cta_mensagem_inicial text,
  ADD COLUMN IF NOT EXISTS whatsapp_cta_posicao text DEFAULT 'rodape';

ALTER TABLE public.orbit_message_templates
  DROP CONSTRAINT IF EXISTS orbit_message_templates_whatsapp_cta_posicao_check;
ALTER TABLE public.orbit_message_templates
  ADD CONSTRAINT orbit_message_templates_whatsapp_cta_posicao_check
  CHECK (whatsapp_cta_posicao IN ('topo','rodape','ambos'));

-- Optional override on campaign
ALTER TABLE public.orbit_campaigns
  ADD COLUMN IF NOT EXISTS whatsapp_cta_override boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS whatsapp_cta_enabled boolean,
  ADD COLUMN IF NOT EXISTS whatsapp_cta_numero text,
  ADD COLUMN IF NOT EXISTS whatsapp_cta_texto_botao text,
  ADD COLUMN IF NOT EXISTS whatsapp_cta_mensagem_inicial text,
  ADD COLUMN IF NOT EXISTS whatsapp_cta_posicao text;

ALTER TABLE public.orbit_campaigns
  DROP CONSTRAINT IF EXISTS orbit_campaigns_whatsapp_cta_posicao_check;
ALTER TABLE public.orbit_campaigns
  ADD CONSTRAINT orbit_campaigns_whatsapp_cta_posicao_check
  CHECK (whatsapp_cta_posicao IS NULL OR whatsapp_cta_posicao IN ('topo','rodape','ambos'));

-- Indexes for engagement aggregation
CREATE INDEX IF NOT EXISTS idx_orbit_campaign_recipients_empresa_enviado
  ON public.orbit_campaign_recipients (empresa_id, enviado_em DESC)
  WHERE enviado_em IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orbit_campaign_recipients_prospect
  ON public.orbit_campaign_recipients (prospect_id);

-- Engagement summary function (aggregates ALL email campaigns)
CREATE OR REPLACE FUNCTION public.get_prospect_engagement_summary(
  p_empresa_id uuid,
  p_dias integer DEFAULT 90
)
RETURNS TABLE (
  prospect_id uuid,
  total_emails integer,
  total_aberturas integer,
  total_cliques integer,
  ultima_abertura_em timestamptz,
  ultimo_clique_em timestamptz,
  bounced boolean,
  complained boolean,
  engajamento_score integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.prospect_id,
    COUNT(*)::int AS total_emails,
    COUNT(r.opened_at)::int AS total_aberturas,
    COUNT(r.clicked_at)::int AS total_cliques,
    MAX(r.opened_at) AS ultima_abertura_em,
    MAX(r.clicked_at) AS ultimo_clique_em,
    bool_or(r.bounced_at IS NOT NULL) AS bounced,
    bool_or(r.complained_at IS NOT NULL) AS complained,
    LEAST(100, (COUNT(r.opened_at) * 10 + COUNT(r.clicked_at) * 25)::int) AS engajamento_score
  FROM public.orbit_campaign_recipients r
  JOIN public.orbit_campaigns c ON c.id = r.campaign_id
  WHERE r.empresa_id = p_empresa_id
    AND r.prospect_id IS NOT NULL
    AND c.canal = 'email'
    AND (p_dias <= 0 OR r.enviado_em >= now() - (p_dias || ' days')::interval)
  GROUP BY r.prospect_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_prospect_engagement_summary(uuid, integer) TO authenticated;
