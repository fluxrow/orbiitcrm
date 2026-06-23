CREATE OR REPLACE FUNCTION public.get_orbit_zapi_config_public(p_empresa_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config public.orbit_zapi_config%ROWTYPE;
BEGIN
  IF p_empresa_id IS NULL THEN
    RAISE EXCEPTION 'empresa_id_required';
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR (
      public.pe_user_is_orbit_admin(auth.uid())
      AND public.get_user_empresa_id(auth.uid()) = p_empresa_id
    )
  ) THEN
    RAISE EXCEPTION 'access_denied';
  END IF;

  SELECT * INTO v_config
  FROM public.orbit_zapi_config
  WHERE empresa_id = p_empresa_id
  ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
  LIMIT 1;

  IF v_config.id IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id', v_config.id,
    'empresa_id', v_config.empresa_id,
    'nome_instancia', v_config.nome_instancia,
    'instance_id', v_config.instance_id,
    'numero_origem', v_config.numero_origem,
    'webhook_url', v_config.webhook_url,
    'notificar_enviadas_por_mim', COALESCE(v_config.notificar_enviadas_por_mim, false),
    'ativo', COALESCE(v_config.ativo, false),
    'has_token', COALESCE(v_config.token, '') <> '',
    'has_client_token', COALESCE(v_config.client_token, '') <> '',
    'created_at', v_config.created_at,
    'updated_at', v_config.updated_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_orbit_zapi_config_secure(
  p_empresa_id uuid,
  p_nome_instancia text DEFAULT NULL,
  p_instance_id text DEFAULT NULL,
  p_token text DEFAULT NULL,
  p_client_token text DEFAULT NULL,
  p_numero_origem text DEFAULT NULL,
  p_webhook_url text DEFAULT NULL,
  p_notificar_enviadas_por_mim boolean DEFAULT false,
  p_ativo boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config_id uuid;
  v_existing public.orbit_zapi_config%ROWTYPE;
BEGIN
  IF p_empresa_id IS NULL THEN
    RAISE EXCEPTION 'empresa_id_required';
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT (
    public.has_role(auth.uid(), 'super_admin'::public.app_role)
    OR (
      public.pe_user_is_orbit_admin(auth.uid())
      AND public.get_user_empresa_id(auth.uid()) = p_empresa_id
    )
  ) THEN
    RAISE EXCEPTION 'access_denied';
  END IF;

  SELECT * INTO v_existing
  FROM public.orbit_zapi_config
  WHERE empresa_id = p_empresa_id
  ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
  LIMIT 1;

  IF v_existing.id IS NULL THEN
    INSERT INTO public.orbit_zapi_config (
      empresa_id,
      nome_instancia,
      instance_id,
      token,
      client_token,
      numero_origem,
      webhook_url,
      notificar_enviadas_por_mim,
      ativo,
      created_at,
      updated_at
    ) VALUES (
      p_empresa_id,
      NULLIF(trim(COALESCE(p_nome_instancia, '')), ''),
      NULLIF(trim(COALESCE(p_instance_id, '')), ''),
      NULLIF(trim(COALESCE(p_token, '')), ''),
      NULLIF(trim(COALESCE(p_client_token, '')), ''),
      NULLIF(trim(COALESCE(p_numero_origem, '')), ''),
      NULLIF(trim(COALESCE(p_webhook_url, '')), ''),
      COALESCE(p_notificar_enviadas_por_mim, false),
      COALESCE(p_ativo, false),
      now(),
      now()
    )
    RETURNING id INTO v_config_id;
  ELSE
    UPDATE public.orbit_zapi_config
    SET
      nome_instancia = NULLIF(trim(COALESCE(p_nome_instancia, '')), ''),
      instance_id = NULLIF(trim(COALESCE(p_instance_id, '')), ''),
      token = COALESCE(NULLIF(trim(COALESCE(p_token, '')), ''), token),
      client_token = COALESCE(NULLIF(trim(COALESCE(p_client_token, '')), ''), client_token),
      numero_origem = NULLIF(trim(COALESCE(p_numero_origem, '')), ''),
      webhook_url = NULLIF(trim(COALESCE(p_webhook_url, '')), ''),
      notificar_enviadas_por_mim = COALESCE(p_notificar_enviadas_por_mim, false),
      ativo = COALESCE(p_ativo, false),
      updated_at = now()
    WHERE id = v_existing.id
    RETURNING id INTO v_config_id;
  END IF;

  RETURN public.get_orbit_zapi_config_public(p_empresa_id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_orbit_zapi_config_public(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_orbit_zapi_config_secure(uuid, text, text, text, text, text, text, boolean, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_orbit_zapi_config_public(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_orbit_zapi_config_secure(uuid, text, text, text, text, text, text, boolean, boolean) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';