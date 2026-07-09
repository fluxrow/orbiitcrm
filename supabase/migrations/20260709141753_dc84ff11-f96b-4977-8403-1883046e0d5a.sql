
-- Restrictive policies to block self-assignment on user_roles (defense-in-depth).
-- Even super_admins cannot grant a role to themselves; another admin must do it.

DROP POLICY IF EXISTS "Block self role assignment (insert)" ON public.user_roles;
DROP POLICY IF EXISTS "Block self role assignment (update)" ON public.user_roles;

CREATE POLICY "Block self role assignment (insert)"
ON public.user_roles
AS RESTRICTIVE
FOR INSERT
TO authenticated
WITH CHECK (user_id <> auth.uid());

CREATE POLICY "Block self role assignment (update)"
ON public.user_roles
AS RESTRICTIVE
FOR UPDATE
TO authenticated
USING (user_id <> auth.uid())
WITH CHECK (user_id <> auth.uid());
