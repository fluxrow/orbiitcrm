import {
  classifyMeeting,
  type MeetingRow,
} from "./viver-meeting-guard.ts";
import {
  evaluateReminderDeliveryTime,
  evaluateViverMorningReminder,
  isMeetingReminderKind,
} from "./meeting-reminder-policy.ts";
export * from "./viver-meeting-guard.ts";

export const VIVER_MEETING_RESCHEDULE_NOTICE =
  "meeting_reschedule_notice";

export function isViverMeetingNotificationKind(value: unknown): boolean {
  return value === VIVER_MEETING_RESCHEDULE_NOTICE ||
    isMeetingReminderKind(value);
}

export function meetingIdFromFlowContext(
  context: Record<string, any> | null | undefined,
): string | null {
  const payload = context?.payload ?? context ?? {};
  const value = payload?.meeting_id ??
    (payload?.entity_type === "meeting" ? payload?.entity_id : null);
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value)
    ? value
    : null;
}

export function evaluateViverMeetingReminder(input: {
  reminderKind?: unknown;
  meetingId: string | null;
  meeting: MeetingRow | null;
  queryFailed?: boolean;
}, now = new Date()): { allowed: boolean; reason?: string } {
  const kind = String(input.reminderKind ?? "");
  const isRescheduleNotice = kind === VIVER_MEETING_RESCHEDULE_NOTICE;
  if (!kind.startsWith("meeting_reminder_") && !isRescheduleNotice) {
    return { allowed: true };
  }
  if (!input.meetingId) {
    return { allowed: false, reason: "meeting_reminder_invalid_meeting_id" };
  }
  if (input.queryFailed) {
    return { allowed: false, reason: "meeting_reminder_revalidation_failed" };
  }
  if (!input.meeting) {
    return { allowed: false, reason: "meeting_reminder_not_owned_by_viver" };
  }
  if (!/^https:\/\/meet\.google\.com\/[a-z0-9-]+(?:[/?#].*)?$/i.test(String(input.meeting.meeting_url ?? ""))) {
    return { allowed: false, reason: "meeting_reminder_authoritative_link_missing" };
  }
  const phase = classifyMeeting(input.meeting, now);
  if (phase !== "upcoming") {
    return { allowed: false, reason: `meeting_reminder_${phase}` };
  }
  // Aviso operacional de remarcação: não usa janela de offset, mas conserva
  // todos os gates autoritativos acima (tenant, reunião futura e Meet oficial).
  if (isRescheduleNotice) return { allowed: true };
  if (!isMeetingReminderKind(input.reminderKind)) {
    return { allowed: false, reason: "meeting_reminder_kind_not_supported" };
  }
  if (input.reminderKind === "meeting_reminder_morning") {
    return evaluateViverMorningReminder({
      scheduledAt: input.meeting.scheduled_at,
      createdAt: input.meeting.created_at,
      meetingKind: typeof input.meeting.metadata?.meeting_kind === "string"
        ? input.meeting.metadata.meeting_kind
        : null,
    }, now);
  }
  const timing = evaluateReminderDeliveryTime(
    input.reminderKind,
    input.meeting.scheduled_at,
    now,
  );
  return timing.allowed
    ? { allowed: true }
    : { allowed: false, reason: timing.reason };
}
