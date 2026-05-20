export interface OrbitZapiRuntimeConfig {
  id: string;
  empresa_id: string | null;
  nome_instancia: string | null;
  instance_id: string | null;
  numero_origem: string | null;
  webhook_url: string | null;
  notificar_enviadas_por_mim: boolean | null;
  ativo: boolean | null;
  token: string | null;
  client_token: string | null;
}

export async function getOrbitZapiRuntimeConfig(
  supabase: any,
  empresaId?: string | null,
): Promise<OrbitZapiRuntimeConfig | null> {
  let resolvedEmpresaId = empresaId ?? null;
  let resolvedConfigId: string | null = null;

  if (!resolvedEmpresaId) {
    const { data: activeConfig, error: activeConfigError } = await supabase
      .from("orbit_zapi_config")
      .select("id, empresa_id")
      .eq("ativo", true)
      .limit(1)
      .maybeSingle();

    if (activeConfigError) {
      throw activeConfigError;
    }

    resolvedEmpresaId = activeConfig?.empresa_id ?? null;
    resolvedConfigId = activeConfig?.id ?? null;
  }

  if (!resolvedEmpresaId && !resolvedConfigId) {
    return null;
  }

  const rpcName = resolvedEmpresaId
    ? "get_orbit_zapi_runtime_config"
    : "get_orbit_zapi_runtime_config_by_id";

  const rpcArgs = resolvedEmpresaId
    ? { p_empresa_id: resolvedEmpresaId }
    : { p_config_id: resolvedConfigId };

  const { data, error } = await supabase.rpc(rpcName, rpcArgs);

  if (error) {
    throw error;
  }

  return (data as OrbitZapiRuntimeConfig | null) ?? null;
}
