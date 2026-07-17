// Helper compartilhado para registrar tentativas de envio via Z-API.
// Nunca lança para não interromper o fluxo principal — bloqueios devem ser
// respondidos ao chamador normalmente, e a auditoria é best-effort.

export interface ZapiAuditInput {
  empresa_id?: string | null;
  function_name: string;
  action: string;
  blocked: boolean;
  block_reason?: string | null;
  zapi_config_id?: string | null;
  campaign_id?: string | null;
  prospect_id?: string | null;
  conversa_id?: string | null;
  mensagem_id?: string | null;
  created_by?: string | null;
  payload_summary?: Record<string, unknown>;
}

/** Mascara telefones em resumos de payload: mantém DDI/DDD e últimos 2 dígitos. */
export function maskPhone(input: unknown): string | null {
  if (input == null) return null;
  const digits = String(input).replace(/\D+/g, "");
  if (!digits) return null;
  if (digits.length <= 4) return "*".repeat(digits.length);
  return `${digits.slice(0, 4)}${"*".repeat(Math.max(0, digits.length - 6))}${digits.slice(-2)}`;
}

// Chaves proibidas em payload_summary — jamais persistir segredos.
const FORBIDDEN_KEYS = new Set([
  "token", "client_token", "access_token", "refresh_token",
  "authorization", "apikey", "api_key", "password", "senha",
]);

function sanitizeSummary(summary: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!summary) return {};
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(summary)) {
    const lower = k.toLowerCase();
    if (FORBIDDEN_KEYS.has(lower)) continue;
    if (lower === "telefone" || lower === "phone" || lower === "numero_origem") {
      clean[k] = maskPhone(v);
      continue;
    }
    clean[k] = v;
  }
  return clean;
}

export async function auditZapiSendAttempt(
  supabase: any,
  input: ZapiAuditInput,
): Promise<void> {
  try {
    await supabase.from("orbit_zapi_send_audit").insert({
      empresa_id: input.empresa_id ?? null,
      function_name: input.function_name,
      action: input.action,
      blocked: input.blocked,
      block_reason: input.block_reason ?? null,
      zapi_config_id: input.zapi_config_id ?? null,
      campaign_id: input.campaign_id ?? null,
      prospect_id: input.prospect_id ?? null,
      conversa_id: input.conversa_id ?? null,
      mensagem_id: input.mensagem_id ?? null,
      created_by: input.created_by ?? null,
      payload_summary: sanitizeSummary(input.payload_summary),
    });
  } catch (err) {
    console.warn("[zapi-audit] failed", err instanceof Error ? err.message : err);
  }
}
