// Gate de liberação gradual por tenant.
// Fail-closed: tenants em piloto só enviam respostas de IA comprovadamente
// originadas por inbound real. O único bypass é um canário manual explicitamente
// marcado; o gate final da Z-API ainda restringe o telefone à allowlist canário.

export const VIVER_SEMIJOIAS_EMPRESA_ID = "36f26579-66ad-4ef1-9788-141e4c727232";

export const PILOT_SOURCE_BLOCKED = "PILOT_SOURCE_BLOCKED";
export const PILOT_INBOUND_REQUIRED = "PILOT_INBOUND_REQUIRED";
export const PILOT_TYPEBOT_EVIDENCE_REQUIRED = "PILOT_TYPEBOT_EVIDENCE_REQUIRED";

const VIVER_TYPEBOT_D0_ACTIONS = new Map([
  ["f69f59ad-5c0b-4c90-aae0-5b8578abcc24", "9f20eab5-abfe-4998-a8ac-a7afa616f1e6"],
  ["25bac605-9d27-4dfc-8137-45539414097f", "0da4e8dc-05ee-4faa-b4ca-4b359ae5feb7"],
]);

export function isPilotTenant(empresaId: unknown): boolean {
  return String(empresaId ?? "") === VIVER_SEMIJOIAS_EMPRESA_ID;
}

export function isControlledCanary(item: any): boolean {
  return item?.source_type === "manual" && item?.metadata?.controlled_canary === true;
}

export function isControlledTypebotD0(item: any): boolean {
  return isPilotTenant(item?.empresa_id) &&
    item?.source_type === "flow_initial" &&
    VIVER_TYPEBOT_D0_ACTIONS.has(String(item?.source_id ?? "")) &&
    item?.metadata?.viver_pilot_typebot_d0 === true &&
    typeof item?.metadata?.pilot_not_before === "string";
}

export function pilotStaticBlockReason(item: any): string | null {
  if (!isPilotTenant(item?.empresa_id)) return null;
  if (isControlledCanary(item)) return null;
  if (isControlledTypebotD0(item)) return null;
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

  if (isControlledTypebotD0(item)) {
    const expectedFlowId = VIVER_TYPEBOT_D0_ACTIONS.get(String(item.source_id));
    const cutoff = Date.parse(String(item.metadata.pilot_not_before));
    const itemAt = Date.parse(String(item.created_at ?? ""));
    if (!Number.isFinite(cutoff) || !Number.isFinite(itemAt) || itemAt < cutoff ||
      !item.flow_run_id || !item.prospect_id || !item.conversa_id) {
      return PILOT_TYPEBOT_EVIDENCE_REQUIRED;
    }

    const { data: run } = await supabase
      .from("orbit_flow_runs")
      .select("id, empresa_id, flow_id, event_id, entity_type, entity_id, created_at")
      .eq("id", item.flow_run_id)
      .maybeSingle();
    if (!run || String(run.empresa_id) !== String(item.empresa_id) ||
      String(run.flow_id) !== expectedFlowId || run.entity_type !== "prospect" ||
      String(run.entity_id) !== String(item.prospect_id) || !run.event_id) {
      return PILOT_TYPEBOT_EVIDENCE_REQUIRED;
    }

    const [{ data: event }, { data: prospect }, { data: conversa }] = await Promise.all([
      supabase.from("orbit_flow_events")
        .select("id, empresa_id, event_type, entity_type, entity_id, created_at")
        .eq("id", run.event_id).maybeSingle(),
      supabase.from("orbit_prospects")
        .select("id, empresa_id, origem_lead, created_at")
        .eq("id", item.prospect_id).maybeSingle(),
      supabase.from("orbit_conversas")
        .select("id, empresa_id, prospect_id")
        .eq("id", item.conversa_id).maybeSingle(),
    ]);

    const eventAt = Date.parse(String(event?.created_at ?? ""));
    const prospectAt = Date.parse(String(prospect?.created_at ?? ""));
    if (!event || String(event.empresa_id) !== String(item.empresa_id) ||
      event.event_type !== "lead_recebido" || event.entity_type !== "prospect" ||
      String(event.entity_id) !== String(item.prospect_id) || !Number.isFinite(eventAt) || eventAt < cutoff ||
      !prospect || String(prospect.empresa_id) !== String(item.empresa_id) ||
      prospect.origem_lead !== "lead_source:typebot" || !Number.isFinite(prospectAt) || prospectAt < cutoff ||
      !conversa || String(conversa.empresa_id) !== String(item.empresa_id) ||
      String(conversa.prospect_id) !== String(item.prospect_id)) {
      return PILOT_TYPEBOT_EVIDENCE_REQUIRED;
    }
    return null;
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
