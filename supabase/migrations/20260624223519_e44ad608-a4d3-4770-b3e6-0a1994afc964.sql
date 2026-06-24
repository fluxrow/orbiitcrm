CREATE OR REPLACE FUNCTION public.orbit_zapi_connection_status(_empresa_id uuid)
RETURNS TABLE (
  status text,
  instance_id text,
  last_disconnect_at timestamptz,
  last_receive_at timestamptz,
  disconnect_reason text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _has_access boolean;
  _instance_id text;
  _last_disc_at timestamptz;
  _last_disc_err text;
  _last_recv timestamptz;
  _status text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND empresa_id = _empresa_id
    UNION ALL
    SELECT 1 FROM public.user_empresa_memberships WHERE user_id = auth.uid() AND empresa_id = _empresa_id
  ) INTO _has_access;

  IF NOT _has_access THEN
    RETURN;
  END IF;

  SELECT z.instance_id INTO _instance_id
  FROM public.orbit_zapi_config z
  WHERE z.empresa_id = _empresa_id AND z.ativo = true
  LIMIT 1;

  IF _instance_id IS NULL THEN
    RETURN QUERY SELECT 'not_configured'::text, NULL::text, NULL::timestamptz, NULL::timestamptz, NULL::text;
    RETURN;
  END IF;

  SELECT w.created_at, w.payload->>'error'
  INTO _last_disc_at, _last_disc_err
  FROM public.orbit_webhook_logs w
  WHERE w.instance_id = _instance_id AND w.event_type = 'on-disconnect'
  ORDER BY w.created_at DESC
  LIMIT 1;

  SELECT MAX(w.created_at) INTO _last_recv
  FROM public.orbit_webhook_logs w
  WHERE w.instance_id = _instance_id AND w.event_type = 'on-receive';

  IF _last_disc_at IS NOT NULL
     AND (_last_recv IS NULL OR _last_disc_at > _last_recv) THEN
    _status := 'disconnected';
  ELSE
    _status := 'connected';
  END IF;

  RETURN QUERY SELECT _status, _instance_id, _last_disc_at, _last_recv, _last_disc_err;
END;
$$;

GRANT EXECUTE ON FUNCTION public.orbit_zapi_connection_status(uuid) TO authenticated;