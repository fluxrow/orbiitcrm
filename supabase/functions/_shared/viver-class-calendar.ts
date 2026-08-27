export const VIVER_CLASS_WEEKDAY = "Tue";
export const VIVER_CLASS_HOUR = 19;
export const VIVER_CLASS_MINUTE = 30;
export const VIVER_CLASS_TIME_ZONE = "America/Sao_Paulo";

export type GoogleCalendarEvent = {
  id?: string;
  status?: string;
  start?: { dateTime?: string | null };
  hangoutLink?: string | null;
  conferenceData?: {
    entryPoints?: Array<{ entryPointType?: string; uri?: string }>;
  };
};

function normalizedUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/u, "");
  } catch {
    return null;
  }
}

function eventVideoUrls(event: GoogleCalendarEvent): string[] {
  const values = [
    event.hangoutLink,
    ...(event.conferenceData?.entryPoints || [])
      .filter((entry) => entry.entryPointType === "video")
      .map((entry) => entry.uri),
  ];
  return values.map(normalizedUrl).filter((value): value is string =>
    Boolean(value)
  );
}

function localStartParts(iso: string): {
  weekday: string;
  hour: number;
  minute: number;
} | null {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: VIVER_CLASS_TIME_ZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || "";
  return {
    weekday: value("weekday"),
    hour: Number(value("hour")),
    minute: Number(value("minute")),
  };
}

export function selectAuthoritativeViverClassEvent(
  events: GoogleCalendarEvent[],
  canonicalMeetUrl: string,
  now = new Date(),
): { event: GoogleCalendarEvent | null; reason?: string } {
  const canonical = normalizedUrl(canonicalMeetUrl);
  if (!canonical) {
    return { event: null, reason: "class_calendar_invalid_canonical_url" };
  }

  const candidates = events.filter((event) => {
    if (!event.id || event.status === "cancelled" || !event.start?.dateTime) {
      return false;
    }
    const start = new Date(event.start.dateTime);
    if (!Number.isFinite(start.getTime()) || start.getTime() <= now.getTime()) {
      return false;
    }
    const local = localStartParts(event.start.dateTime);
    if (!local) return false;
    return local.weekday === VIVER_CLASS_WEEKDAY &&
      local.hour === VIVER_CLASS_HOUR &&
      local.minute === VIVER_CLASS_MINUTE &&
      eventVideoUrls(event).includes(canonical);
  });

  if (candidates.length === 0) {
    return { event: null, reason: "class_calendar_event_not_found" };
  }
  if (candidates.length > 1) {
    return { event: null, reason: "class_calendar_event_ambiguous" };
  }
  return { event: candidates[0] };
}

export function viverClassLookupWindow(now = new Date()): {
  timeMin: string;
  timeMax: string;
} {
  return {
    timeMin: now.toISOString(),
    timeMax: new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000).toISOString(),
  };
}
