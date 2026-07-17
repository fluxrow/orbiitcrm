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
  envio_real_liberado?: boolean | null;
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

  let config = (data as OrbitZapiRuntimeConfig | null) ?? null;

  // Fallback: se a RPC ainda não expõe envio_real_liberado, buscar direto na tabela.
  if (config && (config.envio_real_liberado === undefined || config.envio_real_liberado === null)) {
    try {
      const { data: gate } = await supabase
        .from("orbit_zapi_config")
        .select("envio_real_liberado")
        .eq("id", config.id)
        .maybeSingle();
      config = { ...config, envio_real_liberado: (gate as any)?.envio_real_liberado ?? false };
    } catch {
      config = { ...config, envio_real_liberado: false };
    }
  }

  return config;
}

/**
 * Trava global de envio real via Z-API.
 * Retorna null se o envio real está liberado; caso contrário retorna a
 * mensagem de bloqueio que deve ser registrada/retornada ao chamador.
 *
 * NUNCA fazer fetch em endpoints send-text / send-image / send-audio /
 * send-document / send-video da Z-API sem passar por essa checagem.
 */
export function getOrbitZapiRealSendBlockReason(
  config: Pick<OrbitZapiRuntimeConfig, "envio_real_liberado"> | null | undefined,
): string | null {
  if (config?.envio_real_liberado === true) return null;
  return "Envio real via Z-API bloqueado para este tenant. Valide a instância e libere envio_real_liberado antes do go-live.";
}
