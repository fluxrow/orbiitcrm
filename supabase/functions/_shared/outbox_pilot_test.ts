import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  PILOT_INBOUND_REQUIRED,
  PILOT_CAMPAIGN_EVIDENCE_REQUIRED,
  PILOT_CAMPAIGN_MESSAGE_INVALID,
  PILOT_FOLLOWUP_EVIDENCE_REQUIRED,
  PILOT_MEETING_EVIDENCE_REQUIRED,
  PILOT_SOURCE_BLOCKED,
  PILOT_TYPEBOT_EVIDENCE_REQUIRED,
  pilotStaticBlockReason,
  VIVER_CONTROLLED_OUTBOX_GATE_VERSION,
  VIVER_SEMIJOIAS_EMPRESA_ID,
} from "./outbox-pilot.ts";

Deno.test("controlled Viver outbox gate exposes the deploy version", () => {
  assertEquals(VIVER_CONTROLLED_OUTBOX_GATE_VERSION, "2026-09-02-v3");
});

Deno.test("pilot blocks every proactive source for Viver", () => {
  for (const source_type of ["campaign", "flow_initial", "flow_followup", "flow_stage", "meeting_confirmation", "manual"]) {
    assertEquals(pilotStaticBlockReason({ empresa_id: VIVER_SEMIJOIAS_EMPRESA_ID, source_type, metadata: {} }), PILOT_SOURCE_BLOCKED);
  }
});

Deno.test("pilot only admits explicitly marked controlled Viver operations to evidence checks", () => {
  assertEquals(pilotStaticBlockReason({
    empresa_id: VIVER_SEMIJOIAS_EMPRESA_ID,
    source_type: "campaign",
    metadata: { viver_controlled_reengagement: true },
    payload: { mensagem: "Olá. Posso continuar?" },
  }), null);
  assertEquals(pilotStaticBlockReason({
    empresa_id: VIVER_SEMIJOIAS_EMPRESA_ID,
    source_type: "flow_followup",
    metadata: { viver_controlled_followup: true, pilot_not_before: "2026-08-29T03:00:00Z" },
  }), null);
  assertEquals(pilotStaticBlockReason({
    empresa_id: VIVER_SEMIJOIAS_EMPRESA_ID,
    source_type: "meeting_confirmation",
    metadata: { meeting_id: "11111111-1111-4111-8111-111111111111", reminder_kind: "meeting_reminder_5m" },
  }), null);
  assertEquals(PILOT_CAMPAIGN_EVIDENCE_REQUIRED, "PILOT_CAMPAIGN_EVIDENCE_REQUIRED");
  assertEquals(PILOT_FOLLOWUP_EVIDENCE_REQUIRED, "PILOT_FOLLOWUP_EVIDENCE_REQUIRED");
  assertEquals(PILOT_MEETING_EVIDENCE_REQUIRED, "PILOT_MEETING_EVIDENCE_REQUIRED");
});

Deno.test("controlled Viver campaign requires exactly one question and no URL", () => {
  const base = {
    empresa_id: VIVER_SEMIJOIAS_EMPRESA_ID,
    source_type: "campaign",
    metadata: { viver_controlled_reengagement: true },
  };

  assertEquals(pilotStaticBlockReason({
    ...base,
    payload: { mensagem: "Tudo bem? Posso continuar?" },
  }), PILOT_CAMPAIGN_MESSAGE_INVALID);
  assertEquals(pilotStaticBlockReason({
    ...base,
    payload: { mensagem: "Posso continuar? https://example.invalid" },
  }), PILOT_CAMPAIGN_MESSAGE_INVALID);
  assertEquals(pilotStaticBlockReason({
    ...base,
    payload: { mensagem: "Posso continuar?" },
  }), null);
  assertEquals(pilotStaticBlockReason({
    empresa_id: "other",
    source_type: "campaign",
    metadata: { viver_controlled_reengagement: true },
    payload: { mensagem: "Tudo bem? Posso continuar?" },
  }), null);
});

Deno.test("pilot permits only the explicitly marked Viver Typebot D0 action", () => {
  assertEquals(pilotStaticBlockReason({
    empresa_id: VIVER_SEMIJOIAS_EMPRESA_ID,
    source_type: "flow_initial",
    source_id: "f69f59ad-5c0b-4c90-aae0-5b8578abcc24",
    metadata: { viver_pilot_typebot_d0: true, pilot_not_before: "2026-08-19T20:30:00Z" },
  }), null);
  assertEquals(pilotStaticBlockReason({
    empresa_id: VIVER_SEMIJOIAS_EMPRESA_ID,
    source_type: "flow_initial",
    source_id: "wrong-action",
    metadata: { viver_pilot_typebot_d0: true, pilot_not_before: "2026-08-19T20:30:00Z" },
  }), PILOT_SOURCE_BLOCKED);
  assertEquals(PILOT_TYPEBOT_EVIDENCE_REQUIRED, "PILOT_TYPEBOT_EVIDENCE_REQUIRED");
});

Deno.test("pilot requires inbound id for ai reply", () => {
  assertEquals(
    pilotStaticBlockReason({ empresa_id: VIVER_SEMIJOIAS_EMPRESA_ID, source_type: "ai_reply", metadata: {} }),
    PILOT_INBOUND_REQUIRED,
  );
});

Deno.test("pilot permits inbound-backed ai reply and explicit controlled canary", () => {
  assertEquals(pilotStaticBlockReason({
    empresa_id: VIVER_SEMIJOIAS_EMPRESA_ID,
    source_type: "ai_reply",
    metadata: { inbound_message_id: "11111111-1111-4111-8111-111111111111" },
  }), null);
  assertEquals(pilotStaticBlockReason({
    empresa_id: VIVER_SEMIJOIAS_EMPRESA_ID,
    source_type: "manual",
    metadata: { controlled_canary: true },
  }), null);
});

Deno.test("pilot does not change other tenants", () => {
  assertEquals(pilotStaticBlockReason({ empresa_id: "other", source_type: "campaign", metadata: {} }), null);
});
