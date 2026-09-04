-- Bullink: self-service agent training permission.
--
-- This is intentionally narrower than tenant administration. The explicit
-- grant only authorizes the already-governed training workflow (draft,
-- sandbox reviews, publish and rollback). It does not authorize WhatsApp,
-- campaign, payment or general AI configuration mutations.
BEGIN;

ALTER TABLE public.orbit_tenant_user_permissions
  DROP CONSTRAINT IF EXISTS orbit_tenant_user_permissions_permission_key_check;

ALTER TABLE public.orbit_tenant_user_permissions
  ADD CONSTRAINT orbit_tenant_user_permissions_permission_key_check
  CHECK (permission_key IN (
    'campaign_create',
    'campaign_edit',
    'campaign_submit_review',
    'campaign_approve',
    'campaign_dispatch',
    'agent_training_manage'
  ));

CREATE OR REPLACE FUNCTION public.orbit_agent_training_is_admin(
  p_user_id uuid,
  p_empresa_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
  SELECT p_user_id IS NOT NULL
    AND p_empresa_id IS NOT NULL
    AND public.user_has_empresa_access(p_empresa_id)
    AND (
      public.has_role(p_user_id, 'super_admin'::public.app_role)
      OR public.pe_is_super_admin(p_user_id)
      OR public.pe_user_is_orbit_admin(p_user_id)
      OR EXISTS (
        SELECT 1
        FROM public.user_empresa_memberships m
        WHERE m.user_id = p_user_id
          AND m.empresa_id = p_empresa_id
          AND m.role = 'admin'
      )
      OR EXISTS (
        SELECT 1
        FROM public.orbit_tenant_user_permissions p
        WHERE p.user_id = p_user_id
          AND p.empresa_id = p_empresa_id
          AND p.permission_key = 'agent_training_manage'
          AND p.revoked_at IS NULL
      )
    );
$function$;

REVOKE ALL ON FUNCTION public.orbit_agent_training_is_admin(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.orbit_agent_training_is_admin(uuid, uuid)
  TO service_role;

COMMIT;
