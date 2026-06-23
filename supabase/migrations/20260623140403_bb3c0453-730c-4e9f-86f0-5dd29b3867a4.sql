
-- Secure RPC to switch the user's active empresa to a tenant they have membership in.
-- Called by the frontend whenever the URL tenant changes, so that profile.empresa_id
-- (which drives RLS via get_user_empresa_id) always reflects the tenant the user
-- is actively viewing. Prevents cross-tenant leaks when an owner has access to
-- multiple companies.

CREATE OR REPLACE FUNCTION public.switch_active_empresa(p_empresa_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_allowed boolean := false;
  v_current uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;
  IF p_empresa_id IS NULL THEN
    RAISE EXCEPTION 'empresa_id_required';
  END IF;

  -- Super admin can switch anywhere
  IF public.has_role(v_uid, 'super_admin'::public.app_role) THEN
    v_allowed := true;
  END IF;

  -- Owner of the empresa via profile
  IF NOT v_allowed THEN
    SELECT empresa_id INTO v_current FROM public.profiles WHERE id = v_uid;
    IF v_current = p_empresa_id THEN
      v_allowed := true;
    END IF;
  END IF;

  -- Membership check
  IF NOT v_allowed THEN
    IF EXISTS (
      SELECT 1 FROM public.user_empresa_memberships
      WHERE user_id = v_uid AND empresa_id = p_empresa_id
    ) THEN
      v_allowed := true;
    END IF;
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'access_denied: user has no membership in this empresa';
  END IF;

  UPDATE public.profiles
  SET empresa_id = p_empresa_id,
      updated_at = now()
  WHERE id = v_uid;

  RETURN jsonb_build_object('empresa_id', p_empresa_id, 'switched', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.switch_active_empresa(uuid) TO authenticated;
