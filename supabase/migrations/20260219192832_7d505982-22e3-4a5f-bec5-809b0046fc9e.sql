-- Drop the overly strict constraint and replace with a more flexible one
-- Super admins must NOT have an org. Non-super-admins CAN have null org (unassigned state from trigger).
ALTER TABLE public.pe_users DROP CONSTRAINT IF EXISTS chk_super_admin_org;

ALTER TABLE public.pe_users ADD CONSTRAINT chk_super_admin_org
  CHECK (
    (is_super_admin = true AND organization_id IS NULL)
    OR
    (is_super_admin = false)
  );