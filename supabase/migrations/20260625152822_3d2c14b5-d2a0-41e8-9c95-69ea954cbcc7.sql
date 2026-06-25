
-- ============ APOLLO / LEAD FINDER EXPURGO ============
DROP TABLE IF EXISTS public.orbit_enrichment_queue CASCADE;
DROP TABLE IF EXISTS public.orbit_enrichment_jobs CASCADE;
DROP TABLE IF EXISTS public.orbit_enrichment_credits CASCADE;
DROP TABLE IF EXISTS public.orbit_enrichment_policy CASCADE;
DROP TABLE IF EXISTS public.orbit_leads CASCADE;
DROP TABLE IF EXISTS public.orbit_lead_searches CASCADE;
DROP TABLE IF EXISTS public.orbit_lead_sources CASCADE;
DROP TABLE IF EXISTS public.orbit_icps CASCADE;

-- ============ PAINEL DE SAÚDE (RPCs SUPER ADMIN) ============
CREATE OR REPLACE FUNCTION public.get_system_health_kpis(p_hours integer DEFAULT 24)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since timestamptz := now() - make_interval(hours => GREATEST(1, p_hours));
  v_result jsonb;
  v_webhook_total bigint;
  v_webhook_errors bigint;
  v_webhook_4xx bigint;
  v_webhook_5xx bigint;
  v_flow_events bigint;
  v_flow_processed bigint;
  v_run_total bigint;
  v_run_success bigint;
  v_run_failed bigint;
  v_run_pending bigint;
  v_avg_latency_ms numeric;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden: super_admin only';
  END IF;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status ILIKE '%error%' OR status ILIKE '%fail%' OR error_message IS NOT NULL),
    COUNT(*) FILTER (WHERE status ~ '^4[0-9][0-9]$'),
    COUNT(*) FILTER (WHERE status ~ '^5[0-9][0-9]$')
  INTO v_webhook_total, v_webhook_errors, v_webhook_4xx, v_webhook_5xx
  FROM public.orbit_webhook_logs
  WHERE created_at >= v_since;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE processed)
  INTO v_flow_events, v_flow_processed
  FROM public.orbit_flow_events
  WHERE created_at >= v_since;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'success'),
    COUNT(*) FILTER (WHERE status = 'failed'),
    COUNT(*) FILTER (WHERE status IN ('pending','running')),
    AVG(EXTRACT(EPOCH FROM (finished_at - started_at)) * 1000)
      FILTER (WHERE started_at IS NOT NULL AND finished_at IS NOT NULL)
  INTO v_run_total, v_run_success, v_run_failed, v_run_pending, v_avg_latency_ms
  FROM public.orbit_flow_runs
  WHERE created_at >= v_since;

  v_result := jsonb_build_object(
    'window_hours', p_hours,
    'since', v_since,
    'webhooks', jsonb_build_object(
      'total', COALESCE(v_webhook_total, 0),
      'errors', COALESCE(v_webhook_errors, 0),
      'status_4xx', COALESCE(v_webhook_4xx, 0),
      'status_5xx', COALESCE(v_webhook_5xx, 0),
      'success_rate', CASE WHEN COALESCE(v_webhook_total, 0) = 0 THEN NULL
        ELSE ROUND(((v_webhook_total - v_webhook_errors)::numeric / v_webhook_total) * 100, 2) END
    ),
    'flow_events', jsonb_build_object(
      'total', COALESCE(v_flow_events, 0),
      'processed', COALESCE(v_flow_processed, 0),
      'pending', COALESCE(v_flow_events, 0) - COALESCE(v_flow_processed, 0)
    ),
    'flow_runs', jsonb_build_object(
      'total', COALESCE(v_run_total, 0),
      'success', COALESCE(v_run_success, 0),
      'failed', COALESCE(v_run_failed, 0),
      'pending', COALESCE(v_run_pending, 0),
      'success_rate', CASE WHEN COALESCE(v_run_total, 0) = 0 THEN NULL
        ELSE ROUND((v_run_success::numeric / v_run_total) * 100, 2) END,
      'avg_latency_ms', COALESCE(ROUND(v_avg_latency_ms, 0), 0)
    )
  );

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_system_health_kpis(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_system_health_recent_logs(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_webhooks jsonb;
  v_runs jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'forbidden: super_admin only';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(w)), '[]'::jsonb) INTO v_webhooks
  FROM (
    SELECT id, event_type, instance_id, phone, status, error_message, created_at
    FROM public.orbit_webhook_logs
    ORDER BY created_at DESC
    LIMIT GREATEST(1, p_limit)
  ) w;

  SELECT COALESCE(jsonb_agg(row_to_json(r)), '[]'::jsonb) INTO v_runs
  FROM (
    SELECT r.id, r.flow_id, r.empresa_id, r.status, r.started_at, r.finished_at, r.error, r.created_at,
      CASE WHEN r.started_at IS NOT NULL AND r.finished_at IS NOT NULL
        THEN ROUND(EXTRACT(EPOCH FROM (r.finished_at - r.started_at)) * 1000)
        ELSE NULL END AS latency_ms
    FROM public.orbit_flow_runs r
    ORDER BY r.created_at DESC
    LIMIT GREATEST(1, p_limit)
  ) r;

  RETURN jsonb_build_object('webhooks', v_webhooks, 'flow_runs', v_runs);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_system_health_recent_logs(integer) TO authenticated;

-- Recarrega o cache de relacionamentos do PostgREST (FK assignee → profiles)
NOTIFY pgrst, 'reload schema';
