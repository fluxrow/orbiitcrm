-- Trava global por tenant para envio real via Z-API.
-- Nada de send-text / send-image / send-audio / send-document / send-video
-- em produção enquanto envio_real_liberado não estiver true.

ALTER TABLE public.orbit_zapi_config
  ADD COLUMN IF NOT EXISTS envio_real_liberado boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.orbit_zapi_config.envio_real_liberado IS
  'Trava global por tenant: só permite envio real via Z-API quando true. Default false para proteger tenants recém-configurados.';

-- Atualizar builder para expor a flag nas runtime configs.
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
    'client_token', COALESCE(v_client_token, v_config.client_token),
    'envio_real_liberado', COALESCE(v_config.envio_real_liberado, false)
  );
END;
$$;