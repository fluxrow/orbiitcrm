-- Wave 4.3c1: server-side dispatch authorization claim in shadow mode.
-- The rollout flag remains false for every tenant.
BEGIN;

DO $guard$
DECLARE v_enabled text[];
BEGIN
  SELECT array_agg(e.slug ORDER BY e.slug) INTO v_enabled
  FROM public.orbit_feature_flags f
  JOIN public.orbit_empresas e ON e.id=f.empresa_id
  WHERE f.feature_key='tenant_campaign_dispatch_gate_wave4_v1' AND f.enabled;
  IF v_enabled IS NOT NULL THEN
    RAISE EXCEPTION 'CAMPAIGN_DISPATCH_GATE_MUST_REMAIN_DISABLED: %',v_enabled;
  END IF;
END $guard$;

CREATE OR REPLACE FUNCTION public.orbit_campaign_dispatch_claim(
  p_campaign_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_campaign public.orbit_campaigns%ROWTYPE;
  v_gate_enabled boolean := false;
  v_pending integer;
  v_snapshot_hash text;
  v_authorization public.orbit_campaign_dispatch_authorizations%ROWTYPE;
BEGIN
  SELECT * INTO v_campaign
  FROM public.orbit_campaigns c
  WHERE c.id=p_campaign_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed',false,'gate_enabled',false,'reason','CAMPAIGN_NOT_FOUND');
  END IF;

  SELECT coalesce(f.enabled,false) INTO v_gate_enabled
  FROM public.orbit_feature_flags f
  WHERE f.empresa_id=v_campaign.empresa_id
    AND f.feature_key='tenant_campaign_dispatch_gate_wave4_v1';
  v_gate_enabled := coalesce(v_gate_enabled,false);

  -- Shadow/legacy path: no authorization row is read or mutated.
  IF NOT v_gate_enabled THEN
    RETURN jsonb_build_object('allowed',true,'gate_enabled',false,'mode','shadow_legacy');
  END IF;

  -- A consumed authorization remains valid only for an already-started run.
  SELECT * INTO v_authorization
  FROM public.orbit_campaign_dispatch_authorizations a
  WHERE a.empresa_id=v_campaign.empresa_id
    AND a.campaign_id=v_campaign.id
    AND a.status='consumed'
    AND v_campaign.status IN ('enviando','aprovada_para_envio','pausada_por_limite')
  ORDER BY a.consumed_at DESC NULLS LAST
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('allowed',true,'gate_enabled',true,'mode','authorized_resume',
      'authorization_id',v_authorization.id);
  END IF;

  SELECT count(*)::integer INTO v_pending
  FROM public.orbit_campaign_recipients r
  WHERE r.campaign_id=v_campaign.id
    AND r.empresa_id=v_campaign.empresa_id
    AND r.status='pendente';
  v_snapshot_hash := md5(concat_ws('|',v_campaign.id::text,v_campaign.updated_at::text,
    coalesce(v_campaign.template_id::text,''),v_campaign.canal,v_pending::text,
    coalesce(v_campaign.agendada_para::text,'')));

  SELECT * INTO v_authorization
  FROM public.orbit_campaign_dispatch_authorizations a
  WHERE a.empresa_id=v_campaign.empresa_id
    AND a.campaign_id=v_campaign.id
    AND a.status='approved'
    AND a.expires_at>now()
    AND a.snapshot_hash=v_snapshot_hash
    AND a.recipient_count=v_pending
  ORDER BY a.approved_at DESC NULLS LAST,a.created_at DESC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed',false,'gate_enabled',true,
      'reason','CAMPAIGN_DISPATCH_AUTHORIZATION_REQUIRED','snapshot_hash',v_snapshot_hash,
      'pending_recipients',v_pending);
  END IF;

  UPDATE public.orbit_campaign_dispatch_authorizations
  SET status='consumed',consumed_at=now(),updated_at=now()
  WHERE id=v_authorization.id AND status='approved';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed',false,'gate_enabled',true,
      'reason','CAMPAIGN_DISPATCH_AUTHORIZATION_ALREADY_CONSUMED');
  END IF;

  RETURN jsonb_build_object('allowed',true,'gate_enabled',true,'mode','authorization_consumed',
    'authorization_id',v_authorization.id,'snapshot_hash',v_snapshot_hash,
    'pending_recipients',v_pending);
END
$function$;

REVOKE ALL ON FUNCTION public.orbit_campaign_dispatch_claim(uuid)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.orbit_campaign_dispatch_claim(uuid) TO service_role;

COMMENT ON FUNCTION public.orbit_campaign_dispatch_claim(uuid)
  IS 'Service-only atomic dispatch authorization gate. Flag-disabled tenants use an inert shadow path.';

COMMIT;
