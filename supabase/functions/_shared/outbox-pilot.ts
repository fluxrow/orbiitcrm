// Gate de liberação gradual por tenant.
// Fail-closed: tenants em piloto só enviam respostas de IA comprovadamente
// originadas por inbound real. O único bypass é um canário manual explicitamente
// marcado; o gate final da Z-API ainda restringe o telefone à allowlist canário.

import { evaluateViverMeetingReminder } from "./viver-meeting-lifecycle.ts";

export const VIVER_SEMIJOIAS_EMPRESA_ID = "36f26579-66ad-4ef1-9788-141e4c727232";
export const VIVER_CONTROLLED_OUTBOX_GATE_VERSION = "2026-09-02-v3";

export const PILOT_SOURCE_BLOCKED = "PILOT_SOURCE_BLOCKED";
export const PILOT_INBOUND_REQUIRED = "PILOT_INBOUND_REQUIRED";
export const PILOT_TYPEBOT_EVIDENCE_REQUIRED = "PILOT_TYPEBOT_EVIDENCE_REQUIRED";
export const PILOT_CAMPAIGN_EVIDENCE_REQUIRED = "PILOT_CAMPAIGN_EVIDENCE_REQUIRED";
export const PILOT_CAMPAIGN_MESSAGE_INVALID = "PILOT_CAMPAIGN_MESSAGE_INVALID";
export const PILOT_FOLLOWUP_EVIDENCE_REQUIRED = "PILOT_FOLLOWUP_EVIDENCE_REQUIRED";
export const PILOT_MEETING_EVIDENCE_REQUIRED = "PILOT_MEETING_EVIDENCE_REQUIRED";

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

export function isControlledViverCampaign(item: any): boolean {
  return isPilotTenant(item?.empresa_id) && item?.source_type === "campaign" &&
    item?.metadata?.viver_controlled_reengagement === true;
}

export function controlledViverCampaignMessageBlockReason(item: any): string | null {
  if (!isControlledViverCampaign(item)) return null;

  const message = item?.payload?.mensagem;
  if (typeof message !== "string" || !message.trim()) {
    return PILOT_CAMPAIGN_MESSAGE_INVALID;
  }

  const questionCount = (message.match(/\?/g) ?? []).length;
  const hasUrl = /(?:https?:\/\/|www\.)/i.test(message);
  if (questionCount !== 1 || hasUrl) {
    return PILOT_CAMPAIGN_MESSAGE_INVALID;
  }

  return null;
}

export function isControlledViverFollowup(item: any): boolean {
  return isPilotTenant(item?.empresa_id) && item?.source_type === "flow_followup" &&
    item?.metadata?.viver_controlled_followup === true &&
    typeof item?.metadata?.pilot_not_before === "string";
}

export function isControlledViverMeetingReminder(item: any): boolean {
  return isPilotTenant(item?.empresa_id) && item?.source_type === "meeting_confirmation" &&
    typeof item?.metadata?.meeting_id === "string" &&
    typeof item?.metadata?.reminder_kind === "string";
}

