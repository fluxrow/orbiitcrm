import {
  buildViverClassMeetingInsert,
  nextViverClassStart,
  viverClassOccurrenceKey,
} from "./viver-class-meeting.ts";

function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

Deno.test("agenda a próxima terça às 19h30 antes do início", () => {
  const start = nextViverClassStart(new Date("2026-08-31T17:00:00Z"));
  assertEquals(start.toISOString(), "2026-09-01T22:30:00.000Z");
  assertEquals(viverClassOccurrenceKey(start), "2026-09-01T19:30:00-03:00");
});

Deno.test("após o início usa a terça seguinte", () => {
  const start = nextViverClassStart(new Date("2026-09-01T22:31:00Z"));
  assertEquals(start.toISOString(), "2026-09-08T22:30:00.000Z");
});

Deno.test("monta reunião idempotente com evidência de consentimento", () => {
  const row = buildViverClassMeetingInsert({
    empresaId: "36f26579-66ad-4ef1-9788-141e4c727232",
    prospectId: "68e14598-7721-428c-a532-2702ab76f1c1",
    conversaId: "2091bc0b-b198-45cc-b9b4-2e14ca4f9d67",
    consentMessageId: "c14ed520-ffea-40e1-bed5-31e1f9ece78d",
    canonicalMeetUrl: "https://meet.google.com/abc-defg-hij",
    now: new Date("2026-08-31T17:00:00Z"),
  });
  assertEquals(row.scheduled_at, "2026-09-01T22:30:00.000Z");
  assertEquals(row.duration_minutes, 90);
  assertEquals(row.metadata, {
    meeting_kind: "viver_group_class",
    class_occurrence_key: "2026-09-01T19:30:00-03:00",
    consent_message_id: "c14ed520-ffea-40e1-bed5-31e1f9ece78d",
    consent_source: "whatsapp_explicit_acceptance",
  });
});

Deno.test("bloqueia URL não canônica", () => {
  let failed = false;
  try {
    buildViverClassMeetingInsert({
      empresaId: "36f26579-66ad-4ef1-9788-141e4c727232",
      prospectId: "68e14598-7721-428c-a532-2702ab76f1c1",
      conversaId: "2091bc0b-b198-45cc-b9b4-2e14ca4f9d67",
      consentMessageId: "c14ed520-ffea-40e1-bed5-31e1f9ece78d",
      canonicalMeetUrl: "https://example.com/aula",
    });
  } catch {
    failed = true;
  }
  assertEquals(failed, true);
});
