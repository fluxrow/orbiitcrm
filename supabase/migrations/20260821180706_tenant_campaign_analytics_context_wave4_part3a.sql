-- Wave 4.3a: tenant-scoped, read-only campaign analytics contract.
BEGIN;

INSERT INTO public.orbit_feature_flags(
  empresa_id, feature_key, enabled, enabled_at, rollout_metadata
)
SELECT e.id, 'tenant_campaign_analytics_context_wave4_v1',
       e.slug = 'fluxrow',
       CASE WHEN e.slug = 'fluxrow' THEN now() ELSE NULL END,
       jsonb_build_object('canary', e.slug = 'fluxrow', 'wave', '4.3a', 'mode', 'read-only')
FROM public.orbit_empresas e
WHERE e.slug IN (
  'fluxrow', 'bullink-negocios',
  'fabrica-de-pesquisadores', 'viver-semijoias'
)
ON CONFLICT (empresa_id, feature_key) DO NOTHING;

DO $rollout_guard$
DECLARE v_invalid text[];
BEGIN
  SELECT array_agg(expected.slug ORDER BY expected.slug) INTO v_invalid
  FROM (
    VALUES ('fluxrow', true), ('bullink-negocios', false),
           ('fabrica-de-pesquisadores', false), ('viver-semijoias', false)
  ) expected(slug, enabled)
  LEFT JOIN public.orbit_empresas e ON e.slug = expected.slug
  LEFT JOIN public.orbit_feature_flags f
    ON f.empresa_id = e.id
   AND f.feature_key = 'tenant_campaign_analytics_context_wave4_v1'
  WHERE e.id IS NULL OR f.enabled IS DISTINCT FROM expected.enabled;
  IF v_invalid IS NOT NULL THEN
    RAISE EXCEPTION 'TENANT_CAMPAIGN_ANALYTICS_ROLLOUT_MISMATCH: %', v_invalid;
  END IF;
END
$rollout_guard$;

