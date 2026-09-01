import type { IncidentDescriptor, ReleaseKind } from "./remediation-release.ts";
import {
  MEETING_REMINDER_WINDOWS,
  type MeetingReminderKind,
} from "./meeting-reminder-policy.ts";

const minute = 60_000;

export type FollowUpPreflightInput = {
  tenantId: string;
  scheduledActionId: string;
  flowRunId: string;
  prospectId: string;
  dealId?: string | null;
  conversationId: string;
  templateId: string;
  scheduledFor: string;
  recipientAuthority: string;
  contentAuthority: unknown;
};

export type MeetingReminderPreflightInput = {
  tenantId: string;
  meetingId: string;
  prospectId: string;
  dealId?: string | null;
  conversationId: string;
  templateId: string;
  scheduledAt: string;
  kind: MeetingReminderKind;
  recipientAuthority: string;
  contentAuthority: unknown;
  canonicalLinkAuthority: string;
};

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b));
    return `{${
      entries.map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`).join(",")
    }}`;
  }
  return JSON.stringify(value);
}

export async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function fingerprintRecipient(
  tenantId: string,
  prospectId: string,
  recipientAuthority: string,
): Promise<string> {
  return sha256(`${tenantId}|${prospectId}|${recipientAuthority}`);
}

export function fingerprintContent(
  templateId: string,
  contentAuthority: unknown,
): Promise<string> {
  return sha256(`${templateId}|${stableJson(contentAuthority)}`);
}

function finiteIso(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function descriptorBase(
  input: {
    tenantId: string;
    entityId: string;
    eventId: string;
    kind: ReleaseKind;
    releaseAt: number;
    releaseGraceMs: number;
    now: Date;
    prospectId: string;
    dealId?: string | null;
    conversationId: string;
    templateId: string;
    recipientHash: string;
    contentHash: string;
  },
): IncidentDescriptor {
  const idempotencyKey = [
    "orbit-remediation-v1",
    input.tenantId,
    input.kind,
    input.eventId,
  ].join("|");
  return {
    descriptorVersion: 1,
    tenantId: input.tenantId,
    entityId: input.entityId,
    eventId: input.eventId,
    idempotencyKey,
    kind: input.kind,
    preflightAt: input.now.toISOString(),
    releaseAt: new Date(input.releaseAt).toISOString(),
    releaseDeadline: new Date(input.releaseAt + input.releaseGraceMs)
      .toISOString(),
    deliveryDeadline: new Date(input.releaseAt + input.releaseGraceMs)
      .toISOString(),
    eligible: true,
    consentCurrent: true,
    conversationId: input.conversationId,
    templateId: input.templateId,
    prospectId: input.prospectId,
    dealId: input.dealId ?? null,
    recipientHash: input.recipientHash,
    contentHash: input.contentHash,
  };
}

export async function buildFollowUpDescriptor(
  input: FollowUpPreflightInput,
  now = new Date(),
): Promise<IncidentDescriptor | null> {
  const releaseAt = finiteIso(input.scheduledFor);
  if (releaseAt === null) return null;
  const lead = releaseAt - now.getTime();
  if (lead < 5 * minute || lead > 15 * minute) return null;
  const descriptor = descriptorBase({
    tenantId: input.tenantId,
    entityId: input.scheduledActionId,
    eventId: input.flowRunId,
    kind: "follow_up",
    releaseAt,
    releaseGraceMs: 10 * minute,
    now,
    prospectId: input.prospectId,
    dealId: input.dealId,
    conversationId: input.conversationId,
    templateId: input.templateId,
    recipientHash: await fingerprintRecipient(
      input.tenantId,
      input.prospectId,
      input.recipientAuthority,
    ),
    contentHash: await fingerprintContent(
      input.templateId,
      input.contentAuthority,
    ),
  });
  return {
    ...descriptor,
    scheduledActionId: input.scheduledActionId,
    flowRunId: input.flowRunId,
  };
}

export async function buildMeetingReminderDescriptor(
  input: MeetingReminderPreflightInput,
  now = new Date(),
): Promise<IncidentDescriptor | null> {
  const meetingAt = finiteIso(input.scheduledAt);
  if (meetingAt === null) return null;
  const window = MEETING_REMINDER_WINDOWS.find((item) =>
    item.kind === input.kind
  );
  if (!window) return null;
  const releaseAt = meetingAt - window.offsetMs;
  const lead = releaseAt - now.getTime();
  const requiredLead = input.kind === "meeting_reminder_5m"
    ? [8 * minute, 12 * minute]
    : [10 * minute, 20 * minute];
  if (lead < requiredLead[0] || lead > requiredLead[1]) return null;
  const grace = input.kind === "meeting_reminder_5m" ? 2 * minute : 10 * minute;
  const eventId = `${input.meetingId}:${input.kind}`;
  const descriptor = descriptorBase({
    tenantId: input.tenantId,
    entityId: input.meetingId,
    eventId,
    kind: input.kind,
    releaseAt,
    releaseGraceMs: grace,
    now,
    prospectId: input.prospectId,
    dealId: input.dealId,
    conversationId: input.conversationId,
    templateId: input.templateId,
    recipientHash: await fingerprintRecipient(
      input.tenantId,
      input.prospectId,
      input.recipientAuthority,
    ),
    contentHash: await fingerprintContent(
      input.templateId,
      input.contentAuthority,
    ),
  });
  return {
    ...descriptor,
    meetingId: input.meetingId,
    meetingStartsAt: new Date(meetingAt).toISOString(),
    canonicalLinkHash: await sha256(input.canonicalLinkAuthority),
  };
}
