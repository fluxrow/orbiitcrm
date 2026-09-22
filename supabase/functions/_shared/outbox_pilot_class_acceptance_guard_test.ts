import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  PILOT_CLASS_ACCEPTANCE_EVIDENCE_REQUIRED,
  pilotInboundBlockReason,
  VIVER_SEMIJOIAS_EMPRESA_ID,
} from "./outbox-pilot.ts";

type Row = Record<string, any>;

class Query {
  #rows: Row[];
  constructor(rows: Row[]) { this.#rows = [...rows]; }
  select(_columns: string) { return this; }
  eq(column: string, value: unknown) {
    this.#rows = this.#rows.filter((row) => String(row[column] ?? "") === String(value ?? ""));
    return this;
  }
  async maybeSingle() { return { data: this.#rows[0] ?? null, error: null }; }
}

const meetingId = "11111111-1111-4111-8111-111111111111";
const consentId = "22222222-2222-4222-8222-222222222222";
const prospectId = "33333333-3333-4333-8333-333333333333";
const conversaId = "44444444-4444-4444-8444-444444444444";

function fixture(overrides: Partial<Record<string, Row[]>> = {}) {
  const rows: Record<string, Row[]> = {
    orbit_meetings: [{
      id: meetingId,
      empresa_id: VIVER_SEMIJOIAS_EMPRESA_ID,
      prospect_id: prospectId,
      conversa_id: conversaId,
      scheduled_at: "2026-09-23T22:30:00Z",
      status: "scheduled",
      meeting_url: "https://meet.google.com/abc-defg-hij",
      metadata: { meeting_kind: "viver_group_class", consent_message_id: consentId },
    }],
    orbit_mensagens: [{
      id: consentId,
      empresa_id: VIVER_SEMIJOIAS_EMPRESA_ID,
      conversa_id: conversaId,
      direcao: "IN",
      timestamp: "2026-09-21T22:59:55Z",
    }],
    orbit_conversas: [{
      id: conversaId,
      empresa_id: VIVER_SEMIJOIAS_EMPRESA_ID,
      prospect_id: prospectId,
      human_talk: false,
      handoff_sent_at: null,
    }],
    orbit_prospects: [{
      id: prospectId,
      empresa_id: VIVER_SEMIJOIAS_EMPRESA_ID,
      optout_whatsapp: false,
      deleted_at: null,
    }],
    ...overrides,
  };
  return { from(table: string) { return new Query(rows[table] ?? []); } };
}

const item = {
  empresa_id: VIVER_SEMIJOIAS_EMPRESA_ID,
  source_type: "meeting_confirmation",
  prospect_id: prospectId,
  conversa_id: conversaId,
  created_at: "2026-09-22T00:14:00Z",
  metadata: {
    viver_controlled_class_acceptance: true,
    operation: "viver_group_class_acceptance_remediation",
    meeting_id: meetingId,
    consent_message_id: consentId,
  },
};

Deno.test("Viver controlled class acceptance requires authoritative meeting and inbound", async () => {
  assertEquals(await pilotInboundBlockReason(fixture(), item, new Date("2026-09-22T00:15:00Z")), null);
});

Deno.test("Viver controlled class acceptance blocks after human handoff", async () => {
  const db = fixture({
    orbit_conversas: [{
      id: conversaId,
      empresa_id: VIVER_SEMIJOIAS_EMPRESA_ID,
      prospect_id: prospectId,
      human_talk: true,
      handoff_sent_at: "2026-09-22T00:10:00Z",
    }],
  });
  assertEquals(
    await pilotInboundBlockReason(db, item, new Date("2026-09-22T00:15:00Z")),
    PILOT_CLASS_ACCEPTANCE_EVIDENCE_REQUIRED,
  );
});

Deno.test("Viver controlled class acceptance blocks mismatched consent evidence", async () => {
  const db = fixture({ orbit_mensagens: [] });
  assertEquals(
    await pilotInboundBlockReason(db, item, new Date("2026-09-22T00:15:00Z")),
    PILOT_CLASS_ACCEPTANCE_EVIDENCE_REQUIRED,
  );
});
