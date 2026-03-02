
-- 1) Helper: is orbit admin (ORG_ADMIN or ORG_MANAGER)
CREATE OR REPLACE FUNCTION public.pe_user_is_orbit_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pe_users u
    JOIN public.pe_roles r ON r.id = u.role_id
    WHERE u.id = p_user_id
      AND r.code IN ('ORG_ADMIN', 'ORG_MANAGER')
  )
$$;

-- 2) Helper: is orbit member (any active role except VIEWER)
CREATE OR REPLACE FUNCTION public.pe_user_is_orbit_member(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.pe_users u
    JOIN public.pe_roles r ON r.id = u.role_id
    WHERE u.id = p_user_id
      AND r.code IN ('ORG_ADMIN', 'ORG_MANAGER', 'ORG_SALES', 'ORG_SDR')
  )
$$;

-- 3) orbit_message_templates: replace legacy policy
DROP POLICY IF EXISTS "Admins can manage own empresa templates" ON public.orbit_message_templates;

CREATE POLICY "PE members can manage own empresa templates"
ON public.orbit_message_templates
FOR ALL
USING (
  empresa_id = get_user_empresa_id(auth.uid())
  AND pe_user_is_orbit_member(auth.uid())
);

-- 4) orbit_campaigns: replace open policy with role-based
DROP POLICY IF EXISTS "Users can manage own empresa campaigns" ON public.orbit_campaigns;

CREATE POLICY "PE admins can manage own empresa campaigns"
ON public.orbit_campaigns
FOR ALL
USING (
  empresa_id = get_user_empresa_id(auth.uid())
  AND pe_user_is_orbit_admin(auth.uid())
);

CREATE POLICY "PE members can insert own empresa campaigns"
ON public.orbit_campaigns
FOR INSERT
WITH CHECK (
  empresa_id = get_user_empresa_id(auth.uid())
  AND pe_user_is_orbit_member(auth.uid())
);

-- 5) orbit_prospects: replace open policies with role-based
DROP POLICY IF EXISTS "Users can insert own empresa prospects" ON public.orbit_prospects;
DROP POLICY IF EXISTS "Users can update own empresa prospects" ON public.orbit_prospects;
DROP POLICY IF EXISTS "Users can delete own empresa prospects" ON public.orbit_prospects;

CREATE POLICY "PE members can insert own empresa prospects"
ON public.orbit_prospects
FOR INSERT
WITH CHECK (
  empresa_id = get_user_empresa_id(auth.uid())
  AND pe_user_is_orbit_member(auth.uid())
);

CREATE POLICY "PE members can update own empresa prospects"
ON public.orbit_prospects
FOR UPDATE
USING (
  empresa_id = get_user_empresa_id(auth.uid())
  AND pe_user_is_orbit_member(auth.uid())
);

CREATE POLICY "PE members can delete own empresa prospects"
ON public.orbit_prospects
FOR DELETE
USING (
  empresa_id = get_user_empresa_id(auth.uid())
  AND pe_user_is_orbit_member(auth.uid())
);
