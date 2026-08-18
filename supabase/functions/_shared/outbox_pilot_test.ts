import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  PILOT_INBOUND_REQUIRED,
  PILOT_SOURCE_BLOCKED,
  pilotStaticBlockReason,
  VIVER_SEMIJOIAS_EMPRESA_ID,
} from "./outbox-pilot.ts";

Deno.test("pilot blocks every proactive source for Viver", () => {
  for (const source_type of ["campaign", "flow_initial", "flow_followup", "flow_stage", "meeting_confirmation", "manual"]) {
    assertEquals(pilotStaticBlockReason({ empresa_id: VIVER_SEMIJOIAS_EMPRESA_ID, source_type, metadata: {} }), PILOT_SOURCE_BLOCKED);
  }
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
