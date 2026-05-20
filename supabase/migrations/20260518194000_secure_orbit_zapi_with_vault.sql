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
AS $$
  SELECT format(
    'orbit_zapi_%s_%s',
    p_kind,
    coalesce(replace(p_empresa_id::text, '-', ''), 'cfg_' || replace(p_config_id::text, '-', ''))
  );
$$;

DO $$
DECLARE
  v_row record;
  v_secret_id uuid;
  v_secret_name text;
  v_description text;
BEGIN
  FOR v_row IN
    SELECT id, empresa_id, token, client_token
    FROM public.orbit_zapi_config
  LOOP
    IF coalesce(btrim(v_row.token), '') <> '' THEN
      v_secret_name := public.get_orbit_zapi_secret_name('token', v_row.id, v_row.empresa_id);
      v_description := format('Z-API instance token for orbit_zapi_config %s', v_row.id);

      SELECT id
      INTO v_secret_id
      FROM vault.decrypted_secrets
      WHERE name = v_secret_name
      LIMIT 1;

      IF v_secret_id IS NULL THEN
        SELECT (vault.create_secret(v_row.token, v_secret_name, v_description)).id INTO v_secret_id;
      ELSE
        PERFORM vault.update_secret(v_secret_id, v_row.token, v_secret_name, v_description);
      END IF;

      UPDATE public.orbit_zapi_config
      SET token_secret_id = v_secret_id
      WHERE id = v_row.id;
    END IF;

    IF coalesce(btrim(v_row.client_token), '') <> '' THEN
      v_secret_name := public.get_orbit_zapi_secret_name('client_token', v_row.id, v_row.empresa_id);
      v_description := format('Z-API client token for orbit_zapi_config %s', v_row.id);

      SELECT id
      INTO v_secret_id
      FROM vault.decrypted_secrets
      WHERE name = v_secret_name
      LIMIT 1;

      IF v_secret_id IS NULL THEN
        SELECT (vault.create_secret(v_row.client_token, v_secret_name, v_description)).id INTO v_secret_id;
      ELSE
        PERFORM vault.update_secret(v_secret_id, v_row.client_token, v_secret_name, v_description);
      END IF;

      UPDATE public.orbit_zapi_config
      SET client_token_secret_id = v_secret_id
      WHERE id = v_row.id;
    END IF;
  END LOOP;
END;
$$;

ALTER TABLE public.orbit_zapi_config
  DROP COLUMN IF EXISTS token,
  DROP COLUMN IF EXISTS client_token;

CREATE OR REPLACE FUNCTION public._orbit_assert_zapi_admin_access(p_empresa_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_empresa_id IS NULL THEN
    RAISE EXCEPTION 'empresa_id é obrigatório';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'super_admin'::public.app_role
  ) THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.pe_users u ON u.id = p.id
    JOIN public.pe_roles r ON r.id = u.role_id
    WHERE p.id = auth.uid()
      AND p.empresa_id = p_empresa_id
      AND r.code IN ('ORG_ADMIN', 'ORG_MANAGER')
  ) THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'Não autorizado a gerenciar esta configuração';
