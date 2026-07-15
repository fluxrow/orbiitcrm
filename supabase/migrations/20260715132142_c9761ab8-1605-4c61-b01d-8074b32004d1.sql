-- Fix Advisor/tenant access helpers for current RBAC model.
CREATE OR REPLACE FUNCTION public.user_has_empresa_access(_empresa_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(public.has_role(auth.uid(), 'super_admin'::public.app_role), false)
    OR COALESCE(public.pe_is_super_admin(auth.uid()), false)
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.empresa_id = _empresa_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_empresa_memberships m
      WHERE m.user_id = auth.uid()
        AND m.empresa_id = _empresa_id
    );
$$;

REVOKE EXECUTE ON FUNCTION public.user_has_empresa_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_has_empresa_access(uuid) TO authenticated, service_role;

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

  IF public.has_role(v_uid, 'super_admin'::public.app_role)
     OR public.pe_is_super_admin(v_uid) THEN
    v_allowed := true;
  END IF;

  IF NOT v_allowed THEN
    SELECT empresa_id INTO v_current FROM public.profiles WHERE id = v_uid;
    IF v_current = p_empresa_id THEN
      v_allowed := true;
    END IF;
  END IF;

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
  SET empresa_id = p_empresa_id, updated_at = now()
  WHERE id = v_uid;

  RETURN jsonb_build_object('empresa_id', p_empresa_id, 'switched', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.switch_active_empresa(uuid) TO authenticated;