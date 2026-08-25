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

export function referencesFutureMeetingOrLink(text: string): boolean {
  return LINK_RE.test(text || "") || FUTURE_MEETING_RE.test(text || "");
}

export function enforceFreshMeetingState(
  text: string,
  selected: ReturnType<typeof selectAuthoritativeMeeting>,
): { text: string; changed: boolean; reason?: string } {
  if (!referencesFutureMeetingOrLink(text)) return { text, changed: false };
  if (selected?.phase === "upcoming") return { text, changed: false };
  if (selected?.phase === "in_progress" && LINK_RE.test(text)) return { text, changed: false };
  return {
    text: "Essa reunião já encerrou. Vou encaminhar seu retorno para o atendimento humano verificar o próximo passo com você, sem criar um novo horário automaticamente.",
    changed: true,
    reason: selected?.phase === "expired" ? "expired_meeting" : "no_upcoming_meeting",
  };
}

export function expiredMeetingIdsForReconciliation(meetings: MeetingRow[], now = new Date()): string[] {
  return meetings.filter((meeting) => classifyMeeting(meeting, now) === "expired").map((meeting) => meeting.id);
}

export function shouldCancelPastReminder(input: { scheduledFor: string; meeting: MeetingRow }, now = new Date()): boolean {
  return new Date(input.scheduledFor).getTime() <= now.getTime() || classifyMeeting(input.meeting, now) === "expired";
}
