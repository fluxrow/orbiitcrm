-- Wave 4.3c0: inactive dispatch authorization foundation and read-only preflight.
-- No tenant is activated by this migration and no function can dispatch.
BEGIN;

INSERT INTO public.orbit_feature_flags(empresa_id, feature_key, enabled, rollout_metadata)
SELECT e.id, 'tenant_campaign_dispatch_gate_wave4_v1', false,
       jsonb_build_object('wave','4.3c0','mode','inactive_preflight','real_dispatch',false)
FROM public.orbit_empresas e
WHERE e.slug IN ('fluxrow','bullink-negocios','fabrica-de-pesquisadores','viver-semijoias')
ON CONFLICT (empresa_id, feature_key) DO NOTHING;

DO $guard$
DECLARE v_enabled text[];
BEGIN
  SELECT array_agg(e.slug ORDER BY e.slug) INTO v_enabled
  FROM public.orbit_feature_flags f
  JOIN public.orbit_empresas e ON e.id=f.empresa_id
  WHERE f.feature_key='tenant_campaign_dispatch_gate_wave4_v1'
    AND e.slug IN ('fluxrow','bullink-negocios','fabrica-de-pesquisadores','viver-semijoias')
    AND f.enabled;
  IF v_enabled IS NOT NULL THEN
    RAISE EXCEPTION 'CAMPAIGN_DISPATCH_GATE_MUST_START_DISABLED: %',v_enabled;
  END IF;
END $guard$;

CREATE TABLE IF NOT EXISTS public.orbit_campaign_dispatch_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.orbit_empresas(id) ON DELETE CASCADE,
  campaign_id uuid NOT NULL REFERENCES public.orbit_campaigns(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES auth.users(id),
  approved_by uuid REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'prepared'
    CHECK (status IN ('prepared','approved','consumed','revoked','expired')),
  nonce_hash text,
  snapshot_hash text NOT NULL,
  recipient_count integer NOT NULL CHECK (recipient_count >= 0),
  idempotency_key text NOT NULL,
  expires_at timestamptz NOT NULL,
  approved_at timestamptz,
  consumed_at timestamptz,
  revoked_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empresa_id,idempotency_key)
);

CREATE INDEX IF NOT EXISTS orbit_campaign_dispatch_auth_active_idx
  ON public.orbit_campaign_dispatch_authorizations(campaign_id,status,expires_at)
  WHERE status IN ('prepared','approved');

ALTER TABLE public.orbit_campaign_dispatch_authorizations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.orbit_campaign_dispatch_authorizations FROM PUBLIC,anon,authenticated;
GRANT ALL ON TABLE public.orbit_campaign_dispatch_authorizations TO service_role;

CREATE OR REPLACE FUNCTION public.orbit_tenant_campaign_dispatch_preflight_scoped(
  p_tenant_slug text,
  p_campaign_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_empresa_id uuid;
  v_campaign public.orbit_campaigns%ROWTYPE;
  v_pending integer;
  v_template_valid boolean;
  v_provider_configured boolean;
  v_live_send_enabled boolean;
  v_snapshot_hash text;
  v_blockers jsonb := '[]'::jsonb;
BEGIN
  v_empresa_id := public.orbit_tenant_mutation_authorize(
    p_tenant_slug, 'tenant_campaign_mutations_wave4_v1'
  );
  SELECT * INTO v_campaign
  FROM public.orbit_campaigns c
  WHERE c.id=p_campaign_id AND c.empresa_id=v_empresa_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='CAMPAIGN_NOT_FOUND';
  END IF;

  SELECT count(*)::integer INTO v_pending
  FROM public.orbit_campaign_recipients r
  WHERE r.campaign_id=p_campaign_id AND r.empresa_id=v_empresa_id AND r.status='pendente';
  SELECT EXISTS(
    SELECT 1 FROM public.orbit_message_templates t
    WHERE t.id=v_campaign.template_id AND (t.empresa_id=v_empresa_id OR t.empresa_id IS NULL)
  ) INTO v_template_valid;

  IF v_campaign.canal='whatsapp' THEN
    SELECT coalesce(z.ativo,false) AND nullif(z.instance_id,'') IS NOT NULL
             AND nullif(z.token,'') IS NOT NULL,
           coalesce(z.envio_real_liberado,false)
    INTO v_provider_configured,v_live_send_enabled
    FROM public.orbit_zapi_config z
    WHERE z.empresa_id=v_empresa_id
    ORDER BY z.ativo DESC,z.updated_at DESC NULLS LAST LIMIT 1;
  ELSE
    SELECT nullif(r.api_key,'') IS NOT NULL, nullif(r.api_key,'') IS NOT NULL
    INTO v_provider_configured,v_live_send_enabled
    FROM public.orbit_resend_config r
    WHERE r.empresa_id=v_empresa_id OR r.empresa_id IS NULL
    ORDER BY (r.empresa_id=v_empresa_id) DESC LIMIT 1;
  END IF;
  v_provider_configured := coalesce(v_provider_configured,false);
  v_live_send_enabled := coalesce(v_live_send_enabled,false);

  IF v_campaign.aprovacao_status='aprovada' THEN v_blockers:=v_blockers||' ["ALREADY_APPROVED"]'::jsonb; END IF;
  IF v_campaign.status NOT IN ('rascunho','em_revisao','agendada','pausada') THEN v_blockers:=v_blockers||' ["INVALID_STATUS"]'::jsonb; END IF;
  IF NOT v_template_valid THEN v_blockers:=v_blockers||' ["TEMPLATE_MISSING"]'::jsonb; END IF;
  IF v_pending=0 THEN v_blockers:=v_blockers||' ["NO_PENDING_RECIPIENTS"]'::jsonb; END IF;
  IF NOT v_provider_configured THEN v_blockers:=v_blockers||' ["PROVIDER_NOT_CONFIGURED"]'::jsonb; END IF;
  IF NOT v_live_send_enabled THEN v_blockers:=v_blockers||' ["LIVE_SEND_DISABLED"]'::jsonb; END IF;

  v_snapshot_hash := md5(concat_ws('|',v_campaign.id::text,v_campaign.updated_at::text,
    coalesce(v_campaign.template_id::text,''),v_campaign.canal,v_pending::text,
    coalesce(v_campaign.agendada_para::text,'')));

  RETURN jsonb_build_object('ok',true,'data',jsonb_build_object(
    'campaign_id',v_campaign.id,'channel',v_campaign.canal,'status',v_campaign.status,
    'approval_status',v_campaign.aprovacao_status,'pending_recipients',v_pending,
    'requires_typed_confirmation',v_pending>50,
    'required_confirmation',CASE WHEN v_pending>50 THEN 'CONFIRMAR' ELSE NULL END,
    'provider_configured',v_provider_configured,'live_send_enabled',v_live_send_enabled,
    'scheduled_at',v_campaign.agendada_para,
    'scheduled_overdue',v_campaign.agendada_para IS NOT NULL AND v_campaign.agendada_para<=now(),
    'snapshot_hash',v_snapshot_hash,'ready',jsonb_array_length(v_blockers)=0,
    'blockers',v_blockers,'dispatch_gate_active',false
  ));
END
$function$;

REVOKE ALL ON FUNCTION public.orbit_tenant_campaign_dispatch_preflight_scoped(text,uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.orbit_tenant_campaign_dispatch_preflight_scoped(text,uuid)
  TO authenticated;

COMMENT ON FUNCTION public.orbit_tenant_campaign_dispatch_preflight_scoped(text,uuid)
  IS 'Read-only campaign dispatch readiness preview. It never approves, schedules or sends.';

COMMIT;
