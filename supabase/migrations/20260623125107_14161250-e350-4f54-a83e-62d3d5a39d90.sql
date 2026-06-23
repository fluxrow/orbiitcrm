
CREATE OR REPLACE FUNCTION public.get_orbit_zapi_runtime_config(p_empresa_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', c.id,
    'empresa_id', c.empresa_id,
    'nome_instancia', c.nome_instancia,
    'instance_id', c.instance_id,
    'numero_origem', c.numero_origem,
    'webhook_url', c.webhook_url,
    'notificar_enviadas_por_mim', c.notificar_enviadas_por_mim,
    'ativo', c.ativo,
    'token', c.token,
    'client_token', c.client_token
  )
  FROM public.orbit_zapi_config c
  WHERE c.empresa_id = p_empresa_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_orbit_zapi_runtime_config_by_id(p_config_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', c.id,
    'empresa_id', c.empresa_id,
    'nome_instancia', c.nome_instancia,
    'instance_id', c.instance_id,
    'numero_origem', c.numero_origem,
    'webhook_url', c.webhook_url,
    'notificar_enviadas_por_mim', c.notificar_enviadas_por_mim,
    'ativo', c.ativo,
    'token', c.token,
    'client_token', c.client_token
  )
  FROM public.orbit_zapi_config c
  WHERE c.id = p_config_id;
$$;

REVOKE ALL ON FUNCTION public.get_orbit_zapi_runtime_config(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_orbit_zapi_runtime_config_by_id(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_orbit_zapi_runtime_config(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_orbit_zapi_runtime_config_by_id(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
