
-- 1) Tighten pe_roles SELECT: only active PE users (or super admin) can read
DROP POLICY IF EXISTS "Authenticated users can view roles" ON public.pe_roles;
DROP POLICY IF EXISTS "Active PE users can view roles" ON public.pe_roles;

CREATE POLICY "Active PE users can view roles"
ON public.pe_roles
FOR SELECT
TO authenticated
USING (
  public.pe_is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.pe_users u
    WHERE u.id = auth.uid() AND u.is_active = true
  )
);

REVOKE ALL ON public.pe_roles FROM anon;
GRANT SELECT ON public.pe_roles TO authenticated;
GRANT ALL ON public.pe_roles TO service_role;

-- 2) Reaffirm privileged-column guard on pe_users (idempotent redefinition)
CREATE OR REPLACE FUNCTION public.guard_pe_users_privileged_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := current_setting('role', true);
  v_changed boolean := false;
BEGIN
  IF NEW.is_super_admin IS DISTINCT FROM OLD.is_super_admin THEN v_changed := true; END IF;
  IF NEW.role_id IS DISTINCT FROM OLD.role_id THEN v_changed := true; END IF;
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN v_changed := true; END IF;

  IF v_changed THEN
    IF v_role = 'service_role' THEN
      RETURN NEW;
    END IF;
    IF auth.uid() IS NULL OR NOT public.pe_is_super_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Alteração de campos de privilégio (is_super_admin, role_id, organization_id) requer super_admin'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_pe_users_privileged_columns ON public.pe_users;
CREATE TRIGGER trg_guard_pe_users_privileged_columns
BEFORE UPDATE ON public.pe_users
FOR EACH ROW
EXECUTE FUNCTION public.guard_pe_users_privileged_columns();
