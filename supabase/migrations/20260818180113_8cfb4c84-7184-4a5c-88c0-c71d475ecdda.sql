ALTER TABLE public.orbit_zapi_config
  ADD COLUMN IF NOT EXISTS canary_mode_enabled boolean NOT NULL DEFAULT false;

UPDATE public.orbit_zapi_config
SET canary_mode_enabled = true, updated_at = now()
WHERE empresa_id = '36f26579-66ad-4ef1-9788-141e4c727232';

CREATE OR REPLACE FUNCTION public._build_orbit_zapi_runtime_response(p_config_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
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
    'client_token', COALESCE(v_client_token, v_config.client_token),
    'envio_real_liberado', COALESCE(v_config.envio_real_liberado, false),
    'canary_mode_enabled', COALESCE(v_config.canary_mode_enabled, false),
    'canary_phone_numbers', COALESCE(to_jsonb(v_config.canary_phone_numbers), '[]'::jsonb)
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public._build_orbit_zapi_public_response(p_config_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
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
      'canary_mode_enabled', COALESCE(c.canary_mode_enabled, false),
      'canary_phone_numbers', COALESCE(to_jsonb(c.canary_phone_numbers), '[]'::jsonb),
      'has_token', c.token_secret_id IS NOT NULL OR COALESCE(c.token, '') <> '',
      'has_client_token', c.client_token_secret_id IS NOT NULL OR COALESCE(c.client_token, '') <> '',
      'created_at', c.created_at,
      'updated_at', c.updated_at
    )
  END
  FROM public.orbit_zapi_config c
  WHERE c.id = p_config_id;
$function$;