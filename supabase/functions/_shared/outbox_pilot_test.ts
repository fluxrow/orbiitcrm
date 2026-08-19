import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  PILOT_INBOUND_REQUIRED,
  PILOT_SOURCE_BLOCKED,
  PILOT_TYPEBOT_EVIDENCE_REQUIRED,
  pilotStaticBlockReason,
  VIVER_SEMIJOIAS_EMPRESA_ID,
} from "./outbox-pilot.ts";

Deno.test("pilot blocks every proactive source for Viver", () => {
  for (const source_type of ["campaign", "flow_initial", "flow_followup", "flow_stage", "meeting_confirmation", "manual"]) {
    assertEquals(pilotStaticBlockReason({ empresa_id: VIVER_SEMIJOIAS_EMPRESA_ID, source_type, metadata: {} }), PILOT_SOURCE_BLOCKED);
  }
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
