
-- =============================================
-- ORBIT PROSPECTING ENGINE - BASE LAYER
-- =============================================

-- 1. ORGANIZATIONS TABLE
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  legal_name text,
  cnpj text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_organizations_cnpj ON public.organizations (cnpj) WHERE cnpj IS NOT NULL;
CREATE INDEX idx_organizations_status ON public.organizations (status);

CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- 2. PE_ROLES TABLE
CREATE TABLE public.pe_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pe_roles ENABLE ROW LEVEL SECURITY;

-- Seed roles
INSERT INTO public.pe_roles (code, name) VALUES
  ('ORG_ADMIN', 'Administrador'),
  ('ORG_MANAGER', 'Gerente'),
  ('ORG_SALES', 'Vendedor'),
  ('ORG_SDR', 'SDR'),
  ('ORG_VIEWER', 'Visualizador');

-- 3. PE_USERS TABLE
CREATE TABLE public.pe_users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id),
  role_id uuid REFERENCES public.pe_roles(id),
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  is_active boolean NOT NULL DEFAULT true,
  is_super_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_super_admin_org CHECK (
    (is_super_admin = true AND organization_id IS NULL) OR
    (is_super_admin = false AND organization_id IS NOT NULL)
  ),
  CONSTRAINT chk_super_admin_role CHECK (
    (is_super_admin = true AND role_id IS NULL) OR
    (is_super_admin = false AND role_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX idx_pe_users_email ON public.pe_users (lower(email));
CREATE INDEX idx_pe_users_organization_id ON public.pe_users (organization_id);
CREATE INDEX idx_pe_users_role_id ON public.pe_users (role_id);
CREATE INDEX idx_pe_users_is_super_admin ON public.pe_users (is_super_admin);
CREATE INDEX idx_pe_users_is_active ON public.pe_users (is_active);

CREATE TRIGGER update_pe_users_updated_at
  BEFORE UPDATE ON public.pe_users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.pe_users ENABLE ROW LEVEL SECURITY;

-- 4. PE_INVITATIONS TABLE
CREATE TABLE public.pe_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  email text NOT NULL,
  role_id uuid NOT NULL REFERENCES public.pe_roles(id),
  token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL,
  invited_by_user_id uuid NOT NULL REFERENCES public.pe_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pe_invitations_org ON public.pe_invitations (organization_id);
CREATE INDEX idx_pe_invitations_email ON public.pe_invitations (email);
CREATE INDEX idx_pe_invitations_status ON public.pe_invitations (status);

CREATE TRIGGER update_pe_invitations_updated_at
  BEFORE UPDATE ON public.pe_invitations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.pe_invitations ENABLE ROW LEVEL SECURITY;

-- 5. PE_AUDIT_LOG TABLE
CREATE TABLE public.pe_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id),
  actor_user_id uuid REFERENCES public.pe_users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pe_audit_log_org ON public.pe_audit_log (organization_id);
CREATE INDEX idx_pe_audit_log_created_at ON public.pe_audit_log (created_at);

ALTER TABLE public.pe_audit_log ENABLE ROW LEVEL SECURITY;

-- =============================================
-- HELPER FUNCTIONS (SECURITY DEFINER)
-- =============================================

CREATE OR REPLACE FUNCTION public.pe_is_super_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pe_users
    WHERE id = p_user_id AND is_super_admin = true
  )
$$;

CREATE OR REPLACE FUNCTION public.pe_get_user_org_id(p_user_id uuid)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT organization_id FROM public.pe_users WHERE id = p_user_id
$$;

CREATE OR REPLACE FUNCTION public.pe_get_user_role_code(p_user_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.code FROM public.pe_users u
  JOIN public.pe_roles r ON r.id = u.role_id
  WHERE u.id = p_user_id
$$;

CREATE OR REPLACE FUNCTION public.pe_user_is_org_admin(p_user_id uuid, p_org_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pe_users u
    JOIN public.pe_roles r ON r.id = u.role_id
    WHERE u.id = p_user_id
      AND u.organization_id = p_org_id
      AND r.code = 'ORG_ADMIN'
  )
$$;

-- =============================================
-- TRIGGER: auto-create pe_users on auth signup
-- =============================================

CREATE OR REPLACE FUNCTION public.handle_new_user_pe()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.pe_users (id, email, full_name, is_super_admin)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'nome', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    false
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- NOTE: This trigger will fire AFTER the existing handle_new_user trigger
CREATE TRIGGER on_auth_user_created_pe
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_pe();

-- =============================================
-- RLS POLICIES
-- =============================================

-- ORGANIZATIONS
CREATE POLICY "Super admin full access organizations"
  ON public.organizations FOR ALL
  USING (public.pe_is_super_admin(auth.uid()));

CREATE POLICY "Org members can view own org"
  ON public.organizations FOR SELECT
  USING (id = public.pe_get_user_org_id(auth.uid()));

-- PE_ROLES
CREATE POLICY "Authenticated users can view roles"
  ON public.pe_roles FOR SELECT
  TO authenticated
  USING (true);

-- PE_USERS
CREATE POLICY "Super admin full access pe_users"
  ON public.pe_users FOR ALL
  USING (public.pe_is_super_admin(auth.uid()));

CREATE POLICY "Org members can view same org users"
  ON public.pe_users FOR SELECT
  USING (organization_id = public.pe_get_user_org_id(auth.uid()));

CREATE POLICY "User can view own record"
  ON public.pe_users FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "Org admin can update same org users"
  ON public.pe_users FOR UPDATE
  USING (
    organization_id = public.pe_get_user_org_id(auth.uid())
    AND public.pe_user_is_org_admin(auth.uid(), organization_id)
  );

-- PE_INVITATIONS
CREATE POLICY "Super admin full access invitations"
  ON public.pe_invitations FOR ALL
  USING (public.pe_is_super_admin(auth.uid()));

CREATE POLICY "Org admin can view org invitations"
  ON public.pe_invitations FOR SELECT
  USING (public.pe_user_is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Org admin can create org invitations"
  ON public.pe_invitations FOR INSERT
  WITH CHECK (public.pe_user_is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Org admin can update org invitations"
  ON public.pe_invitations FOR UPDATE
  USING (public.pe_user_is_org_admin(auth.uid(), organization_id));

-- PE_AUDIT_LOG
CREATE POLICY "Super admin full access audit_log"
  ON public.pe_audit_log FOR ALL
  USING (public.pe_is_super_admin(auth.uid()));

CREATE POLICY "Org admin can view org audit_log"
  ON public.pe_audit_log FOR SELECT
  USING (public.pe_user_is_org_admin(auth.uid(), organization_id));

CREATE POLICY "Org members can insert audit_log"
  ON public.pe_audit_log FOR INSERT
  WITH CHECK (
    organization_id = public.pe_get_user_org_id(auth.uid())
    OR public.pe_is_super_admin(auth.uid())
  );

-- =============================================
-- SEED SUPER ADMIN
-- =============================================

INSERT INTO public.pe_users (id, email, full_name, is_super_admin, organization_id, role_id)
SELECT ur.user_id, COALESCE(p.email, ''), COALESCE(p.nome, 'Super Admin'), true, NULL, NULL
FROM public.user_roles ur
LEFT JOIN public.profiles p ON p.id = ur.user_id
WHERE ur.role = 'super_admin'
ON CONFLICT (id) DO UPDATE SET is_super_admin = true, organization_id = NULL, role_id = NULL;
