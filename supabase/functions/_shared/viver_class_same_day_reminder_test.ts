import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  classReminderPredecessorWaitMs,
  classSameDayWindowAllowed,
  isControlledViverClassSameDayReminder,
  VIVER_CLASS_SAME_DAY_BATCH,
  VIVER_CLASS_SAME_DAY_KIND,
  VIVER_CLASS_SAME_DAY_OPERATION,
  VIVER_CLASS_SAME_DAY_TEMPLATE_ID,
} from "./viver-class-same-day-reminder.ts";
import {
  PILOT_CLASS_SAME_DAY_EVIDENCE_REQUIRED,
  PILOT_SOURCE_BLOCKED,
  pilotInboundBlockReason,
  pilotStaticBlockReason,
  VIVER_SEMIJOIAS_EMPRESA_ID,
} from "./outbox-pilot.ts";

const meetingId = "070ca3c9-8d62-4289-a4db-54f9d6554de7";
const consentId = "22222222-2222-4222-8222-222222222222";
const prospectId = "33333333-3333-4333-8333-333333333333";
const conversaId = "44444444-4444-4444-8444-444444444444";
const now = new Date("2026-09-23T14:30:00Z");

const item = {
  id: "55555555-5555-4555-8555-555555555555",
  empresa_id: VIVER_SEMIJOIAS_EMPRESA_ID,
  source_type: "meeting_confirmation",
  idempotency_key: `viver:class-same-day:2026-09-23:${meetingId}`,
  max_attempts: 1,
  prospect_id: prospectId,
  conversa_id: conversaId,
  payload_type: "text",
  payload: {
    template_id: VIVER_CLASS_SAME_DAY_TEMPLATE_ID,
    mensagem: "Ana, sua aula é hoje às 19:30. https://meet.google.com/abc-defg-hij",
  },
  created_at: "2026-09-23T14:20:00Z",
  metadata: {
    operation: VIVER_CLASS_SAME_DAY_OPERATION,
    reminder_kind: VIVER_CLASS_SAME_DAY_KIND,
    batch_id: VIVER_CLASS_SAME_DAY_BATCH,
    sequence: 1,
    template_id: VIVER_CLASS_SAME_DAY_TEMPLATE_ID,
    meeting_id: meetingId,
    consent_message_id: consentId,
  },
};

