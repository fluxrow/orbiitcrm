
CREATE OR REPLACE FUNCTION public.reconcile_campaign_counters(_campaign_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _total int := 0;
  _enviados int := 0;
  _falhas int := 0;
  _aberturas int := 0;
  _cliques int := 0;
  _respostas int := 0;
BEGIN
  SELECT
    COUNT(*)::int,
    COUNT(*) FILTER (
      WHERE lower(coalesce(status,'')) IN (
        'enviado','enviada','sent','entregue','delivered',
        'aberto','opened','clicado','clicked','respondido','respondida','replied'
      )
    )::int,
    COUNT(*) FILTER (
      WHERE lower(coalesce(status,'')) IN (
        'falha','falhou','failed','erro','error','bounced','bounce'
      )
    )::int,
    COUNT(*) FILTER (WHERE opened_at IS NOT NULL)::int,
    COUNT(*) FILTER (WHERE clicked_at IS NOT NULL)::int,
    COUNT(*) FILTER (
      WHERE lower(coalesce(status,'')) IN ('respondido','respondida','replied')
    )::int
    INTO _total, _enviados, _falhas, _aberturas, _cliques, _respostas
  FROM public.orbit_campaign_recipients
  WHERE campaign_id = _campaign_id;

  UPDATE public.orbit_campaigns
     SET total_destinatarios = _total,
         enviados = _enviados,
         falhas = _falhas,
         aberturas = _aberturas,
         cliques = _cliques,
         respostas = _respostas,
         updated_at = now()
   WHERE id = _campaign_id;

  RETURN jsonb_build_object(
    'campaign_id', _campaign_id,
    'total', _total,
    'enviados', _enviados,
    'falhas', _falhas,
    'aberturas', _aberturas,
    'cliques', _cliques,
    'respostas', _respostas
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_campaign_counters(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_campaign_counters(uuid) TO service_role, authenticated;
