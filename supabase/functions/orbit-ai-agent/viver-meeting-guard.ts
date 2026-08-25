export const VIVER_EMPRESA_ID = "36f26579-66ad-4ef1-9788-141e4c727232";
export const VIVER_TIME_ZONE = "America/Sao_Paulo";

export type MeetingRow = {
  id: string;
  scheduled_at: string;
  duration_minutes?: number | null;
  status?: string | null;
  meeting_url?: string | null;
};

export type MeetingPhase = "upcoming" | "in_progress" | "expired" | "inactive";

export function meetingEndsAt(meeting: MeetingRow): Date {
  const duration = Number.isFinite(Number(meeting.duration_minutes)) && Number(meeting.duration_minutes) > 0
    ? Number(meeting.duration_minutes)
    : 60;
  return new Date(new Date(meeting.scheduled_at).getTime() + duration * 60_000);
}

export function classifyMeeting(meeting: MeetingRow, now = new Date()): MeetingPhase {
  if (!["scheduled", "rescheduled"].includes(String(meeting.status || ""))) return "inactive";
  const start = new Date(meeting.scheduled_at).getTime();
  const end = meetingEndsAt(meeting).getTime();
  const current = now.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "inactive";
  if (current < start) return "upcoming";
  if (current < end) return "in_progress";
  return "expired";
}

export function selectAuthoritativeMeeting(
  meetings: MeetingRow[],
  now = new Date(),
): { meeting: MeetingRow; phase: MeetingPhase } | null {
  const classified = meetings.map((meeting) => ({ meeting, phase: classifyMeeting(meeting, now) }));
  const upcoming = classified
    .filter((item) => item.phase === "upcoming")
    .sort((a, b) => +new Date(a.meeting.scheduled_at) - +new Date(b.meeting.scheduled_at))[0];
  if (upcoming) return upcoming;
  const inProgress = classified
    .filter((item) => item.phase === "in_progress")
    .sort((a, b) => +new Date(b.meeting.scheduled_at) - +new Date(a.meeting.scheduled_at))[0];
  if (inProgress) return inProgress;
  const expired = classified
    .filter((item) => item.phase === "expired")
    .sort((a, b) => meetingEndsAt(b.meeting).getTime() - meetingEndsAt(a.meeting).getTime())[0];
  return expired || null;
}

export function formatMeetingAuthorityBlock(
  selected: ReturnType<typeof selectAuthoritativeMeeting>,
  now = new Date(),
): string {
  const nowLocal = new Intl.DateTimeFormat("pt-BR", {
    timeZone: VIVER_TIME_ZONE, dateStyle: "full", timeStyle: "short",
  }).format(now);
  if (!selected) return `\nESTADO AUTORITATIVO DA REUNIÃO (VIVER): nenhuma reunião encontrada. Agora: ${nowLocal}. Não mencione reunião ou link como futuros.`;
  const startLocal = new Intl.DateTimeFormat("pt-BR", {
    timeZone: VIVER_TIME_ZONE, dateStyle: "full", timeStyle: "short",
  }).format(new Date(selected.meeting.scheduled_at));
  const endLocal = new Intl.DateTimeFormat("pt-BR", {
    timeZone: VIVER_TIME_ZONE, dateStyle: "full", timeStyle: "short",
  }).format(meetingEndsAt(selected.meeting));
  if (selected.phase === "upcoming") {
    return `\nESTADO AUTORITATIVO DA REUNIÃO (VIVER): FUTURA, id=${selected.meeting.id}, início=${startLocal}, término=${endLocal}, fuso=${VIVER_TIME_ZONE}. Só esta reunião pode ser tratada como futura.`;
  }
  if (selected.phase === "in_progress") {
    return `\nESTADO AUTORITATIVO DA REUNIÃO (VIVER): EM ANDAMENTO, id=${selected.meeting.id}, início=${startLocal}, término=${endLocal}. Não diga “até lá” nem “nos vemos”; o link só pode ser repetido se o lead pedir acesso durante a reunião.`;
  }
  return `\nESTADO AUTORITATIVO DA REUNIÃO (VIVER): ENCERRADA, id=${selected.meeting.id}, início=${startLocal}, término=${endLocal}. O status persistido pode estar atrasado, mas esta reunião é passada. Nunca diga “até lá”, “nos vemos”, nem reenvie o link. Responda em contexto pós-reunião ou encaminhe para atendimento humano; não invente novo agendamento.`;
}