type Row = Record<string, any>;
class Query {
  #rows: Row[];
  constructor(rows: Row[]) { this.#rows = [...rows]; }
  select(_columns: string) { return this; }
  #value(row: Row, column: string) {
    return column.startsWith("metadata->>")
      ? row.metadata?.[column.slice("metadata->>".length)]
      : row[column];
  }
  eq(column: string, value: unknown) {
    this.#rows = this.#rows.filter((row) => String(this.#value(row, column) ?? "") === String(value ?? ""));
    return this;
  }
  neq(column: string, value: unknown) {
    this.#rows = this.#rows.filter((row) => String(this.#value(row, column) ?? "") !== String(value ?? ""));
    return this;
  }
  in(column: string, values: unknown[]) {
    this.#rows = this.#rows.filter((row) => values.includes(this.#value(row, column)));
    return this;
  }
  is(column: string, value: unknown) {
    this.#rows = this.#rows.filter((row) => this.#value(row, column) === value);
    return this;
  }
  gt(column: string, value: unknown) {
    const cutoff = Date.parse(String(value ?? ""));
    this.#rows = this.#rows.filter((row) => Date.parse(String(row[column] ?? "")) > cutoff);
    return this;
  }
  limit(n: number) { this.#rows = this.#rows.slice(0, n); return this; }
  async maybeSingle() { return { data: this.#rows[0] ?? null, error: null }; }
  then(resolve: (value: { data: Row[]; error: null }) => unknown) {
    return Promise.resolve({ data: this.#rows, error: null }).then(resolve);
  }
}

function fixture(overrides: Partial<Record<string, Row[]>> = {}) {
  const rows: Record<string, Row[]> = {
    orbit_meetings: [{
      id: meetingId, empresa_id: VIVER_SEMIJOIAS_EMPRESA_ID,
      prospect_id: prospectId, conversa_id: conversaId,
      scheduled_at: "2026-09-23T22:30:00Z", status: "scheduled",
      meeting_url: "https://meet.google.com/abc-defg-hij",
      metadata: { meeting_kind: "viver_group_class", consent_message_id: consentId },
    }],
    orbit_mensagens: [{
      id: consentId, empresa_id: VIVER_SEMIJOIAS_EMPRESA_ID,
      conversa_id: conversaId, direcao: "IN", timestamp: "2026-09-22T20:00:00Z",
    }],
    orbit_conversas: [{
      id: conversaId, empresa_id: VIVER_SEMIJOIAS_EMPRESA_ID,
      prospect_id: prospectId, human_talk: false, human_user_id: null,
    }],
    orbit_prospects: [{
      id: prospectId, empresa_id: VIVER_SEMIJOIAS_EMPRESA_ID,
      optout_whatsapp: false, deleted_at: null, nome_razao: "Ana Silva",
    }],
    orbit_message_templates: [{
      id: VIVER_CLASS_SAME_DAY_TEMPLATE_ID,
      empresa_id: VIVER_SEMIJOIAS_EMPRESA_ID,
      ativo: true, canal: "whatsapp",
      corpo_texto: "{{nome}}, sua aula é hoje às 19:30. https://meet.google.com/abc-defg-hij",
    }],
    orbit_whatsapp_outbox: [],
    ...overrides,
  };
  return { from(table: string) { return new Query(rows[table] ?? []); } };
}

Deno.test("class reminder is explicitly scoped and cannot impersonate another kind", () => {
  assertEquals(isControlledViverClassSameDayReminder(item), true);
  assertEquals(pilotStaticBlockReason(item), null);
  assertEquals(pilotStaticBlockReason({ ...item, metadata: { ...item.metadata, operation: "other" } }), PILOT_SOURCE_BLOCKED);
  assertEquals(pilotStaticBlockReason({ ...item, metadata: { ...item.metadata, reminder_kind: "meeting_reschedule_notice" } }), PILOT_SOURCE_BLOCKED);
  assertEquals(pilotStaticBlockReason({ ...item, metadata: { ...item.metadata, sequence: 8 } }), PILOT_SOURCE_BLOCKED);
  assertEquals(pilotStaticBlockReason({ ...item, metadata: { ...item.metadata, meeting_id: "11111111-1111-4111-8111-111111111111" } }), PILOT_SOURCE_BLOCKED);
  assertEquals(pilotStaticBlockReason({ ...item, max_attempts: 2 }), PILOT_SOURCE_BLOCKED);
});

Deno.test("class reminder window is today before the later reminder cadence", () => {
  assertEquals(classSameDayWindowAllowed({ scheduled_at: "2026-09-23T22:30:00Z", metadata: { meeting_kind: "viver_group_class" } }, now), true);
  assertEquals(classSameDayWindowAllowed({ scheduled_at: "2026-09-23T22:30:00Z", metadata: { meeting_kind: "viver_group_class" } }, new Date("2026-09-23T21:00:00Z")), false);
  assertEquals(classSameDayWindowAllowed({ scheduled_at: "2026-09-24T22:30:00Z", metadata: { meeting_kind: "viver_group_class" } }, now), false);
  assertEquals(classSameDayWindowAllowed({ scheduled_at: "2026-09-23T22:30:00Z", metadata: { meeting_kind: "individual" } }, now), false);
});

Deno.test("class reminder accepts only authoritative consent, meeting and template", async () => {
  assertEquals(await pilotInboundBlockReason(fixture(), item, now), null);
  const noConsent = fixture({ orbit_mensagens: [] });
  assertEquals(await pilotInboundBlockReason(noConsent, item, now), PILOT_CLASS_SAME_DAY_EVIDENCE_REQUIRED);
  const changedPayload = { ...item, payload: { ...item.payload, mensagem: "different" } };
  assertEquals(await pilotInboundBlockReason(fixture(), changedPayload, now), PILOT_CLASS_SAME_DAY_EVIDENCE_REQUIRED);
  const inactive = fixture({ orbit_message_templates: [{
    id: VIVER_CLASS_SAME_DAY_TEMPLATE_ID,
    empresa_id: VIVER_SEMIJOIAS_EMPRESA_ID,
    ativo: false, canal: "whatsapp",
    corpo_texto: "{{nome}}, sua aula é hoje às 19:30. https://meet.google.com/abc-defg-hij",
  }] });
  assertEquals(await pilotInboundBlockReason(inactive, item, now), PILOT_CLASS_SAME_DAY_EVIDENCE_REQUIRED);
  assertEquals(await pilotInboundBlockReason(fixture(), item, new Date("2026-09-23T21:00:00Z")), PILOT_CLASS_SAME_DAY_EVIDENCE_REQUIRED);
});

Deno.test("class reminder blocks later reply, human ownership, opt-out and duplicate", async () => {
  const replied = fixture({ orbit_mensagens: [
    { id: consentId, empresa_id: VIVER_SEMIJOIAS_EMPRESA_ID, conversa_id: conversaId, direcao: "IN", timestamp: "2026-09-22T20:00:00Z" },
    { id: "reply", empresa_id: VIVER_SEMIJOIAS_EMPRESA_ID, conversa_id: conversaId, direcao: "IN", timestamp: "2026-09-23T13:00:00Z" },
  ] });
  assertEquals(await pilotInboundBlockReason(replied, item, now), PILOT_CLASS_SAME_DAY_EVIDENCE_REQUIRED);
  const human = fixture({ orbit_conversas: [{ id: conversaId, empresa_id: VIVER_SEMIJOIAS_EMPRESA_ID, prospect_id: prospectId, human_talk: true }] });
  assertEquals(await pilotInboundBlockReason(human, item, now), PILOT_CLASS_SAME_DAY_EVIDENCE_REQUIRED);
  const humanOutbound = fixture({ orbit_mensagens: [
    { id: consentId, empresa_id: VIVER_SEMIJOIAS_EMPRESA_ID, conversa_id: conversaId, direcao: "IN", timestamp: "2026-09-22T20:00:00Z" },
    { id: "human-out", empresa_id: VIVER_SEMIJOIAS_EMPRESA_ID, conversa_id: conversaId, direcao: "OUT", timestamp: "2026-09-23T13:00:00Z", sender_type: "human_phone" },
  ] });
  assertEquals(await pilotInboundBlockReason(humanOutbound, item, now), PILOT_CLASS_SAME_DAY_EVIDENCE_REQUIRED);
  const optout = fixture({ orbit_prospects: [{ id: prospectId, empresa_id: VIVER_SEMIJOIAS_EMPRESA_ID, optout_whatsapp: true }] });
  assertEquals(await pilotInboundBlockReason(optout, item, now), PILOT_CLASS_SAME_DAY_EVIDENCE_REQUIRED);
  const duplicate = fixture({ orbit_whatsapp_outbox: [{ id: "other", empresa_id: VIVER_SEMIJOIAS_EMPRESA_ID, source_type: "meeting_confirmation", status: "sent", metadata: { meeting_id: meetingId, reminder_kind: VIVER_CLASS_SAME_DAY_KIND } }] });
  assertEquals(await pilotInboundBlockReason(duplicate, item, now), PILOT_CLASS_SAME_DAY_EVIDENCE_REQUIRED);
  const canceledDuplicate = fixture({ orbit_whatsapp_outbox: [{ id: "other", empresa_id: VIVER_SEMIJOIAS_EMPRESA_ID, source_type: "meeting_confirmation", status: "canceled", metadata: { meeting_id: meetingId, reminder_kind: VIVER_CLASS_SAME_DAY_KIND } }] });
  assertEquals(await pilotInboundBlockReason(canceledDuplicate, item, now), PILOT_CLASS_SAME_DAY_EVIDENCE_REQUIRED);
  const collision = fixture({ orbit_whatsapp_outbox: [{ id: "other", empresa_id: VIVER_SEMIJOIAS_EMPRESA_ID, conversa_id: conversaId, source_type: "ai_reply", status: "pending", provider_message_id: null }] });
  assertEquals(await pilotInboundBlockReason(collision, item, now), PILOT_CLASS_SAME_DAY_EVIDENCE_REQUIRED);
});

Deno.test("each class reminder waits for an accepted predecessor and sixty seconds", () => {
  assertEquals(classReminderPredecessorWaitMs(1, null, now), 0);
  assertEquals(classReminderPredecessorWaitMs(2, null, now), 60_000);
  const prior = { status: "sent", provider_message_id: "accepted", sent_at: "2026-09-23T14:29:30Z" };
  assertEquals(classReminderPredecessorWaitMs(2, prior, now), 30_000);
  assertEquals(classReminderPredecessorWaitMs(2, prior, new Date("2026-09-23T14:30:30Z")), 0);
});
