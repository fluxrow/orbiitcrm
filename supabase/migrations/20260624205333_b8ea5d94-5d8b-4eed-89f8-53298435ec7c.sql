
-- Fix set_active_empresa: super_admin must keep pe_users.organization_id = NULL
-- (chk_super_admin_org constraint). Without this, switching tenants from the
-- super admin fails with "violates check constraint chk_super_admin_org".
CREATE OR REPLACE FUNCTION public.set_active_empresa(p_empresa_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_org_id uuid;
  v_is_super boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  v_is_super := has_role(v_user_id, 'super_admin'::app_role);

  IF NOT v_is_super AND NOT EXISTS (
    SELECT 1 FROM public.user_empresa_memberships
    WHERE user_id = v_user_id AND empresa_id = p_empresa_id
  ) THEN
    RAISE EXCEPTION 'access_denied: user does not belong to empresa %', p_empresa_id;
  END IF;

  UPDATE public.profiles SET empresa_id = p_empresa_id WHERE id = v_user_id;

  -- Skip pe_users.organization_id update for super_admins
  -- (chk_super_admin_org requires it to stay NULL).
  IF NOT v_is_super THEN
    SELECT organization_id INTO v_org_id
    FROM public.pe_tenant_map
    WHERE empresa_id = p_empresa_id;

    IF v_org_id IS NOT NULL THEN
      UPDATE public.pe_users SET organization_id = v_org_id WHERE id = v_user_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('empresa_id', p_empresa_id, 'organization_id', v_org_id, 'is_super', v_is_super);
END;
$function$;
