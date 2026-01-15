-- Allow anyone to check if super_admin exists (for setup page)
CREATE POLICY "Anyone can check if super_admin exists" 
ON public.user_roles 
FOR SELECT 
USING (role = 'super_admin');

-- Note: This only allows reading super_admin roles, not other sensitive roles
-- The has_role function already uses SECURITY DEFINER so it bypasses RLS