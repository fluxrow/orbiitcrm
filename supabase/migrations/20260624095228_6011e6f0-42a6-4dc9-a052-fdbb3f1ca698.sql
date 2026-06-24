
CREATE OR REPLACE FUNCTION public.orbit_resend_has_api_key(p_empresa_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.orbit_resend_config c
    WHERE
      (p_empresa_id IS NULL AND c.empresa_id IS NULL OR c.empresa_id = p_empresa_id)
      AND c.api_key IS NOT NULL
      AND c.api_key <> ''
      AND (
        public.has_role(auth.uid(), 'super_admin'::public.app_role)
        OR public.get_user_empresa_id(auth.uid()) = p_empresa_id
      )
  )
$$;

REVOKE EXECUTE ON FUNCTION public.orbit_resend_has_api_key(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orbit_resend_has_api_key(uuid) TO authenticated, service_role;
