export const INCIDENT_RECOVERY_MIN_AGE_MS = 3 * 60 * 1000;
export const INCIDENT_RECOVERY_MAX_AGE_MS = 20 * 60 * 1000;
export const INCIDENT_RECOVERY_COOLDOWN_MS = 4 * 60 * 1000;
export const INCIDENT_RECOVERY_MAX_CLAIM_ATTEMPTS = 2;

export interface IncidentRecoveryInput {
  incidentType: string;
  incidentStatus: string;
  inboundAt: string;
  now: Date;
  automaticMode: boolean;
  sendingEnabled: boolean;
  outboxAdapterEnabled: boolean;
  zapiActive: boolean;
  zapiOffline: boolean;
  realSendEnabled: boolean;
  canaryModeEnabled: boolean;
  canaryPhoneNumbers: string[];
  phone: string | null;
  responderForaHorario: boolean;
  horarioInicio: string | null;
  horarioFim: string | null;
  humanTalk: boolean;
  humanUserId: string | null;
  archivedAt: string | null;
  quarantineReason: string | null;
  conversationStatus: string | null;
  prospectDeletedAt: string | null;
  prospectOptoutWhatsapp: boolean;
  latestInboundMessageId: string | null;
  incidentInboundMessageId: string;
  hasRealOutboundAfterInbound: boolean;
  hasActiveOutboxAfterInbound: boolean;
  claimStatus: string | null;
  claimAttempts: number;
  claimFinishedAt: string | null;
}

export interface IncidentRecoveryDecision {
  eligible: boolean;
  reason: string;
}

function digits(value: string | null | undefined): string {
  return String(value ?? "").replace(/\D/g, "");
}

function minutesOfDay(value: string | null): number | null {
  const match = String(value ?? "").match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

export function isInsideTenantServiceWindow(input: IncidentRecoveryInput): boolean {
  if (input.responderForaHorario) return true;
  const start = minutesOfDay(input.horarioInicio);
  const end = minutesOfDay(input.horarioFim);
  if (start === null || end === null) return false;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(input.now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  const current = hour * 60 + minute;
  return start <= end ? current >= start && current <= end : current >= start || current <= end;
}

export function evaluateIncidentRecovery(input: IncidentRecoveryInput): IncidentRecoveryDecision {
  if (input.incidentStatus !== "open") return { eligible: false, reason: "incident_not_open" };
  if (!["missing_dispatch", "execution_failed"].includes(input.incidentType)) {
    return { eligible: false, reason: "incident_type_not_recoverable" };
  }
  const age = input.now.getTime() - new Date(input.inboundAt).getTime();
  if (!Number.isFinite(age) || age < INCIDENT_RECOVERY_MIN_AGE_MS) return { eligible: false, reason: "too_fresh" };
  if (age > INCIDENT_RECOVERY_MAX_AGE_MS) return { eligible: false, reason: "stale" };
  if (!input.automaticMode) return { eligible: false, reason: "automatic_mode_disabled" };
  if (!input.sendingEnabled || !input.outboxAdapterEnabled) return { eligible: false, reason: "queue_disabled" };
  if (!input.zapiActive || input.zapiOffline) return { eligible: false, reason: "provider_unavailable" };
  const phone = digits(input.phone);
  const canaryAllowed = input.canaryModeEnabled && input.canaryPhoneNumbers.some((item) => digits(item) === phone);
  if (!input.realSendEnabled && !canaryAllowed) return { eligible: false, reason: "real_send_disabled" };
  if (!isInsideTenantServiceWindow(input)) return { eligible: false, reason: "outside_service_window" };
  if (input.humanTalk || input.humanUserId) return { eligible: false, reason: "human_takeover" };
  if (input.archivedAt || input.quarantineReason) return { eligible: false, reason: "conversation_inactive" };
  if (["fechada", "closed", "encerrada"].includes(String(input.conversationStatus ?? "").toLowerCase())) {
    return { eligible: false, reason: "conversation_closed" };
  }
  if (input.prospectDeletedAt || input.prospectOptoutWhatsapp) return { eligible: false, reason: "prospect_ineligible" };
  if (input.latestInboundMessageId !== input.incidentInboundMessageId) return { eligible: false, reason: "superseded_inbound" };
  if (input.hasRealOutboundAfterInbound) return { eligible: false, reason: "already_answered" };
  if (input.hasActiveOutboxAfterInbound) return { eligible: false, reason: "delivery_already_queued" };
  if (input.claimStatus === "running" || input.claimStatus === "finished") {
    return { eligible: false, reason: "claim_not_retryable" };
  }
  if (input.claimAttempts >= INCIDENT_RECOVERY_MAX_CLAIM_ATTEMPTS) {
    return { eligible: false, reason: "max_attempts" };
  }
  if (input.claimFinishedAt) {
    const cooldown = input.now.getTime() - new Date(input.claimFinishedAt).getTime();
    if (Number.isFinite(cooldown) && cooldown < INCIDENT_RECOVERY_COOLDOWN_MS) {
      return { eligible: false, reason: "cooldown" };
    }
  }
  return { eligible: true, reason: "eligible" };
}
