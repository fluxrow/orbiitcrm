import { TENANTS } from "./remediation-playbooks.ts";

export type ReleaseKind =
  | "meeting_reminder_24h"
  | "meeting_reminder_1h"
  | "meeting_reminder_5m"
  | "weekly_reminder"
  | "follow_up";
export type ReleaseState =
  | "prepared"
  | "remediating"
  | "ready"
  | "released"
  | "expired"
  | "canceled";
export type IncidentDescriptor = {
  tenantId: string;
  entityId: string;
  eventId: string;
  idempotencyKey: string;
  kind: ReleaseKind;
  originalAt: string;
  windowStart: string;
  deadline: string;
  eligible: boolean;
  consentCurrent: boolean;
  conversationId: string;
  templateId: string;
  canonicalLinkHash?: string;
};
export type ReleaseAdapter = {
  find: (key: string) => Promise<ReleaseState | null>;
  save: (key: string, state: ReleaseState) => Promise<void>;
  revalidate: (
    d: IncidentDescriptor,
  ) => Promise<
    {
      eligible: boolean;
      consentCurrent: boolean;
      linkOk: boolean;
      meetingFuture: boolean;
      noDuplicate: boolean;
    }
  >;
  enqueueOfficialOnce: (
    d: IncidentDescriptor,
  ) => Promise<
    {
      status: "sent" | "already_exists";
      providerMessageId?: string;
      attempts: number;
    }
  >;
};

const LIMITS: Record<ReleaseKind, [number, number]> = {
  meeting_reminder_24h: [23 * 60 * 60_000, 25 * 60 * 60_000],
  meeting_reminder_1h: [50 * 60_000, 90 * 60_000],
  meeting_reminder_5m: [10 * 60_000, 30 * 60_000],
  weekly_reminder: [15 * 60_000, 60 * 60_000],
  follow_up: [5 * 60_000, 20 * 60_000],
};

export function validateDescriptor(
  d: IncidentDescriptor,
  now = new Date(),
): string[] {
  const r: string[] = [];
  if (
    ![TENANTS.bullink, TENANTS.viver].includes(
      d.tenantId as (typeof TENANTS)[keyof typeof TENANTS],
    )
  ) {
    r.push("tenant_not_allowlisted");
  }
  if (!d.entityId || !d.eventId || !d.idempotencyKey) {
    r.push("correlation_required");
  }
  const t = new Date(d.originalAt).getTime(),
    s = new Date(d.windowStart).getTime(),
    end = new Date(d.deadline).getTime();
  const [min, max] = LIMITS[d.kind];
  if (!Number.isFinite(t) || !Number.isFinite(s) || !Number.isFinite(end)) {
    r.push("temporal_fields_invalid");
  } else if (end <= now.getTime() || end - s < min || end - s > max) {
    r.push("window_outside_safe_limits");
  }
  if (d.kind !== "follow_up" && !d.consentCurrent) r.push("consent_required");
  if (!d.eligible) r.push("not_eligible");
  return r;
}

export async function preflight(
  d: IncidentDescriptor,
  a: ReleaseAdapter,
  now = new Date(),
): Promise<ReleaseState> {
  const errors = validateDescriptor(d, now);
  if (errors.length) {
    await a.save(d.idempotencyKey, "canceled");
    return "canceled";
  }
  const prior = await a.find(d.idempotencyKey);
  if (prior && ["released", "expired", "canceled"].includes(prior)) {
    return prior;
  }
  await a.save(d.idempotencyKey, "prepared");
  return "prepared";
}

export async function release(
  d: IncidentDescriptor,
  a: ReleaseAdapter,
  now = new Date(),
): Promise<ReleaseState> {
  const prior = await a.find(d.idempotencyKey);
  if (prior === "released" || prior === "expired" || prior === "canceled") {
    return prior;
  }
  if (new Date(d.originalAt).getTime() > now.getTime()) return "ready";
  if (new Date(d.deadline).getTime() <= now.getTime()) {
    await a.save(d.idempotencyKey, "expired");
    return "expired";
  }
  await a.save(d.idempotencyKey, "remediating");
  const v = await a.revalidate(d);
  if (
    !v.eligible || !v.consentCurrent || !v.linkOk || !v.meetingFuture ||
    !v.noDuplicate
  ) {
    await a.save(d.idempotencyKey, "expired");
    return "expired";
  }
  const sent = await a.enqueueOfficialOnce(d);
  if (
    sent.attempts !== 1 || !["sent", "already_exists"].includes(sent.status)
  ) {
    await a.save(d.idempotencyKey, "expired");
    return "expired";
  }
  await a.save(d.idempotencyKey, "released");
  return "released";
}
