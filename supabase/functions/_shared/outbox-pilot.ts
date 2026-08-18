// Gate de liberação gradual por tenant.
// Fail-closed: tenants em piloto só enviam respostas de IA comprovadamente
// originadas por inbound real. O único bypass é um canário manual explicitamente
// marcado; o gate final da Z-API ainda restringe o telefone à allowlist canário.

export const VIVER_SEMIJOIAS_EMPRESA_ID = "36f26579-66ad-4ef1-9788-141e4c727232";

export const PILOT_SOURCE_BLOCKED = "PILOT_SOURCE_BLOCKED";
export const PILOT_INBOUND_REQUIRED = "PILOT_INBOUND_REQUIRED";

export function isPilotTenant(empresaId: unknown): boolean {
  return String(empresaId ?? "") === VIVER_SEMIJOIAS_EMPRESA_ID;
}

export function isControlledCanary(item: any): boolean {
  return item?.source_type === "manual" && item?.metadata?.controlled_canary === true;
}

export function pilotStaticBlockReason(item: any): string | null {
  if (!isPilotTenant(item?.empresa_id)) return null;
  if (isControlledCanary(item)) return null;
  if (item?.source_type !== "ai_reply") return PILOT_SOURCE_BLOCKED;
  const inboundId = item?.metadata?.inbound_message_id;
  if (typeof inboundId !== "string" || !inboundId.trim()) return PILOT_INBOUND_REQUIRED;
  return null;
}

export async function pilotInboundBlockReason(supabase: any, item: any): Promise<string | null> {
  const staticReason = pilotStaticBlockReason(item);
  if (staticReason || !isPilotTenant(item?.empresa_id) || isControlledCanary(item)) {
    return staticReason;
  }

  const inboundId = String(item.metadata.inbound_message_id).match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  )?.[0];
  if (!inboundId || !item.conversa_id) return PILOT_INBOUND_REQUIRED;

  const { data: inbound } = await supabase
    .from("orbit_mensagens")
    .select("id, empresa_id, conversa_id, direcao, timestamp")
    .eq("id", inboundId)
    .maybeSingle();

  if (!inbound ||
    String(inbound.empresa_id) !== String(item.empresa_id) ||
    String(inbound.conversa_id) !== String(item.conversa_id) ||
    String(inbound.direcao).toUpperCase() !== "IN") {
    return PILOT_INBOUND_REQUIRED;
  }

  const inboundAt = Date.parse(String(inbound.timestamp ?? ""));
  const itemAt = Date.parse(String(item.created_at ?? ""));
  if (!Number.isFinite(inboundAt) || !Number.isFinite(itemAt) || inboundAt > itemAt || itemAt - inboundAt > 24 * 60 * 60 * 1000) {
    return PILOT_INBOUND_REQUIRED;
  }

  return null;
}
