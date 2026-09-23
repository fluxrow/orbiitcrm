// One-off, tenant-scoped reminder for the Viver class on 2026-09-23.
// A distinct operation/kind prevents an ad-hoc reminder from masquerading as
// a normal meeting offset or an inbound reply.
export const VIVER_CLASS_SAME_DAY_OPERATION =
  "viver_group_class_same_day_reminder_2026_09_23";
export const VIVER_CLASS_SAME_DAY_KIND = "meeting_reminder_class_same_day";
export const VIVER_CLASS_SAME_DAY_BATCH = "viver_class_1930_2026_09_23";
export const VIVER_CLASS_SAME_DAY_TEMPLATE_ID =
  "a99dd789-402a-4121-a5d6-2bb5b202462a";
export const VIVER_CLASS_SAME_DAY_MIN_GAP_MS = 60_000;
export const VIVER_CLASS_SAME_DAY_TARGETS = [
  "070ca3c9-8d62-4289-a4db-54f9d6554de7",
  "7128c35b-6fa9-434a-96da-7bfd786d718d",
  "7fce9417-f64d-43cb-b4be-e100c65859a7",
  "baa586d6-b7a2-4f72-8329-4cffec8523f6",
] as const;

const VIVER_ID = "36f26579-66ad-4ef1-9788-141e4c727232";

function localParts(value: Date): { date: string; hour: number; minute: number } | null {
  if (!Number.isFinite(value.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(value);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
    minute: Number(get("minute")),
  };
}

export function isControlledViverClassSameDayReminder(item: any): boolean {
  const meta = item?.metadata;
  const sequence = Number(meta?.sequence);
  return String(item?.empresa_id ?? "") === VIVER_ID &&
    item?.source_type === "meeting_confirmation" &&
    meta?.operation === VIVER_CLASS_SAME_DAY_OPERATION &&
    meta?.reminder_kind === VIVER_CLASS_SAME_DAY_KIND &&
    meta?.batch_id === VIVER_CLASS_SAME_DAY_BATCH &&
    meta?.template_id === VIVER_CLASS_SAME_DAY_TEMPLATE_ID &&
    meta?.simulate !== true && Number(item?.max_attempts) === 1 &&
    typeof meta?.meeting_id === "string" &&
    typeof meta?.consent_message_id === "string" &&
    item?.idempotency_key ===
      `viver:class-same-day:2026-09-23:${meta.meeting_id}` &&
    Number.isInteger(sequence) && sequence >= 1 &&
    sequence <= VIVER_CLASS_SAME_DAY_TARGETS.length &&
    VIVER_CLASS_SAME_DAY_TARGETS[sequence - 1] === meta.meeting_id;
}

export function classSameDayWindowAllowed(
  meeting: { scheduled_at?: string; metadata?: any } | null,
  now = new Date(),
): boolean {
  const scheduled = localParts(new Date(String(meeting?.scheduled_at ?? "")));
  const current = localParts(now);
  if (!scheduled || !current) return false;
  const minute = current.hour * 60 + current.minute;
  return meeting?.metadata?.meeting_kind === "viver_group_class" &&
    scheduled.date === "2026-09-23" && current.date === scheduled.date &&
    scheduled.hour === 19 && scheduled.minute === 30 &&
    minute >= 9 * 60 && minute < 18 * 60 &&
    Date.parse(String(meeting.scheduled_at)) > now.getTime();
}

export function classReminderPredecessorWaitMs(
  sequence: number,
  prior: { status?: string; provider_message_id?: string | null; sent_at?: string | null } | null,
  now = new Date(),
): number {
  if (sequence === 1) return 0;
  const sent = Date.parse(String(prior?.sent_at ?? ""));
  if (prior?.status !== "sent" || !prior.provider_message_id || !Number.isFinite(sent)) {
    return 60_000;
  }
  return Math.max(0, sent + VIVER_CLASS_SAME_DAY_MIN_GAP_MS - now.getTime());
}
