export type MeetingReminderKind =
  | "meeting_reminder_24h"
  | "meeting_reminder_1h"
  | "meeting_reminder_5m";

export const MEETING_REMINDER_WINDOWS: ReadonlyArray<{
  kind: MeetingReminderKind;
  offsetMs: number;
  toleranceMs: number;
}> = [
  {
    kind: "meeting_reminder_24h",
    offsetMs: 24 * 60 * 60 * 1000,
    toleranceMs: 10 * 60 * 1000,
  },
  {
    kind: "meeting_reminder_1h",
    offsetMs: 60 * 60 * 1000,
    toleranceMs: 10 * 60 * 1000,
  },
  {
    kind: "meeting_reminder_5m",
    offsetMs: 5 * 60 * 1000,
    toleranceMs: 2 * 60 * 1000,
  },
] as const;

export function isMeetingReminderKind(
  value: unknown,
): value is MeetingReminderKind {
  return MEETING_REMINDER_WINDOWS.some((window) => window.kind === value);
}

export function evaluateReminderDeliveryTime(
  kind: MeetingReminderKind,
  scheduledAt: string,
  now = new Date(),
): { allowed: boolean; reason?: string; remainingMs: number } {
  const meetingMs = Date.parse(scheduledAt);
  const remainingMs = meetingMs - now.getTime();
  if (!Number.isFinite(meetingMs)) {
    return {
      allowed: false,
      reason: "meeting_reminder_invalid_scheduled_at",
      remainingMs,
    };
  }
  const window = MEETING_REMINDER_WINDOWS.find((item) => item.kind === kind)!;
  if (remainingMs <= 0) {
    return { allowed: false, reason: "meeting_reminder_expired", remainingMs };
  }
  if (Math.abs(remainingMs - window.offsetMs) > window.toleranceMs) {
    return {
      allowed: false,
      reason: "meeting_reminder_outside_delivery_window",
      remainingMs,
    };
  }
  return { allowed: true, remainingMs };
}
