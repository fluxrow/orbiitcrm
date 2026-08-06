type Json = Record<string, unknown>;

const DEFAULT_TIMEZONE = "America/Sao_Paulo";

function resolveTimezone(timezone?: string | null): string {
  const candidate = timezone?.trim() || DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

export function buildMeetingTemplateVars(
  payload: Json | null | undefined,
  configuredTimezone?: string | null,
): Json {
  const scheduledAt = typeof payload?.scheduled_at === "string" ? payload.scheduled_at : "";
  if (!scheduledAt) return {};

  const date = new Date(scheduledAt);
  if (Number.isNaN(date.getTime())) return {};

  const timezone = resolveTimezone(configuredTimezone);
  const dataReuniao = new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
  const horaReuniao = new Intl.DateTimeFormat("pt-BR", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);

  const meetingUrl =
    (typeof payload?.meeting_url === "string" && payload.meeting_url) ||
    (typeof payload?.meet_link === "string" && payload.meet_link) ||
    (typeof payload?.link_reuniao === "string" && payload.link_reuniao) ||
    "";

  return {
    scheduled_at: date.toISOString(),
    data_reuniao: dataReuniao,
    hora_reuniao: horaReuniao,
    data_hora_reuniao: `${dataReuniao} às ${horaReuniao}`,
    link_reuniao: meetingUrl,
    titulo_reuniao: typeof payload?.titulo === "string" ? payload.titulo : "",
    duracao_reuniao_minutos:
      typeof payload?.duration_minutes === "number" ? payload.duration_minutes : "",
    timezone_reuniao: timezone,
  };
}