END;
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
      'notificar_enviadas_por_mim', c.notificar_enviadas_por_mim,
      'ativo', c.ativo,
      'has_token', c.token_secret_id IS NOT NULL,
      'has_client_token', c.client_token_secret_id IS NOT NULL,
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
  SELECT *
  INTO v_config
  FROM public.orbit_zapi_config
  WHERE id = p_config_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_config.token_secret_id IS NOT NULL THEN
    SELECT decrypted_secret
    INTO v_token
    FROM vault.decrypted_secrets
    WHERE id = v_config.token_secret_id;
  END IF;

  IF v_config.client_token_secret_id IS NOT NULL THEN
    SELECT decrypted_secret
    INTO v_client_token
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
    'notificar_enviadas_por_mim', v_config.notificar_enviadas_por_mim,
    'ativo', v_config.ativo,
    'token', v_token,
    'client_token', v_client_token
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
  PERFORM public._orbit_assert_zapi_admin_access(p_empresa_id);

  SELECT id
  INTO v_config_id
  FROM public.orbit_zapi_config
  WHERE empresa_id = p_empresa_id
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
  SELECT id
  INTO v_config_id
  FROM public.orbit_zapi_config
  WHERE empresa_id = p_empresa_id
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
  PERFORM public._orbit_assert_zapi_admin_access(p_empresa_id);

  SELECT *
  INTO v_config
  FROM public.orbit_zapi_config
  WHERE empresa_id = p_empresa_id
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.orbit_zapi_config (
      empresa_id,
      nome_instancia,
      instance_id,
      numero_origem,
      webhook_url,
      notificar_enviadas_por_mim,
      ativo
    )
    VALUES (
      p_empresa_id,
      p_nome_instancia,
      p_instance_id,
      p_numero_origem,
      p_webhook_url,
      p_notificar_enviadas_por_mim,
      p_ativo
    )
    RETURNING *
    INTO v_config;
  ELSE
    UPDATE public.orbit_zapi_config
    SET
      nome_instancia = p_nome_instancia,
      instance_id = p_instance_id,
      numero_origem = p_numero_origem,
      webhook_url = p_webhook_url,
      notificar_enviadas_por_mim = p_notificar_enviadas_por_mim,
      ativo = p_ativo,
      updated_at = now()
    WHERE id = v_config.id
    RETURNING *
    INTO v_config;
  END IF;

  IF coalesce(btrim(p_token), '') <> '' THEN
    v_secret_name := public.get_orbit_zapi_secret_name('token', v_config.id, p_empresa_id);
    v_description := format('Z-API instance token for orbit_zapi_config %s', v_config.id);

    IF v_config.token_secret_id IS NULL THEN
      SELECT id
      INTO v_secret_id
      FROM vault.decrypted_secrets
      WHERE name = v_secret_name
      LIMIT 1;

      IF v_secret_id IS NULL THEN
        SELECT (vault.create_secret(p_token, v_secret_name, v_description)).id INTO v_secret_id;
      ELSE
        PERFORM vault.update_secret(v_secret_id, p_token, v_secret_name, v_description);
      END IF;
    ELSE
      v_secret_id := v_config.token_secret_id;
      PERFORM vault.update_secret(v_secret_id, p_token, v_secret_name, v_description);
    END IF;

    UPDATE public.orbit_zapi_config
    SET token_secret_id = v_secret_id, updated_at = now()
    WHERE id = v_config.id
    RETURNING *
    INTO v_config;
  END IF;

  IF coalesce(btrim(p_client_token), '') <> '' THEN
    v_secret_name := public.get_orbit_zapi_secret_name('client_token', v_config.id, p_empresa_id);
    v_description := format('Z-API client token for orbit_zapi_config %s', v_config.id);

    IF v_config.client_token_secret_id IS NULL THEN
      SELECT id
      INTO v_secret_id
      FROM vault.decrypted_secrets
      WHERE name = v_secret_name
      LIMIT 1;

      IF v_secret_id IS NULL THEN
        SELECT (vault.create_secret(p_client_token, v_secret_name, v_description)).id INTO v_secret_id;
      ELSE
        PERFORM vault.update_secret(v_secret_id, p_client_token, v_secret_name, v_description);
      END IF;
    ELSE
      v_secret_id := v_config.client_token_secret_id;
      PERFORM vault.update_secret(v_secret_id, p_client_token, v_secret_name, v_description);
    END IF;

    UPDATE public.orbit_zapi_config
    SET client_token_secret_id = v_secret_id, updated_at = now()
    WHERE id = v_config.id
    RETURNING *
    INTO v_config;
  END IF;

  RETURN public._build_orbit_zapi_public_response(v_config.id);
END;
$$;

REVOKE ALL ON FUNCTION public.get_orbit_zapi_config_public(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.upsert_orbit_zapi_config_secure(uuid, text, text, text, text, text, text, boolean, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_orbit_zapi_runtime_config(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_orbit_zapi_runtime_config_by_id(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._orbit_assert_zapi_admin_access(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._build_orbit_zapi_public_response(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._build_orbit_zapi_runtime_response(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_orbit_zapi_config_public(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_orbit_zapi_config_secure(uuid, text, text, text, text, text, text, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_orbit_zapi_runtime_config(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_orbit_zapi_runtime_config_by_id(uuid) TO service_role;
