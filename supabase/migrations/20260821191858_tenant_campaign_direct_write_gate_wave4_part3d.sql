-- Wave 4.3d: once tenant campaign mutations are enabled, client-side DML is
-- closed and every write must pass through the audited scoped RPCs. Tenants
-- outside the rollout retain their existing behavior.
BEGIN;

CREATE OR REPLACE FUNCTION public.orbit_campaign_direct_write_allowed(
  p_empresa_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT p_empresa_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.orbit_feature_flags f
      WHERE f.empresa_id = p_empresa_id
        AND f.feature_key = 'tenant_campaign_mutations_wave4_v1'
        AND f.enabled = true
    );
$function$;

REVOKE ALL ON FUNCTION public.orbit_campaign_direct_write_allowed(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orbit_campaign_direct_write_allowed(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.orbit_campaign_direct_write_allowed(uuid)
  IS 'RLS rollout gate: false requires audited campaign RPC writes for the tenant.';

-- Campaigns: preserve legacy access only outside the scoped-mutation rollout.
DROP POLICY IF EXISTS "PE admins can manage own empresa campaigns"
  ON public.orbit_campaigns;
CREATE POLICY "PE admins can manage own empresa campaigns"
ON public.orbit_campaigns FOR ALL TO authenticated
USING (
  public.orbit_campaign_direct_write_allowed(empresa_id)
  AND empresa_id = public.get_user_empresa_id(auth.uid())
  AND public.pe_user_is_orbit_admin(auth.uid())
)
WITH CHECK (
  public.orbit_campaign_direct_write_allowed(empresa_id)
  AND empresa_id = public.get_user_empresa_id(auth.uid())
  AND public.pe_user_is_orbit_admin(auth.uid())
);

DROP POLICY IF EXISTS "PE members can insert own empresa campaigns"
  ON public.orbit_campaigns;
CREATE POLICY "PE members can insert own empresa campaigns"
ON public.orbit_campaigns FOR INSERT TO authenticated
WITH CHECK (
  public.orbit_campaign_direct_write_allowed(empresa_id)
  AND empresa_id = public.get_user_empresa_id(auth.uid())
  AND public.pe_user_is_orbit_member(auth.uid())
);

DROP POLICY IF EXISTS "Super admin can manage all campaigns"
  ON public.orbit_campaigns;
CREATE POLICY "Super admin can manage all campaigns"
ON public.orbit_campaigns FOR ALL TO authenticated
USING (
  public.orbit_campaign_direct_write_allowed(empresa_id)
  AND public.has_role(auth.uid(), 'super_admin'::public.app_role)
)
WITH CHECK (
  public.orbit_campaign_direct_write_allowed(empresa_id)
  AND public.has_role(auth.uid(), 'super_admin'::public.app_role)
);

-- Recipients: population for the canary is atomic inside the SECURITY DEFINER
-- campaign RPC; direct browser writes are therefore unnecessary.
DROP POLICY IF EXISTS "Users can manage own empresa recipients"
  ON public.orbit_campaign_recipients;
CREATE POLICY "Users can manage own empresa recipients"
ON public.orbit_campaign_recipients FOR ALL TO authenticated
USING (
  public.orbit_campaign_direct_write_allowed(empresa_id)
  AND empresa_id = public.get_user_empresa_id(auth.uid())
)
WITH CHECK (
  public.orbit_campaign_direct_write_allowed(empresa_id)
  AND empresa_id = public.get_user_empresa_id(auth.uid())
);

DROP POLICY IF EXISTS "Super admin can manage all recipients"
  ON public.orbit_campaign_recipients;
CREATE POLICY "Super admin can manage all recipients"
ON public.orbit_campaign_recipients FOR ALL TO authenticated
USING (
  public.orbit_campaign_direct_write_allowed(empresa_id)
  AND public.has_role(auth.uid(), 'super_admin'::public.app_role)
)
WITH CHECK (
  public.orbit_campaign_direct_write_allowed(empresa_id)
  AND public.has_role(auth.uid(), 'super_admin'::public.app_role)
);

-- Approval rows are emitted by orbit_tenant_campaign_mutate_scoped for the
-- canary. Legacy direct inserts remain available only for tenants not rolled out.
DROP POLICY IF EXISTS "Users can insert own empresa approvals"
  ON public.orbit_campaign_approvals;
CREATE POLICY "Users can insert own empresa approvals"
ON public.orbit_campaign_approvals FOR INSERT TO authenticated
WITH CHECK (
  public.orbit_campaign_direct_write_allowed(empresa_id)
  AND empresa_id = public.get_user_empresa_id(auth.uid())
);

DROP POLICY IF EXISTS "Super admin can manage all approvals"
  ON public.orbit_campaign_approvals;
CREATE POLICY "Super admin can manage all approvals"
ON public.orbit_campaign_approvals FOR ALL TO authenticated
USING (
  public.orbit_campaign_direct_write_allowed(empresa_id)
  AND public.has_role(auth.uid(), 'super_admin'::public.app_role)
)
WITH CHECK (
  public.orbit_campaign_direct_write_allowed(empresa_id)
  AND public.has_role(auth.uid(), 'super_admin'::public.app_role)
);

COMMIT;
