import { TENANTS } from "./remediation-playbooks.ts";

export type ReleaseKind =
  | "meeting_confirmation"
  | "meeting_reminder_24h"
  | "meeting_reminder_1h"
  | "meeting_reminder_5m"
  | "weekly_reminder"
  | "follow_up";

export type ReleaseState =
  | "prepared"
  | "remediating"
  | "ready"
  | "enqueued"
  | "verifying"
  | "released"
  | "expired"
  | "canceled"
  | "needs_approval"
  | "failed";

export type IncidentDescriptor = {
  descriptorVersion: 1;
  tenantId: string;
  entityId: string;
  eventId: string;
  idempotencyKey: string;
  kind: ReleaseKind;
  preflightAt: string;
  releaseAt: string;
  releaseDeadline: string;
  deliveryDeadline: string;
  meetingStartsAt?: string | null;
  eligible: boolean;
  consentCurrent: boolean;
  conversationId: string;
  templateId: string;
  prospectId?: string | null;
  dealId?: string | null;
  meetingId?: string | null;
  scheduledActionId?: string | null;
  flowRunId?: string | null;
  recipientHash: string;
  contentHash: string;
  canonicalLinkHash?: string | null;
};

export type DeliveryStatus =
  | "pending"
  | "processing"
  | "sent"
  | "already_exists"
  | "rejected"
  | "failed"
  | "canceled";

export type DeliveryEvidence = {
  outboxId?: string;
  status: DeliveryStatus;
  providerMessageId?: string | null;
  attempts: number;
};

export type ReleaseValidation = {
  eligible: boolean;
  consentCurrent: boolean;
  meetingFuture: boolean;
  tenantMatch: boolean;
  sameRecipient: boolean;
  sameTemplate: boolean;
  sameContent: boolean;
  sameLink: boolean;
  adapterReady: boolean;
  withinQuotaCadence: boolean;
  providerNotAccepted: boolean;
  noDuplicate: boolean;
};

export type ReleaseAdapter = {
  find: (key: string) => Promise<ReleaseState | null>;
  save: (
    key: string,
    state: ReleaseState,
    evidence?: DeliveryEvidence,
  ) => Promise<void>;
  revalidate: (d: IncidentDescriptor) => Promise<ReleaseValidation>;
  enqueueOfficialOnce: (d: IncidentDescriptor) => Promise<DeliveryEvidence>;
  inspectOfficialDelivery: (outboxId?: string) => Promise<DeliveryEvidence>;
};

type WindowPolicy = {
  minPreflightLeadMs: number;
  maxPreflightLeadMs: number;
  maxReleaseGraceMs: number;
  maxDeliveryGraceMs: number;
  meetingRequired: boolean;
  linkRequired: boolean;
};

const minute = 60_000;

/**
 * Limites do remediador, não os offsets do lembrete em relação à reunião.
 * Ex.: o lembrete de 24h abre preflight 15min antes do seu release em T-24h.
 */
export const RELEASE_WINDOW_POLICY: Record<ReleaseKind, WindowPolicy> = {
  meeting_confirmation: {
    minPreflightLeadMs: 0,
    maxPreflightLeadMs: minute,
    maxReleaseGraceMs: minute,
    maxDeliveryGraceMs: minute,
    meetingRequired: true,
    linkRequired: true,
  },
  meeting_reminder_24h: {
    minPreflightLeadMs: 10 * minute,
    maxPreflightLeadMs: 20 * minute,
    maxReleaseGraceMs: 10 * minute,
    maxDeliveryGraceMs: 10 * minute,
    meetingRequired: true,
    linkRequired: true,
  },
  meeting_reminder_1h: {
    minPreflightLeadMs: 10 * minute,
    maxPreflightLeadMs: 20 * minute,
    maxReleaseGraceMs: 10 * minute,
    maxDeliveryGraceMs: 10 * minute,
    meetingRequired: true,
    linkRequired: true,
  },
  meeting_reminder_5m: {
    minPreflightLeadMs: 8 * minute,
    maxPreflightLeadMs: 12 * minute,
    maxReleaseGraceMs: 2 * minute,
    maxDeliveryGraceMs: 2 * minute,
    meetingRequired: true,
    linkRequired: true,
  },
  weekly_reminder: {
    minPreflightLeadMs: 20 * minute,
    maxPreflightLeadMs: 40 * minute,
    maxReleaseGraceMs: 10 * minute,
    maxDeliveryGraceMs: 10 * minute,
    meetingRequired: true,
    linkRequired: true,
  },
  follow_up: {
    minPreflightLeadMs: 5 * minute,
    maxPreflightLeadMs: 15 * minute,
    maxReleaseGraceMs: 10 * minute,
    maxDeliveryGraceMs: 10 * minute,
    meetingRequired: false,
    linkRequired: false,
  },
};

