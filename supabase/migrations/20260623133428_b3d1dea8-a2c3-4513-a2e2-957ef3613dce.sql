ALTER TABLE public.orbit_zapi_config
  ADD COLUMN IF NOT EXISTS token_secret_id uuid,
  ADD COLUMN IF NOT EXISTS client_token_secret_id uuid;

CREATE OR REPLACE FUNCTION public.get_orbit_zapi_secret_name(
  p_kind text,
  p_config_id uuid,
  p_empresa_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT format(
    'orbit_zapi_%s_%s',
    p_kind,
    coalesce(replace(p_empresa_id::text, '-', ''), 'cfg_' || replace(p_config_id::text, '-', ''))
  );
$$;

CREATE OR REPLACE FUNCTION public._build_orbit_zapi_public_response(p_config_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN c.id IS NULL THEN NULL
    ELSE jsonb_build_object(
      'id', c.id,
      'empresa_id', c.empresa_id,
      'nome_instancia', c.nome_instancia,
      'instance_id', c.instance_id,
      'numero_origem', c.numero_origem,
      'webhook_url', c.webhook_url,
      'notificar_enviadas_por_mim', COALESCE(c.notificar_enviadas_por_mim, false),
      'ativo', COALESCE(c.ativo, false),
      'has_token', c.token_secret_id IS NOT NULL OR COALESCE(c.token, '') <> '',
      'has_client_token', c.client_token_secret_id IS NOT NULL OR COALESCE(c.client_token, '') <> '',
      'created_at', c.created_at,
      'updated_at', c.updated_at
    )
  END
  FROM public.orbit_zapi_config c
  WHERE c.id = p_config_id;
$$;

CREATE OR REPLACE FUNCTION public._build_orbit_zapi_runtime_response(p_config_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_config public.orbit_zapi_config%ROWTYPE;
  v_token text;
  v_client_token text;
BEGIN
  SELECT * INTO v_config
  FROM public.orbit_zapi_config
  WHERE id = p_config_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_config.token_secret_id IS NOT NULL THEN
    SELECT decrypted_secret INTO v_token
    FROM vault.decrypted_secrets
    WHERE id = v_config.token_secret_id;
  END IF;

  IF v_config.client_token_secret_id IS NOT NULL THEN
    SELECT decrypted_secret INTO v_client_token
    FROM vault.decrypted_secrets
    WHERE id = v_config.client_token_secret_id;
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
    'token', COALESCE(v_token, v_config.token),
    'client_token', COALESCE(v_client_token, v_config.client_token)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_orbit_zapi_config_public(p_empresa_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_config_id uuid;
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

  SELECT id INTO v_config_id
  FROM public.orbit_zapi_config
  WHERE empresa_id = p_empresa_id
  ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
  LIMIT 1;

  IF v_config_id IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN public._build_orbit_zapi_public_response(v_config_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_orbit_zapi_runtime_config(p_empresa_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_config_id uuid;
BEGIN
  SELECT id INTO v_config_id
  FROM public.orbit_zapi_config
  WHERE empresa_id = p_empresa_id
  ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
  LIMIT 1;

  IF v_config_id IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN public._build_orbit_zapi_runtime_response(v_config_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_orbit_zapi_runtime_config_by_id(p_config_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT public._build_orbit_zapi_runtime_response(p_config_id);
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
SET search_path = public, vault
AS $$
DECLARE
  v_config public.orbit_zapi_config%ROWTYPE;
  v_secret_id uuid;
  v_secret_name text;
  v_description text;
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

  IF NOT FOUND THEN
    INSERT INTO public.orbit_zapi_config (
      empresa_id,
      nome_instancia,
      instance_id,
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
      NULLIF(trim(COALESCE(p_numero_origem, '')), ''),
      NULLIF(trim(COALESCE(p_webhook_url, '')), ''),
      COALESCE(p_notificar_enviadas_por_mim, false),
      COALESCE(p_ativo, false),
      now(),
      now()
    )
    RETURNING * INTO v_config;
  ELSE
    UPDATE public.orbit_zapi_config
    SET
      nome_instancia = NULLIF(trim(COALESCE(p_nome_instancia, '')), ''),
      instance_id = NULLIF(trim(COALESCE(p_instance_id, '')), ''),
      numero_origem = NULLIF(trim(COALESCE(p_numero_origem, '')), ''),
      webhook_url = NULLIF(trim(COALESCE(p_webhook_url, '')), ''),
      notificar_enviadas_por_mim = COALESCE(p_notificar_enviadas_por_mim, false),
      ativo = COALESCE(p_ativo, false),
      updated_at = now()
    WHERE id = v_config.id
    RETURNING * INTO v_config;
  END IF;

  IF COALESCE(trim(p_token), '') <> '' THEN
    v_secret_name := public.get_orbit_zapi_secret_name('token', v_config.id, p_empresa_id);
    v_description := format('Z-API instance token for orbit_zapi_config %s', v_config.id);

    IF v_config.token_secret_id IS NULL THEN
      SELECT id INTO v_secret_id
      FROM vault.decrypted_secrets
      WHERE name = v_secret_name
      LIMIT 1;

      IF v_secret_id IS NULL THEN
        SELECT (vault.create_secret(trim(p_token), v_secret_name, v_description)).id INTO v_secret_id;
      ELSE
        PERFORM vault.update_secret(v_secret_id, trim(p_token), v_secret_name, v_description);
      END IF;
    ELSE
      v_secret_id := v_config.token_secret_id;
      PERFORM vault.update_secret(v_secret_id, trim(p_token), v_secret_name, v_description);
    END IF;

    UPDATE public.orbit_zapi_config
    SET token_secret_id = v_secret_id,
        token = trim(p_token),
        updated_at = now()
    WHERE id = v_config.id
    RETURNING * INTO v_config;
  END IF;

  IF COALESCE(trim(p_client_token), '') <> '' THEN
    v_secret_name := public.get_orbit_zapi_secret_name('client_token', v_config.id, p_empresa_id);
    v_description := format('Z-API client token for orbit_zapi_config %s', v_config.id);

    IF v_config.client_token_secret_id IS NULL THEN
      SELECT id INTO v_secret_id
      FROM vault.decrypted_secrets
      WHERE name = v_secret_name
      LIMIT 1;

      IF v_secret_id IS NULL THEN
        SELECT (vault.create_secret(trim(p_client_token), v_secret_name, v_description)).id INTO v_secret_id;
      ELSE
        PERFORM vault.update_secret(v_secret_id, trim(p_client_token), v_secret_name, v_description);
      END IF;
    ELSE
      v_secret_id := v_config.client_token_secret_id;
      PERFORM vault.update_secret(v_secret_id, trim(p_client_token), v_secret_name, v_description);
    END IF;

    UPDATE public.orbit_zapi_config
    SET client_token_secret_id = v_secret_id,
        client_token = trim(p_client_token),
        updated_at = now()
    WHERE id = v_config.id
    RETURNING * INTO v_config;
  END IF;

  RETURN public._build_orbit_zapi_public_response(v_config.id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_orbit_zapi_config_public(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_orbit_zapi_config_secure(uuid, text, text, text, text, text, text, boolean, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_orbit_zapi_runtime_config(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_orbit_zapi_runtime_config_by_id(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._build_orbit_zapi_public_response(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._build_orbit_zapi_runtime_response(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_orbit_zapi_config_public(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_orbit_zapi_config_secure(uuid, text, text, text, text, text, text, boolean, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_orbit_zapi_runtime_config(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_orbit_zapi_runtime_config_by_id(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public._build_orbit_zapi_public_response(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public._build_orbit_zapi_runtime_response(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';