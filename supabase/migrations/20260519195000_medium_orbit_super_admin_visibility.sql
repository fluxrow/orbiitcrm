DROP POLICY IF EXISTS "Anyone can check if super_admin exists" ON public.user_roles;

CREATE OR REPLACE FUNCTION public.super_admin_exists()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE role = 'super_admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.super_admin_exists() TO authenticated, anon;