const TERMINAL_STATES: ReadonlySet<ReleaseState> = new Set([
  "released",
  "expired",
  "canceled",
  "needs_approval",
  "failed",
]);

function validHash(value: unknown): boolean {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

function parseTime(value: unknown): number {
  return typeof value === "string" ? Date.parse(value) : Number.NaN;
}

function invariantMismatch(v: ReleaseValidation): boolean {
  return !v.tenantMatch || !v.sameRecipient || !v.sameTemplate ||
    !v.sameContent || !v.sameLink || !v.providerNotAccepted || !v.noDuplicate;
}

function operationallyIneligible(v: ReleaseValidation): boolean {
  return !v.eligible || !v.consentCurrent || !v.meetingFuture ||
    !v.adapterReady || !v.withinQuotaCadence;
}

function sentExactlyOnce(evidence: DeliveryEvidence): boolean {
  return evidence.status === "sent" && evidence.attempts === 1 &&
    Boolean(evidence.providerMessageId);
}

export function validateDescriptor(
  d: IncidentDescriptor,
  now = new Date(),
): string[] {
  const reasons: string[] = [];
  const policy = RELEASE_WINDOW_POLICY[d.kind];
  if (d.descriptorVersion !== 1) reasons.push("descriptor_version_invalid");
  if (!policy) reasons.push("kind_not_allowlisted");
  if (
    ![TENANTS.bullink, TENANTS.viver].includes(
      d.tenantId as (typeof TENANTS)[keyof typeof TENANTS],
    )
  ) reasons.push("tenant_not_allowlisted");
  if (!d.entityId || !d.eventId || !d.idempotencyKey) {
    reasons.push("correlation_required");
  }
  if (!d.conversationId || !d.templateId) reasons.push("authority_required");
  if (!validHash(d.recipientHash) || !validHash(d.contentHash)) {
    reasons.push("fingerprint_required");
  }
  if (policy?.linkRequired && !validHash(d.canonicalLinkHash)) {
    reasons.push("canonical_link_fingerprint_required");
  }

  const preflightAt = parseTime(d.preflightAt);
  const releaseAt = parseTime(d.releaseAt);
  const releaseDeadline = parseTime(d.releaseDeadline);
  const deliveryDeadline = parseTime(d.deliveryDeadline);
  if (
    ![preflightAt, releaseAt, releaseDeadline, deliveryDeadline].every(
      Number.isFinite,
    )
  ) {
    reasons.push("temporal_fields_invalid");
  } else if (policy) {
    const lead = releaseAt - preflightAt;
    const releaseGrace = releaseDeadline - releaseAt;
    const deliveryGrace = deliveryDeadline - releaseAt;
    if (
      lead < policy.minPreflightLeadMs || lead > policy.maxPreflightLeadMs
    ) reasons.push("preflight_window_outside_safe_limits");
    if (releaseGrace < 0 || releaseGrace > policy.maxReleaseGraceMs) {
      reasons.push("release_deadline_outside_safe_limits");
    }
    if (
      deliveryDeadline < releaseDeadline || deliveryGrace < 0 ||
      deliveryGrace > policy.maxDeliveryGraceMs
    ) reasons.push("delivery_deadline_outside_safe_limits");
    if (deliveryDeadline <= now.getTime()) reasons.push("window_expired");
  }

  if (policy?.meetingRequired) {
    const meetingStartsAt = parseTime(d.meetingStartsAt);
    if (!Number.isFinite(meetingStartsAt)) {
      reasons.push("meeting_time_required");
    } else {
      if (meetingStartsAt <= now.getTime()) reasons.push("meeting_not_future");
      if (
        Number.isFinite(deliveryDeadline) && deliveryDeadline >= meetingStartsAt
      ) {
        reasons.push("delivery_must_precede_meeting");
      }
    }
    if (!d.meetingId) reasons.push("meeting_id_required");
  }
  if (!d.consentCurrent) reasons.push("consent_required");
  if (!d.eligible) reasons.push("not_eligible");
  return [...new Set(reasons)];
}

export async function preflight(
  d: IncidentDescriptor,
  a: ReleaseAdapter,
  now = new Date(),
): Promise<ReleaseState> {
  const errors = validateDescriptor(d, now);
  if (errors.length) {
    const state = errors.includes("window_expired") ? "expired" : "canceled";
    await a.save(d.idempotencyKey, state);
    return state;
  }
  const prior = await a.find(d.idempotencyKey);
  if (prior && TERMINAL_STATES.has(prior)) return prior;
  if (prior === "enqueued" || prior === "verifying") return prior;
  await a.save(d.idempotencyKey, "prepared");
  return "prepared";
}

export async function release(
  d: IncidentDescriptor,
  a: ReleaseAdapter,
  now = new Date(),
): Promise<ReleaseState> {
  const prior = await a.find(d.idempotencyKey);
  if (prior && TERMINAL_STATES.has(prior)) return prior;
  if (prior === "enqueued" || prior === "verifying") return prior;

  const releaseAt = parseTime(d.releaseAt);
  const releaseDeadline = parseTime(d.releaseDeadline);
  if (releaseAt > now.getTime()) {
    await a.save(d.idempotencyKey, "ready");
    return "ready";
  }
  if (!Number.isFinite(releaseDeadline) || releaseDeadline <= now.getTime()) {
    await a.save(d.idempotencyKey, "expired");
    return "expired";
  }

  await a.save(d.idempotencyKey, "remediating");
  const validation = await a.revalidate(d);
  if (invariantMismatch(validation)) {
    await a.save(d.idempotencyKey, "needs_approval");
    return "needs_approval";
  }
  if (operationallyIneligible(validation)) {
    await a.save(d.idempotencyKey, "expired");
    return "expired";
  }

  const evidence = await a.enqueueOfficialOnce(d);
  if (sentExactlyOnce(evidence)) {
    await a.save(d.idempotencyKey, "released", evidence);
    return "released";
  }
  if (
    ["pending", "processing", "already_exists"].includes(evidence.status) &&
    evidence.attempts <= 1 &&
    !evidence.providerMessageId
  ) {
    const state = evidence.outboxId ? "verifying" : "enqueued";
    await a.save(d.idempotencyKey, state, evidence);
    return state;
  }
  const state = evidence.attempts > 1 || evidence.providerMessageId
    ? "needs_approval"
    : "failed";
  await a.save(d.idempotencyKey, state, evidence);
  return state;
}

/** Verifica o envio aceito sem fazer retry, reprocessamento ou novo enqueue. */
export async function verifyDelivery(
  d: IncidentDescriptor,
  outboxId: string | undefined,
  a: ReleaseAdapter,
  now = new Date(),
): Promise<ReleaseState> {
  const evidence = await a.inspectOfficialDelivery(outboxId);
  if (sentExactlyOnce(evidence)) {
    await a.save(d.idempotencyKey, "released", evidence);
    return "released";
  }
  if (
    evidence.status === "sent" || evidence.attempts > 1 ||
    Boolean(evidence.providerMessageId)
  ) {
    await a.save(d.idempotencyKey, "needs_approval", evidence);
    return "needs_approval";
  }
  if (["failed", "canceled", "rejected"].includes(evidence.status)) {
    await a.save(d.idempotencyKey, "failed", evidence);
    return "failed";
  }
  if (parseTime(d.deliveryDeadline) <= now.getTime()) {
    await a.save(d.idempotencyKey, "failed", evidence);
    return "failed";
  }
  await a.save(d.idempotencyKey, "verifying", evidence);
  return "verifying";
}
