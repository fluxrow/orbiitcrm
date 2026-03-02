
-- 1) Backfill: sync existing pe_users roles to user_roles
INSERT INTO user_roles (user_id, role)
SELECT pu.id,
  CASE
    WHEN pr.code IN ('ORG_ADMIN', 'ORG_MANAGER') THEN 'admin'::app_role
    WHEN pr.code IN ('ORG_SALES', 'ORG_SDR') THEN 'vendedor'::app_role
    ELSE 'visualizador'::app_role
  END
FROM pe_users pu
JOIN pe_roles pr ON pr.id = pu.role_id
WHERE pu.role_id IS NOT NULL
  AND NOT pu.is_super_admin
ON CONFLICT (user_id, role) DO NOTHING;

-- 2) Create trigger function to auto-sync pe_users -> user_roles
CREATE OR REPLACE FUNCTION public.sync_pe_role_to_user_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_new_role app_role;
  v_role_code text;
BEGIN
  -- Skip super admins
  IF NEW.is_super_admin THEN
    RETURN NEW;
  END IF;

  -- If no role_id, nothing to sync
  IF NEW.role_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get role code
  SELECT code INTO v_role_code FROM pe_roles WHERE id = NEW.role_id;
  IF v_role_code IS NULL THEN
    RETURN NEW;
  END IF;

  -- Map PE role to app_role
  v_new_role := CASE
    WHEN v_role_code IN ('ORG_ADMIN', 'ORG_MANAGER') THEN 'admin'::app_role
    WHEN v_role_code IN ('ORG_SALES', 'ORG_SDR') THEN 'vendedor'::app_role
    ELSE 'visualizador'::app_role
  END;

  -- Delete old role (if any) and insert new one
  DELETE FROM user_roles WHERE user_id = NEW.id;
  INSERT INTO user_roles (user_id, role) VALUES (NEW.id, v_new_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;

-- 3) Attach trigger on pe_users for INSERT and UPDATE
CREATE TRIGGER trg_sync_pe_role_to_user_roles
AFTER INSERT OR UPDATE OF role_id ON pe_users
FOR EACH ROW
EXECUTE FUNCTION sync_pe_role_to_user_roles();
