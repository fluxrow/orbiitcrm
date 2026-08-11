// Fonte ÚNICA do destinatário de notificações internas por WhatsApp
// (venda confirmada, novo lead qualificado, handoff/comercial, notify_vendedor).
//
// REGRAS INVIOLÁVEIS
//  1. O telefone é sempre resolvido a partir da configuração do MESMO empresa_id
//     (isolamento multi-tenant). Nunca há fallback entre tenants.
//  2. Prioridade: orbit_ai_config.notification_recipient_whatsapp
//               → orbit_ai_config.scheduling_handoff_whatsapp
//               → WhatsApp/telefone do vendedor resolvido (mesma empresa)
//  3. orbit_zapi_config.canary_phone_numbers NUNCA é destinatário de notificação.
//     É apenas allowlist de teste/canário para envio a leads.
//  4. Nenhum número hardcoded/env como fallback.
//  5. Saída sempre normalizada em dígitos E.164 (BR: 10/11 dígitos recebem 55).

export type InternalNotificationSource =
  | "ai_config_notification_recipient"
  | "ai_config_scheduling_handoff"
  | "vendedor_pe_users"
  | "vendedor_profile"
  | "none";

export interface InternalNotificationTarget {
  phone: string | null;
  source: InternalNotificationSource;
  /** Motivo do descarte, quando phone === null. */
  reason?: string;
}

/** Normaliza para dígitos E.164 (assume BR quando 10/11 dígitos). */
export function normalizeE164Digits(raw: unknown): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  // Números longos com DDI já presente ou inválidos passam como estão para validação abaixo.
  return digits;
}

/** Aceita apenas algo plausível como telefone internacional (12 a 15 dígitos). */
export function isValidNotificationPhone(raw: unknown): boolean {
  const digits = normalizeE164Digits(raw);
  return digits.length >= 12 && digits.length <= 15;
}

interface ResolveOptions {
  /** Vendedor/responsável já resolvido para a MESMA empresa (opcional). */
  vendedorId?: string | null;
}

/**
 * Resolve o telefone operacional de notificação interna do tenant.
 * Nunca consulta canary_phone_numbers e nunca cruza empresa_id.
 */
export async function resolveInternalNotificationTarget(
  supabase: any,
  empresaId: string | null | undefined,
  options: ResolveOptions = {},
): Promise<InternalNotificationTarget> {
  if (!empresaId) return { phone: null, source: "none", reason: "empresa_id ausente" };

  const { data: aiConfig } = await supabase
    .from("orbit_ai_config")
    .select("notification_recipient_whatsapp, scheduling_handoff_whatsapp")
    .eq("empresa_id", empresaId)
    .maybeSingle();

  const candidates: Array<[InternalNotificationSource, unknown]> = [
    ["ai_config_notification_recipient", aiConfig?.notification_recipient_whatsapp],
    ["ai_config_scheduling_handoff", aiConfig?.scheduling_handoff_whatsapp],
  ];

  for (const [source, value] of candidates) {
    if (isValidNotificationPhone(value)) {
      return { phone: normalizeE164Digits(value), source };
    }
  }

  // Fallback final: vendedor da MESMA empresa (validado aqui, não pelo chamador).
  const vendedorId = options.vendedorId || null;
  if (vendedorId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, telefone, empresa_id")
      .eq("id", vendedorId)
      .maybeSingle();

    if (profile && profile.empresa_id && profile.empresa_id !== empresaId) {
      return { phone: null, source: "none", reason: "vendedor pertence a outro tenant" };
    }

    const { data: peUser } = await supabase
      .from("pe_users")
      .select("whatsapp, phone")
      .eq("id", vendedorId)
      .maybeSingle();

    if (isValidNotificationPhone(peUser?.whatsapp) || isValidNotificationPhone(peUser?.phone)) {
      const raw = isValidNotificationPhone(peUser?.whatsapp) ? peUser?.whatsapp : peUser?.phone;
      return { phone: normalizeE164Digits(raw), source: "vendedor_pe_users" };
    }
    if (isValidNotificationPhone(profile?.telefone)) {
      return { phone: normalizeE164Digits(profile?.telefone), source: "vendedor_profile" };
    }
  }

  return {
    phone: null,
    source: "none",
    reason: "tenant sem notification_recipient_whatsapp/scheduling_handoff_whatsapp e vendedor sem telefone válido",
  };
}
