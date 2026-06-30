
-- user_roles: restrictive policies to ensure only super_admin can write
CREATE POLICY "Only super admin can insert roles"
ON public.user_roles AS RESTRICTIVE
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Only super admin can update roles"
ON public.user_roles AS RESTRICTIVE
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Only super admin can delete roles"
ON public.user_roles AS RESTRICTIVE
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role));

-- orbit_handoffs: restrictive policies — writes only via super_admin/service_role
CREATE POLICY "Only super admin can insert handoffs"
ON public.orbit_handoffs AS RESTRICTIVE
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Only super admin can update handoffs"
ON public.orbit_handoffs AS RESTRICTIVE
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Only super admin can delete handoffs"
ON public.orbit_handoffs AS RESTRICTIVE
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'::app_role));
