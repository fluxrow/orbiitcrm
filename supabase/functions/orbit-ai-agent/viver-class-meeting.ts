export const VIVER_CLASS_DURATION_MINUTES = 90;
export const VIVER_CLASS_MEETING_KIND = "viver_group_class";
export const VIVER_CLASS_TIME_ZONE = "America/Sao_Paulo";

export type ViverClassMeetingInsert = {
  empresa_id: string;
  prospect_id: string;
  conversa_id: string;
  titulo: string;
  descricao: string;
  scheduled_at: string;
  duration_minutes: number;
  meeting_url: string;
  status: "scheduled";
  metadata: {
    meeting_kind: typeof VIVER_CLASS_MEETING_KIND;
    class_occurrence_key: string;
    consent_message_id: string;
    consent_source: "whatsapp_explicit_acceptance";
  };
};

type SaoPauloParts = {
  year: number;
  month: number;
  day: number;
  weekday: string;
  hour: number;
  minute: number;
};

function saoPauloParts(date: Date): SaoPauloParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: VIVER_CLASS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || "";
  return {
    year: Number(value("year")),
    month: Number(value("month")),
    day: Number(value("day")),
    weekday: value("weekday"),
    hour: Number(value("hour")),
    minute: Number(value("minute")),
  };
}

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/**
 * Próxima terça-feira às 19h30 em São Paulo.
 * São Paulo não usa horário de verão desde 2019; 19h30 local é 22h30 UTC.
 */
export function nextViverClassStart(now = new Date()): Date {
  const local = saoPauloParts(now);
  const weekday = WEEKDAY_INDEX[local.weekday];
  if (!Number.isInteger(weekday)) {
    throw new Error("viver_class_invalid_weekday");
  }
  let daysUntilTuesday = (2 - weekday + 7) % 7;
  if (
    daysUntilTuesday === 0 &&
    (local.hour > 19 || (local.hour === 19 && local.minute >= 30))
  ) {
    daysUntilTuesday = 7;
  }
  return new Date(Date.UTC(
    local.year,
    local.month - 1,
    local.day + daysUntilTuesday,
    22,
    30,
    0,
    0,
  ));
}

export function viverClassOccurrenceKey(start: Date): string {
  const local = saoPauloParts(start);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${local.year}-${pad(local.month)}-${pad(local.day)}T19:30:00-03:00`;
}

export function buildViverClassMeetingInsert(input: {
  empresaId: string;
  prospectId: string;
  conversaId: string;
  consentMessageId: string;
  canonicalMeetUrl: string;
  now?: Date;
}): ViverClassMeetingInsert {
  if (
    !/^https:\/\/meet\.google\.com\/[a-z0-9-]+(?:[/?#].*)?$/iu.test(
      input.canonicalMeetUrl,
    )
  ) {
    throw new Error("viver_class_invalid_canonical_url");
  }
  if (!/^[0-9a-f-]{36}$/iu.test(input.consentMessageId)) {
    throw new Error("viver_class_invalid_consent_message");
  }
  const start = nextViverClassStart(input.now);
  return {
    empresa_id: input.empresaId,
    prospect_id: input.prospectId,
    conversa_id: input.conversaId,
    titulo: "Aula em grupo Viver Semijoias",
    descricao: "Participação confirmada por aceite explícito no WhatsApp.",
    scheduled_at: start.toISOString(),
    duration_minutes: VIVER_CLASS_DURATION_MINUTES,
    meeting_url: input.canonicalMeetUrl,
    status: "scheduled",
    metadata: {
      meeting_kind: VIVER_CLASS_MEETING_KIND,
      class_occurrence_key: viverClassOccurrenceKey(start),
      consent_message_id: input.consentMessageId,
      consent_source: "whatsapp_explicit_acceptance",
    },
  };
}

export async function ensureViverClassMeeting(
  supabase: any,
  input: Parameters<typeof buildViverClassMeetingInsert>[0],
): Promise<{ meetingId: string; created: boolean; scheduledAt: string }> {
  const row = buildViverClassMeetingInsert(input);
  const { data: existing, error: lookupError } = await supabase
    .from("orbit_meetings")
    .select("id, scheduled_at, status")
    .eq("empresa_id", row.empresa_id)
    .eq("prospect_id", row.prospect_id)
    .contains("metadata", {
      meeting_kind: VIVER_CLASS_MEETING_KIND,
      class_occurrence_key: row.metadata.class_occurrence_key,
    })
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (existing?.id) {
    if (!["scheduled", "rescheduled"].includes(existing.status)) {
      throw new Error("viver_class_existing_participation_not_active");
    }
    return {
      meetingId: existing.id,
      created: false,
      scheduledAt: existing.scheduled_at,
    };
  }

  const { data: created, error: insertError } = await supabase
    .from("orbit_meetings")
    .insert(row)
    .select("id, scheduled_at")
    .single();
  if (insertError?.code === "23505") {
    const { data: raced, error: racedError } = await supabase
      .from("orbit_meetings")
      .select("id, scheduled_at, status")
      .eq("empresa_id", row.empresa_id)
      .eq("prospect_id", row.prospect_id)
      .contains("metadata", {
        meeting_kind: VIVER_CLASS_MEETING_KIND,
        class_occurrence_key: row.metadata.class_occurrence_key,
      })
      .maybeSingle();
    if (racedError) throw racedError;
    if (!raced?.id || !["scheduled", "rescheduled"].includes(raced.status)) {
      throw new Error("viver_class_concurrent_participation_not_active");
    }
    return {
      meetingId: raced.id,
      created: false,
      scheduledAt: raced.scheduled_at,
    };
  }
  if (insertError) throw insertError;
  return {
    meetingId: created.id,
    created: true,
    scheduledAt: created.scheduled_at,
  };
}
