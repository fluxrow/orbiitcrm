
CREATE TABLE public.user_empresa_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES public.orbit_empresas(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, empresa_id)
);

CREATE INDEX idx_user_empresa_memberships_user ON public.user_empresa_memberships(user_id);
CREATE INDEX idx_user_empresa_memberships_empresa ON public.user_empresa_memberships(empresa_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_empresa_memberships TO authenticated;
GRANT ALL ON public.user_empresa_memberships TO service_role;

ALTER TABLE public.user_empresa_memberships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own memberships"
  ON public.user_empresa_memberships FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admin manage all memberships"
  ON public.user_empresa_memberships FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- Backfill from profiles
INSERT INTO public.user_empresa_memberships (user_id, empresa_id, role)
SELECT p.id, p.empresa_id, 'member'
FROM public.profiles p
WHERE p.empresa_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.orbit_empresas e WHERE e.id = p.empresa_id)
ON CONFLICT (user_id, empresa_id) DO NOTHING;

-- Backfill from pe_users + pe_tenant_map
INSERT INTO public.user_empresa_memberships (user_id, empresa_id, role)
SELECT u.id, tm.empresa_id, COALESCE(r.code, 'member')
FROM public.pe_users u
JOIN public.pe_tenant_map tm ON tm.organization_id = u.organization_id
LEFT JOIN public.pe_roles r ON r.id = u.role_id
WHERE u.organization_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.orbit_empresas e WHERE e.id = tm.empresa_id)
ON CONFLICT (user_id, empresa_id) DO NOTHING;

-- RPC to switch active empresa (updates profiles.empresa_id + pe_users.organization_id)
CREATE OR REPLACE FUNCTION public.set_active_empresa(p_empresa_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_org_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_empresa_memberships
    WHERE user_id = v_user_id AND empresa_id = p_empresa_id
  ) AND NOT has_role(v_user_id, 'super_admin'::app_role) THEN
    RAISE EXCEPTION 'access_denied: user does not belong to empresa %', p_empresa_id;
  END IF;

  UPDATE public.profiles SET empresa_id = p_empresa_id WHERE id = v_user_id;

  SELECT organization_id INTO v_org_id
  FROM public.pe_tenant_map
  WHERE empresa_id = p_empresa_id;

  IF v_org_id IS NOT NULL THEN
    UPDATE public.pe_users SET organization_id = v_org_id WHERE id = v_user_id;
  END IF;

  RETURN jsonb_build_object('empresa_id', p_empresa_id, 'organization_id', v_org_id);
END;
$$;

-- RPC to list user's empresas (with nome + slug) — bypasses orbit_empresas RLS so picker can render
CREATE OR REPLACE FUNCTION public.get_my_empresas()
RETURNS TABLE(empresa_id uuid, nome text, slug text, role text, is_active boolean)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.empresa_id,
    e.nome,
    e.slug,
    m.role,
    (e.id = (SELECT empresa_id FROM public.profiles WHERE id = auth.uid())) AS is_active
  FROM public.user_empresa_memberships m
  JOIN public.orbit_empresas e ON e.id = m.empresa_id
  WHERE m.user_id = auth.uid()
  ORDER BY e.nome;
$$;
