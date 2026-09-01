import { isMeetingReminderKind } from "../_shared/meeting-reminder-policy.ts";

export type FlowOutboxSourceType =
  | "flow_initial"
  | "flow_followup"
  | "flow_stage"
  | "meeting_confirmation";

const ALLOWED_OUTBOX_SOURCE_OVERRIDES = new Set([
  "flow_initial",
  "flow_followup",
  "flow_stage",
]);

/**
 * Deriva a origem semântica do outbox a partir do gatilho do fluxo.
 * Lembretes de reunião sempre vencem qualquer override de configuração para
 * que nunca sejam avaliados como primeira abordagem comercial.
 */
export function deriveOutboxSourceType(
  triggerType: string | null,
  hasScheduledAction: boolean,
  cfg: Record<string, unknown>,
): FlowOutboxSourceType {
  if (isMeetingReminderKind(triggerType)) return "meeting_confirmation";

  const override = typeof cfg?.outbox_source_type === "string"
    ? cfg.outbox_source_type
    : null;
  if (override && ALLOWED_OUTBOX_SOURCE_OVERRIDES.has(override)) {
    return override as FlowOutboxSourceType;
  }
  if (triggerType === "deal_stage_changed") return "flow_stage";
  if (triggerType === "lead_recebido") {
    return hasScheduledAction ? "flow_followup" : "flow_initial";
  }
  return hasScheduledAction ? "flow_followup" : "flow_initial";
}
