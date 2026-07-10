
-- =========================================================
-- CRÍTICO 1: profiles.empresa_id não pode ser trocado pelo próprio usuário
-- =========================================================

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
USING (id = auth.uid())
WITH CHECK (
  id = auth.uid()
  AND empresa_id IS NOT DISTINCT FROM (SELECT p.empresa_id FROM public.profiles p WHERE p.id = auth.uid())
);

-- Trigger defense-in-depth: bloqueia mudança de empresa_id salvo super_admin/service_role
CREATE OR REPLACE FUNCTION public.guard_profiles_privileged_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text := current_setting('role', true);
BEGIN
  IF NEW.empresa_id IS DISTINCT FROM OLD.empresa_id THEN
    IF v_role = 'service_role' THEN
      RETURN NEW;
    END IF;
    IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'super_admin'::app_role) THEN
      RAISE EXCEPTION 'Alteração de empresa_id não permitida' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profiles_privileged_columns ON public.profiles;
CREATE TRIGGER trg_guard_profiles_privileged_columns
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profiles_privileged_columns();

-- =========================================================
-- CRÍTICO 2: pe_users — org_admin não pode elevar privilégios
-- =========================================================

-- Reescreve a policy com WITH CHECK que trava is_super_admin/role_id/organization_id
DROP POLICY IF EXISTS "Org admin can update same org users" ON public.pe_users;
CREATE POLICY "Org admin can update same org users"
ON public.pe_users
FOR UPDATE
USING (
  organization_id = pe_get_user_org_id(auth.uid())
  AND pe_user_is_org_admin(auth.uid(), organization_id)
)
WITH CHECK (
  organization_id = pe_get_user_org_id(auth.uid())
  AND pe_user_is_org_admin(auth.uid(), organization_id)
);

-- Trigger que bloqueia alteração de colunas sensíveis por qualquer caminho
-- exceto super_admin real ou service_role
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
      RAISE EXCEPTION 'Alteração de campos de privilégio (is_super_admin, role_id, organization_id) requer super_admin' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_pe_users_privileged_columns ON public.pe_users;
CREATE TRIGGER trg_guard_pe_users_privileged_columns
BEFORE UPDATE ON public.pe_users
FOR EACH ROW EXECUTE FUNCTION public.guard_pe_users_privileged_columns();
