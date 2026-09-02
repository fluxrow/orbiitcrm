export const OUTBOX_BUSINESS_TIME_ZONE = "America/Sao_Paulo";
export const OUTBOX_BUSINESS_HOUR_START = 8;
export const OUTBOX_BUSINESS_HOUR_END = 20;
export const FLOW_OUTBOX_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const FOLLOWUP_AGING_AFTER_MS = 30 * 60 * 1000;
export const FOLLOWUP_AGED_PRIORITY = 71;
export const BULLINK_EMPRESA_ID = "4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18";
export const VIVER_SEMIJOIAS_EMPRESA_ID = "36f26579-66ad-4ef1-9788-141e4c727232";

const EXPIRABLE_FLOW_SOURCES = new Set(["flow_initial", "flow_followup"]);
const ESSENTIAL_FLOW_REPAIR_TENANTS = new Set([
  BULLINK_EMPRESA_ID,
  VIVER_SEMIJOIAS_EMPRESA_ID,
]);

export function usesEssentialFlowDeliveryRepair(empresaId: string | null | undefined): boolean {
  return Boolean(empresaId && ESSENTIAL_FLOW_REPAIR_TENANTS.has(empresaId));
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function zonedParts(date: Date): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: OUTBOX_BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  return {
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: read("hour"),
    minute: read("minute"),
    second: read("second"),
  };
}

function zonedLocalToUtc(parts: ZonedParts): Date {
  const target = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  let guess = target;
  for (let i = 0; i < 3; i += 1) {
    const actual = zonedParts(new Date(guess));
    const represented = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    guess += target - represented;
  }
  return new Date(guess);
}

export function isOutboxBusinessWindow(now = new Date()): boolean {
  const { hour } = zonedParts(now);
  return hour >= OUTBOX_BUSINESS_HOUR_START && hour < OUTBOX_BUSINESS_HOUR_END;
}

export function nextOutboxBusinessOpening(now = new Date()): Date {
  const local = zonedParts(now);
  if (local.hour < OUTBOX_BUSINESS_HOUR_START) {
    return zonedLocalToUtc({
      ...local,
      hour: OUTBOX_BUSINESS_HOUR_START,
      minute: 0,
      second: 0,
    });
  }

  const nextLocalDay = new Date(Date.UTC(local.year, local.month - 1, local.day + 1));
  return zonedLocalToUtc({
    year: nextLocalDay.getUTCFullYear(),
    month: nextLocalDay.getUTCMonth() + 1,
    day: nextLocalDay.getUTCDate(),
    hour: OUTBOX_BUSINESS_HOUR_START,
    minute: 0,
    second: 0,
  });
}

export function isStaleFlowOutbox(
  sourceType: string | null | undefined,
  scheduledFor: string | null | undefined,
  now = new Date(),
): boolean {
  if (!sourceType || !EXPIRABLE_FLOW_SOURCES.has(sourceType) || !scheduledFor) return false;
  const scheduledMs = Date.parse(scheduledFor);
  return Number.isFinite(scheduledMs) && scheduledMs <= now.getTime() - FLOW_OUTBOX_MAX_AGE_MS;
}

export function effectiveOutboxPriority(item: {
  empresa_id?: string | null;
  source_type?: string | null;
  scheduled_for?: string | null;
  priority?: number | null;
}, now = new Date()): number {
  const storedPriority = Number(item.priority) || 0;
  if (!usesEssentialFlowDeliveryRepair(item.empresa_id)) return storedPriority;
  if (item.source_type !== "flow_followup" || !item.scheduled_for) return storedPriority;
  const scheduledMs = Date.parse(item.scheduled_for);
  if (!Number.isFinite(scheduledMs)) return storedPriority;
  const ageMs = now.getTime() - scheduledMs;
  if (ageMs < FOLLOWUP_AGING_AFTER_MS || ageMs >= FLOW_OUTBOX_MAX_AGE_MS) return storedPriority;
  return Math.max(storedPriority, FOLLOWUP_AGED_PRIORITY);
}