CREATE OR REPLACE FUNCTION public.orbit_tenant_campaign_analytics_read(
  p_tenant_slug text,
  p_section text,
  p_campaign_id uuid DEFAULT NULL,
  p_campaign_ids uuid[] DEFAULT NULL,
  p_interval text DEFAULT '1 day'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_empresa_id uuid;
  v_rows jsonb := '[]'::jsonb;
BEGIN
  v_empresa_id := public.orbit_tenant_context_authorize(
    p_tenant_slug, 'tenant_campaign_analytics_context_wave4_v1'
  );

  IF p_section = 'recipient_counts' THEN
    IF coalesce(cardinality(p_campaign_ids), 0) = 0 THEN
      RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object('rows', v_rows));
    END IF;
    IF EXISTS (
      SELECT 1 FROM unnest(p_campaign_ids) requested(id)
      LEFT JOIN public.orbit_campaigns c
        ON c.id = requested.id AND c.empresa_id = v_empresa_id
      WHERE c.id IS NULL
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'CAMPAIGN_TENANT_MISMATCH';
    END IF;
    SELECT coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) INTO v_rows
    FROM (
      SELECT cr.campaign_id,
             count(*) AS total,
             count(*) FILTER (WHERE cr.status = 'pendente') AS pendente,
             count(*) FILTER (WHERE cr.status IN ('enviado', 'simulated')) AS enviado,
             count(*) FILTER (WHERE cr.status = 'falhou') AS falhou,
             count(*) FILTER (WHERE cr.status = 'ignorado') AS ignorado
      FROM public.orbit_campaign_recipients cr
      WHERE cr.empresa_id = v_empresa_id
        AND cr.campaign_id = ANY(p_campaign_ids)
      GROUP BY cr.campaign_id
    ) x;
  ELSE
    IF p_campaign_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.orbit_campaigns c
      WHERE c.id = p_campaign_id AND c.empresa_id = v_empresa_id
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'CAMPAIGN_TENANT_MISMATCH';
    END IF;

    IF p_section = 'email_summary' THEN
      SELECT jsonb_agg(to_jsonb(x)) INTO v_rows FROM (
        SELECT count(*) AS total_recipients,
               count(*) FILTER (WHERE status <> 'pendente') AS total_sent,
               count(*) FILTER (WHERE delivered_at IS NOT NULL) AS delivered,
               count(*) FILTER (WHERE opened_at IS NOT NULL) AS opened,
               count(*) FILTER (WHERE clicked_at IS NOT NULL) AS clicked,
               count(*) FILTER (WHERE bounced_at IS NOT NULL) AS bounced,
               count(*) FILTER (WHERE complained_at IS NOT NULL) AS complained,
               count(*) FILTER (WHERE delivered_at IS NOT NULL AND opened_at IS NULL AND clicked_at IS NULL AND bounced_at IS NULL AND complained_at IS NULL) AS no_interaction
        FROM public.orbit_campaign_recipients
        WHERE empresa_id = v_empresa_id AND campaign_id = p_campaign_id
      ) x;
    ELSIF p_section = 'whatsapp_summary' THEN
      SELECT jsonb_agg(to_jsonb(x)) INTO v_rows FROM (
        SELECT count(*) AS total_recipients,
               count(*) FILTER (WHERE o.status NOT IN ('pending', 'canceled')) AS total_sent,
               count(*) FILTER (WHERE o.status IN ('sent', 'simulated')) AS delivered,
               0::bigint AS read,
               0::bigint AS replied,
               count(*) FILTER (WHERE o.status = 'failed') AS failed,
               count(*) FILTER (WHERE o.status = 'pending') AS pending
        FROM public.orbit_whatsapp_outbox o
        WHERE o.empresa_id = v_empresa_id AND o.campaign_id = p_campaign_id
      ) x;
    ELSIF p_section = 'timeline' THEN
      IF p_interval NOT IN ('1 hour', '1 day') THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_TIMELINE_INTERVAL';
      END IF;
      WITH events AS (
        SELECT enviado_em ts, 'enviado' tipo FROM public.orbit_campaign_recipients WHERE empresa_id=v_empresa_id AND campaign_id=p_campaign_id AND enviado_em IS NOT NULL
        UNION ALL SELECT delivered_at, 'entregue' FROM public.orbit_campaign_recipients WHERE empresa_id=v_empresa_id AND campaign_id=p_campaign_id AND delivered_at IS NOT NULL
        UNION ALL SELECT opened_at, 'abertura' FROM public.orbit_campaign_recipients WHERE empresa_id=v_empresa_id AND campaign_id=p_campaign_id AND opened_at IS NOT NULL
        UNION ALL SELECT clicked_at, 'clique' FROM public.orbit_campaign_recipients WHERE empresa_id=v_empresa_id AND campaign_id=p_campaign_id AND clicked_at IS NOT NULL
      ), buckets AS (
        SELECT date_trunc(CASE WHEN p_interval='1 hour' THEN 'hour' ELSE 'day' END, ts) bucket, tipo FROM events
      )
      SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.bucket), '[]'::jsonb) INTO v_rows
      FROM (
        SELECT bucket,
               count(*) FILTER (WHERE tipo='enviado') enviados,
               count(*) FILTER (WHERE tipo='entregue') entregues,
               count(*) FILTER (WHERE tipo='abertura') aberturas,
               count(*) FILTER (WHERE tipo='clique') cliques,
               count(*) FILTER (WHERE tipo='leitura') leituras,
               count(*) FILTER (WHERE tipo='resposta') respostas
        FROM buckets GROUP BY bucket
      ) x;
    ELSE
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'UNKNOWN_CAMPAIGN_ANALYTICS_SECTION';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'tenant_id', v_empresa_id,
      'tenant_slug', btrim(p_tenant_slug),
      'section', p_section,
      'rows', coalesce(v_rows, '[]'::jsonb)
    )
  );
END
$function$;

REVOKE ALL ON FUNCTION public.orbit_tenant_campaign_analytics_read(text, text, uuid, uuid[], text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orbit_tenant_campaign_analytics_read(text, text, uuid, uuid[], text)
  TO authenticated;

COMMIT;
