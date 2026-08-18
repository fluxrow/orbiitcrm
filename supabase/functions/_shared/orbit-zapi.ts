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
  canary_mode_enabled?: boolean | null;
  canary_phone_numbers?: string[] | null;
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

  // Fallback: se a RPC ainda não expõe os gates de envio, buscar direto na tabela.
  if (
    config &&
    (config.envio_real_liberado === undefined ||
      config.envio_real_liberado === null ||
      config.canary_mode_enabled === undefined ||
      config.canary_phone_numbers === undefined)
  ) {
    try {
      const { data: gate } = await supabase
        .from("orbit_zapi_config")
        .select("envio_real_liberado, canary_mode_enabled, canary_phone_numbers")
        .eq("id", config.id)
        .maybeSingle();
      config = {
        ...config,
        envio_real_liberado: config.envio_real_liberado ?? (gate as any)?.envio_real_liberado ?? false,
        canary_mode_enabled: config.canary_mode_enabled ?? (gate as any)?.canary_mode_enabled ?? false,
        canary_phone_numbers: config.canary_phone_numbers ?? (gate as any)?.canary_phone_numbers ?? [],
      };
    } catch {
      config = {
        ...config,
        envio_real_liberado: config.envio_real_liberado ?? false,
        canary_mode_enabled: config.canary_mode_enabled ?? false,
        canary_phone_numbers: config.canary_phone_numbers ?? [],
      };
    }
  }

  return config;
}

/** Normalização E.164 por dígitos (ponto único). Retorna só dígitos, sem '+'. */
export function normalizeZapiPhoneDigits(raw: unknown): string {
  let digits = String(raw ?? "").replace(/\D+/g, "");
  if (!digits) return "";
  // 00 + DDI internacional → remove prefixo de discagem internacional
  if (digits.length > 12 && digits.startsWith("00")) digits = digits.slice(2);
  // número BR sem DDI (10 ou 11 dígitos) → prefixa 55
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return digits;
}

/** Telefone é um canário autorizado para este tenant? */
export function isOrbitZapiCanaryRecipient(
  config: Pick<OrbitZapiRuntimeConfig, "canary_mode_enabled" | "canary_phone_numbers"> | null | undefined,
  phone: unknown,
): boolean {
  if (config?.canary_mode_enabled !== true) return false;
  const target = normalizeZapiPhoneDigits(phone);
  if (!target) return false;
  const list = Array.isArray(config?.canary_phone_numbers) ? config!.canary_phone_numbers! : [];
  return list.some((candidate) => normalizeZapiPhoneDigits(candidate) === target);
}

export const ZAPI_BLOCK_REASON_GLOBAL =
  "Envio real via Z-API bloqueado para este tenant. Valide a instância e libere envio_real_liberado antes do go-live.";
export const ZAPI_BLOCK_REASON_CANARY =
  "Envio real via Z-API bloqueado: destinatário fora da lista canário deste tenant.";

/**
 * Trava global de envio real via Z-API + gate canário (fail-closed).
 *
 * • envio_real_liberado=true → comportamento existente (liberado).
 * • envio_real_liberado=false → só libera se canary_mode_enabled=true E o
 *   destinatário normalizado estiver em canary_phone_numbers.
 * • qualquer outro caso → bloqueia.
 *
 * NUNCA fazer fetch em endpoints send-text / send-image / send-audio /
 * send-document / send-video da Z-API sem passar por essa checagem.
 */
export function getOrbitZapiRealSendBlockReason(
  config:
    | Pick<OrbitZapiRuntimeConfig, "envio_real_liberado" | "canary_mode_enabled" | "canary_phone_numbers">
    | null
    | undefined,
  phone?: unknown,
): string | null {
  if (config?.envio_real_liberado === true) return null;
  if (phone !== undefined && phone !== null && isOrbitZapiCanaryRecipient(config, phone)) return null;
  if (config?.canary_mode_enabled === true) return ZAPI_BLOCK_REASON_CANARY;
  return ZAPI_BLOCK_REASON_GLOBAL;
}

