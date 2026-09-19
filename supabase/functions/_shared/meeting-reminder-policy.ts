export type MeetingReminderKind =
  | "meeting_reminder_24h"
  | "meeting_reminder_1h"
  | "meeting_reminder_15m"
  | "meeting_reminder_5m"
  | "meeting_reminder_morning";

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
    kind: "meeting_reminder_15m",
    offsetMs: 15 * 60 * 1000,
    toleranceMs: 2 * 60 * 1000,
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
  return value === "meeting_reminder_morning" ||
    MEETING_REMINDER_WINDOWS.some((window) => window.kind === value);
}

type LocalParts = { date: string; hour: number; minute: number };

function saoPauloParts(date: Date): LocalParts | null {
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

/** Same-day Viver reminder: 09:00–09:10 emission, 09:00–09:30 delivery. */
export function isViverMorningWindow(
  now = new Date(),
  phase: "emit" | "delivery" = "delivery",
): boolean {
  const current = saoPauloParts(now);
  if (!current) return false;
  const minuteOfDay = current.hour * 60 + current.minute;
  const windowEnd = phase === "emit" ? 9 * 60 + 10 : 9 * 60 + 30;
  return minuteOfDay >= 9 * 60 && minuteOfDay < windowEnd;
}

export function evaluateViverMorningReminder(input: {
  scheduledAt: string;
  createdAt?: string | null;
  meetingKind?: string | null;
}, now = new Date(), phase: "emit" | "delivery" = "delivery"):
  { allowed: boolean; reason?: string } {
  const scheduled = saoPauloParts(new Date(input.scheduledAt));
  const created = input.createdAt ? saoPauloParts(new Date(input.createdAt)) : null;
  const current = saoPauloParts(now);
  if (!scheduled || !created || !current) {
    return { allowed: false, reason: "meeting_reminder_invalid_time" };
  }
  if (input.meetingKind === "viver_group_class") {
    return { allowed: false, reason: "meeting_reminder_group_class_excluded" };
  }
  if (scheduled.date !== current.date || scheduled.hour < 13 || scheduled.hour >= 17) {
    return { allowed: false, reason: "meeting_reminder_not_today_afternoon" };
  }
  if (!isViverMorningWindow(now, phase)) {
    return { allowed: false, reason: "meeting_reminder_outside_delivery_window" };
  }
  if (created.date > current.date ||
    (created.date === current.date && created.hour * 60 + created.minute >= 9 * 60)) {
    return { allowed: false, reason: "meeting_reminder_booked_after_morning_window" };
  }
  return { allowed: true };
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
  const window = MEETING_REMINDER_WINDOWS.find((item) => item.kind === kind);
  if (!window) {
    return { allowed: false, reason: "meeting_reminder_kind_not_offset_based", remainingMs };
  }
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
