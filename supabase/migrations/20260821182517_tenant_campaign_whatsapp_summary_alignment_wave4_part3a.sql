-- Align WhatsApp campaign totals with the canonical campaign recipient ledger.
BEGIN;

CREATE OR REPLACE FUNCTION public.orbit_tenant_campaign_whatsapp_summary_read(
  p_tenant_slug text,
  p_campaign_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_empresa_id uuid;
  v_row jsonb;
BEGIN
  v_empresa_id := public.orbit_tenant_context_authorize(
    p_tenant_slug, 'tenant_campaign_analytics_context_wave4_v1'
  );

  IF p_campaign_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.orbit_campaigns c
    WHERE c.id = p_campaign_id
      AND c.empresa_id = v_empresa_id
      AND c.canal = 'whatsapp'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'CAMPAIGN_TENANT_MISMATCH';
  END IF;

  SELECT to_jsonb(x) INTO v_row
  FROM (
    SELECT count(*) AS total_recipients,
           count(*) FILTER (WHERE r.status IN ('enviado', 'simulated', 'clicado')) AS total_sent,
           count(*) FILTER (WHERE r.delivered_at IS NOT NULL) AS delivered,
           0::bigint AS read,
           0::bigint AS replied,
           count(*) FILTER (WHERE r.status = 'falhou') AS failed,
           count(*) FILTER (WHERE r.status = 'pendente') AS pending
    FROM public.orbit_campaign_recipients r
    WHERE r.empresa_id = v_empresa_id
      AND r.campaign_id = p_campaign_id
  ) x;

  RETURN jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'tenant_id', v_empresa_id,
      'tenant_slug', btrim(p_tenant_slug),
      'section', 'whatsapp_summary',
      'rows', jsonb_build_array(v_row)
    )
  );
END
$function$;

REVOKE ALL ON FUNCTION public.orbit_tenant_campaign_whatsapp_summary_read(text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orbit_tenant_campaign_whatsapp_summary_read(text, uuid)
  TO authenticated;

COMMIT;
