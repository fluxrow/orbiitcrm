
-- 1) Column-level UPDATE grants: authenticated can only update operational columns.
REVOKE UPDATE ON public.pe_users FROM authenticated;
GRANT UPDATE (
  full_name, phone, whatsapp, cargo, avatar_url,
  email_signature, signature_image_url, signature_image_path,
  use_personal_signature, is_active, updated_at
) ON public.pe_users TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.pe_users TO authenticated;
GRANT ALL ON public.pe_users TO service_role;

-- 2) Tighten the org-admin UPDATE policy with an explicit WITH CHECK that forbids
--    escalation: even though column grants block it, the policy also documents intent.
DROP POLICY IF EXISTS "Org admin can update same org users" ON public.pe_users;
CREATE POLICY "Org admin can update same org users"
ON public.pe_users
FOR UPDATE
TO authenticated
USING (
  organization_id = pe_get_user_org_id(auth.uid())
  AND pe_user_is_org_admin(auth.uid(), organization_id)
)
WITH CHECK (
  organization_id = pe_get_user_org_id(auth.uid())
  AND pe_user_is_org_admin(auth.uid(), organization_id)
  AND is_super_admin = false
);

-- 3) Super admin RPC: change a user's role.
CREATE OR REPLACE FUNCTION public.pe_super_admin_update_user_role(
  target_user_id uuid,
  new_role_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.pe_is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas super admins podem alterar o papel de usuários'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.pe_users
  SET role_id = new_role_id, updated_at = now()
  WHERE id = target_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.pe_super_admin_update_user_role(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pe_super_admin_update_user_role(uuid, uuid) TO authenticated, service_role;

-- 4) Super admin RPC: set privileged columns atomically.
CREATE OR REPLACE FUNCTION public.pe_super_admin_set_user_privileges(
  target_user_id uuid,
  new_role_id uuid DEFAULT NULL,
  new_organization_id uuid DEFAULT NULL,
  new_is_super_admin boolean DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.pe_is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas super admins podem alterar privilégios de usuários'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.pe_users
  SET
    role_id         = COALESCE(new_role_id, role_id),
    organization_id = COALESCE(new_organization_id, organization_id),
    is_super_admin  = COALESCE(new_is_super_admin, is_super_admin),
    updated_at      = now()
  WHERE id = target_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.pe_super_admin_set_user_privileges(uuid, uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pe_super_admin_set_user_privileges(uuid, uuid, uuid, boolean) TO authenticated, service_role;