const LINK_RE = /https?:\/\/[^\s]*(?:meet\.google\.com|zoom\.us|teams\.microsoft\.com)[^\s]*/iu;
const FUTURE_MEETING_RE = /(?:at[eé]\s+l[aá]|nos\s+vemos|reuni[aã]o\s+(?:est[aá]|ficou|segue)\s+(?:marcada|agendada)|call\s+(?:est[aá]|ficou)\s+(?:marcada|agendada)|aguardando\s+(?:a\s+)?reuni[aã]o)/iu;
const AGENDA_CONTENT_RE = /(?:reuni[aã]o|agendamento|hor[aá]rio|\bcall\b|\b(?:[01]?\d|2[0-3])[:h][0-5]\d\b|\b(?:segunda|ter[cç]a|quarta|quinta|sexta|s[aá]bado|domingo)(?:-feira)?\b)/iu;

function normalizedMeetingLinks(text: string): string[] {
  return (text.match(new RegExp(LINK_RE.source, "giu")) || [])
    .map((url) => url.replace(/[),.;!?]+$/u, ""));
}

const WEEKDAYS = ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"] as const;
const MONTHS: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

function normalizedWord(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function localMeetingParts(meeting: MeetingRow): { day: number; month: number; year: number; hour: number; minute: number; weekday: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: VIVER_TIME_ZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23", weekday: "short",
  }).formatToParts(new Date(meeting.scheduled_at));
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  const weekdayIndex = new Date(`${value("year")}-${value("month")}-${value("day")}T12:00:00Z`).getUTCDay();
  return {
    day: Number(value("day")), month: Number(value("month")), year: Number(value("year")),
    hour: Number(value("hour")), minute: Number(value("minute")), weekday: WEEKDAYS[weekdayIndex],
  };
}