export function pilotStaticBlockReason(item: any): string | null {
  if (!isPilotTenant(item?.empresa_id)) return null;
  if (isControlledCanary(item)) return null;
  if (isControlledTypebotD0(item)) return null;
  if (isControlledViverCampaign(item)) return controlledViverCampaignMessageBlockReason(item);
  if (isControlledViverFollowup(item)) return null;
  if (isControlledViverMeetingReminder(item)) return null;
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

  if (isControlledViverCampaign(item)) {
    if (!item.campaign_id || !item.source_id || !item.prospect_id) {
      return PILOT_CAMPAIGN_EVIDENCE_REQUIRED;
    }
    const [{ data: campaign }, { data: recipient }, { data: prospect }] = await Promise.all([
      supabase.from("orbit_campaigns")
        .select("id, empresa_id, canal, status, aprovacao_status, filtros_json")
        .eq("id", item.campaign_id).maybeSingle(),
      supabase.from("orbit_campaign_recipients")
        .select("id, campaign_id, prospect_id, status")
        .eq("id", item.source_id).maybeSingle(),
      supabase.from("orbit_prospects")
        .select("id, empresa_id, origem_lead")
        .eq("id", item.prospect_id).maybeSingle(),
    ]);
    const controlled = campaign?.filtros_json?.controlled_reengagement;
    const selected = campaign?.filtros_json?.selected_prospect_ids;
    const cap = Number(controlled?.daily_cap);
    const slot = Number(controlled?.slot);
    if (!campaign || String(campaign.empresa_id) !== String(item.empresa_id) ||
      campaign.canal !== "whatsapp" || campaign.aprovacao_status !== "aprovada" ||
      !["agendada", "enviando", "aprovada"].includes(String(campaign.status)) ||
      controlled?.source_form !== "typebot" || controlled?.requires_day_close_review !== true ||
      !Number.isInteger(cap) || cap < 1 || cap > 10 || !Number.isInteger(slot) || slot < 1 || slot > cap ||
      !Array.isArray(selected) || selected.length !== 1 || String(selected[0]) !== String(item.prospect_id) ||
      !recipient || String(recipient.campaign_id) !== String(item.campaign_id) ||
      String(recipient.prospect_id) !== String(item.prospect_id) || !["pendente", "enviando"].includes(String(recipient.status)) ||
      !prospect || String(prospect.empresa_id) !== String(item.empresa_id) ||
      prospect.origem_lead !== "lead_source:typebot") {
      return PILOT_CAMPAIGN_EVIDENCE_REQUIRED;
    }
    return null;
  }

  if (isControlledViverFollowup(item)) {
    const cutoff = Date.parse(String(item.metadata.pilot_not_before));
    const itemAt = Date.parse(String(item.created_at ?? ""));
    if (!item.scheduled_action_id || !item.flow_run_id || !item.prospect_id ||
      !Number.isFinite(cutoff) || !Number.isFinite(itemAt) || itemAt < cutoff) {
      return PILOT_FOLLOWUP_EVIDENCE_REQUIRED;
    }
    const [{ data: scheduled }, { data: run }] = await Promise.all([
      supabase.from("orbit_flow_scheduled_actions")
        .select("id, empresa_id, run_id, flow_id, action_id, action_config, prospect_id")
        .eq("id", item.scheduled_action_id).maybeSingle(),
      supabase.from("orbit_flow_runs")
        .select("id, empresa_id, flow_id, event_id, entity_id")
        .eq("id", item.flow_run_id).maybeSingle(),
    ]);
    const cfg = scheduled?.action_config ?? {};
    if (!scheduled || String(scheduled.empresa_id) !== String(item.empresa_id) ||
      String(scheduled.run_id) !== String(item.flow_run_id) ||
      String(scheduled.prospect_id) !== String(item.prospect_id) ||
      cfg.viver_controlled_followup !== true || cfg.enabled !== true || cfg.cancel_on_reply !== true ||
      !run || String(run.empresa_id) !== String(item.empresa_id) ||
      String(run.flow_id) !== String(scheduled.flow_id) || String(run.entity_id) !== String(item.prospect_id)) {
      return PILOT_FOLLOWUP_EVIDENCE_REQUIRED;
    }
    return null;
  }

  if (isControlledViverMeetingReminder(item)) {
    const meetingId = String(item.metadata.meeting_id);
    const { data: meeting, error } = await supabase.from("orbit_meetings")
      .select("id, empresa_id, prospect_id, conversa_id, scheduled_at, duration_minutes, status, meeting_url")
      .eq("id", meetingId).eq("empresa_id", item.empresa_id).maybeSingle();
    const decision = evaluateViverMeetingReminder({
      reminderKind: item.metadata.reminder_kind,
      meetingId,
      meeting,
      queryFailed: Boolean(error),
    }, new Date());
    if (!decision.allowed || !meeting || String(meeting.prospect_id) !== String(item.prospect_id) ||
      (item.conversa_id && String(meeting.conversa_id) !== String(item.conversa_id))) {
      return PILOT_MEETING_EVIDENCE_REQUIRED;
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