export function buildCanonicalMeetingConfirmation(meeting: MeetingRow): string {
  const p = localMeetingParts(meeting);
  const weekdayBase = p.weekday === "terca" ? "terça" : p.weekday === "sabado" ? "sábado" : p.weekday;
  const weekday = ["domingo", "sábado"].includes(weekdayBase) ? weekdayBase : `${weekdayBase}-feira`;
  const date = `${String(p.day).padStart(2, "0")}/${String(p.month).padStart(2, "0")}/${p.year}`;
  const time = `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
  const duration = Number(meeting.duration_minutes) > 0 ? Number(meeting.duration_minutes) : 60;
  const link = meeting.meeting_url ? ` Link: ${meeting.meeting_url}` : "";
  return `Sua reunião está agendada para ${weekday}, ${date}, às ${time}, com duração de ${duration} minutos.${link}`;
}

export function temporalReferenceMatchesMeeting(text: string, meeting: MeetingRow): boolean {
  const p = localMeetingParts(meeting);
  const normalized = normalizedWord(text);
  const weekdays = normalized.match(/\b(?:domingo|segunda(?:-feira)?|terca(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|sabado)\b/g) || [];
  if (weekdays.some((value) => value.split("-")[0] !== p.weekday)) return false;

  const times = [...normalized.matchAll(/\b([01]?\d|2[0-3])(?::|h)([0-5]\d)?\b/g)];
  if (times.some((match) => Number(match[1]) !== p.hour || Number(match[2] || 0) !== p.minute)) return false;
  const plainTimes = [...normalized.matchAll(/\bas\s+([01]?\d|2[0-3])(?:\s*horas?)?\b/g)];
  if (plainTimes.some((match) => Number(match[1]) !== p.hour)) return false;

  const dates = [...normalized.matchAll(/\b(0?[1-9]|[12]\d|3[01])\/(0?[1-9]|1[0-2])(?:\/(\d{4}))?\b/g)];
  if (dates.some((match) => Number(match[1]) !== p.day || Number(match[2]) !== p.month || (match[3] && Number(match[3]) !== p.year))) return false;
  const isoDates = [...normalized.matchAll(/\b(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])\b/g)];
  if (isoDates.some((match) => Number(match[1]) !== p.year || Number(match[2]) !== p.month || Number(match[3]) !== p.day)) return false;
  const writtenDates = [...normalized.matchAll(/\b(0?[1-9]|[12]\d|3[01])\s+de\s+(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+de\s+(\d{4}))?\b/g)];
  if (writtenDates.some((match) => Number(match[1]) !== p.day || MONTHS[match[2]] !== p.month || (match[3] && Number(match[3]) !== p.year))) return false;
  return weekdays.length + times.length + plainTimes.length + dates.length + isoDates.length + writtenDates.length > 0;
}

function containsTemporalReference(text: string): boolean {
  const normalized = normalizedWord(text);
  return /\b(?:domingo|segunda(?:-feira)?|terca(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|sabado)\b|\b(?:[01]?\d|2[0-3])(?::|h)(?:[0-5]\d)?\b|\bas\s+(?:[01]?\d|2[0-3])(?:\s*horas?)?\b|\b(?:0?[1-9]|[12]\d|3[01])\/(?:0?[1-9]|1[0-2])(?:\/\d{4})?\b|\b\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])\b|\b(?:0?[1-9]|[12]\d|3[01])\s+de\s+(?:janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+de\s+\d{4})?\b/u.test(normalized);
}

export function referencesFutureMeetingOrLink(text: string): boolean {
  return LINK_RE.test(text || "") || FUTURE_MEETING_RE.test(text || "");
}

export function mentionsAgendaContent(text: string): boolean {
  return referencesFutureMeetingOrLink(text) || AGENDA_CONTENT_RE.test(text || "");
}

export function enforceFreshMeetingState(
  text: string,
  selected: ReturnType<typeof selectAuthoritativeMeeting>,
  options: { latestInboundAskedForLink?: boolean; revalidationFailed?: boolean } = {},
): { text: string; changed: boolean; reason?: string } {
  if (options.revalidationFailed) {
    if (!mentionsAgendaContent(text)) return { text, changed: false };
    return {
      text: "Não consegui confirmar os dados da reunião agora. Você quer que eu peça à equipe para verificar o próximo passo?",
      changed: true,
      reason: "meeting_revalidation_failed",
    };
  }

  const links = normalizedMeetingLinks(text);
  const hasLink = links.length > 0;
  const exactAuthoritativeLink = Boolean(
    selected?.meeting.meeting_url && links.every((link) => link === selected.meeting.meeting_url),
  );

  if (selected?.phase === "upcoming") {
    if (hasLink && !exactAuthoritativeLink) {
      return { text: buildCanonicalMeetingConfirmation(selected.meeting), changed: true, reason: "non_authoritative_meeting_link" };
    }
    if (containsTemporalReference(text) && !temporalReferenceMatchesMeeting(text, selected.meeting)) {
      return { text: buildCanonicalMeetingConfirmation(selected.meeting), changed: true, reason: "non_authoritative_meeting_time" };
    }
    return { text, changed: false };
  } else if (selected?.phase === "in_progress") {
    if (hasLink && exactAuthoritativeLink && options.latestInboundAskedForLink === true) {
      return { text, changed: false };
    }
    if (!hasLink && !referencesFutureMeetingOrLink(text)) return { text, changed: false };
  } else if (!referencesFutureMeetingOrLink(text)) {
    return { text, changed: false };
  }

  return {
    text: selected?.phase === "expired"
      ? "Essa reunião já encerrou. Você quer que eu peça à equipe para verificar o próximo passo?"
      : "Não consegui confirmar um link válido para essa reunião. Você quer que eu peça à equipe para verificar o próximo passo?",
    changed: true,
    reason: selected?.phase === "expired"
      ? "expired_meeting"
      : hasLink && !exactAuthoritativeLink
      ? "non_authoritative_meeting_link"
      : selected?.phase === "in_progress"
      ? "in_progress_link_not_requested"
      : "no_upcoming_meeting",
  };
}

export function inboundExplicitlyRequestsMeetingLink(text: string): boolean {
  return /(?:aguardando|esperando).{0,25}(?:o\s+)?link|onde.{0,20}(?:est[aá]|fica).{0,15}(?:o\s+)?link|(?:me\s+)?(?:passa|manda|envia|reenvia).{0,20}(?:o\s+)?link|n[aã]o\s+(?:recebi|chegou).{0,20}(?:o\s+)?link|como\s+(?:eu\s+)?(?:entro|acesso).{0,25}(?:reuni[aã]o|meet|call)|(?:link|acesso).{0,35}(?:reuni[aã]o|meet|call)|(?:cad[eê]|qual).{0,20}(?:o\s+)?link/iu.test(text || "");
}

export function expiredMeetingIdsForReconciliation(meetings: MeetingRow[], now = new Date()): string[] {
  return meetings.filter((meeting) => classifyMeeting(meeting, now) === "expired").map((meeting) => meeting.id);
}

export function shouldCancelPastReminder(input: { scheduledFor: string; meeting: MeetingRow }, now = new Date()): boolean {
  return new Date(input.scheduledFor).getTime() <= now.getTime() || classifyMeeting(input.meeting, now) === "expired";
}
