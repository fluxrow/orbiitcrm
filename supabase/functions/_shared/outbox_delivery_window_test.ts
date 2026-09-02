import {
  BULLINK_EMPRESA_ID,
  effectiveOutboxPriority,
  isOutboxBusinessWindow,
  isStaleFlowOutbox,
  nextOutboxBusinessOpening,
  usesEssentialFlowDeliveryRepair,
} from "./outbox-delivery-window.ts";

function assertEquals<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    throw new Error(message ?? `expected ${String(expected)}, got ${String(actual)}`);
  }
}

Deno.test("business window uses Sao Paulo time", () => {
  assertEquals(isOutboxBusinessWindow(new Date("2026-09-02T10:59:59Z")), false);
  assertEquals(isOutboxBusinessWindow(new Date("2026-09-02T11:00:00Z")), true);
  assertEquals(isOutboxBusinessWindow(new Date("2026-09-02T22:59:59Z")), true);
  assertEquals(isOutboxBusinessWindow(new Date("2026-09-02T23:00:00Z")), false);
});

Deno.test("before opening defers once to the same Sao Paulo morning", () => {
  assertEquals(
    nextOutboxBusinessOpening(new Date("2026-09-02T07:15:00Z")).toISOString(),
    "2026-09-02T11:00:00.000Z",
  );
});

Deno.test("after closing defers once to the next Sao Paulo morning", () => {
  assertEquals(
    nextOutboxBusinessOpening(new Date("2026-09-02T23:15:00Z")).toISOString(),
    "2026-09-03T11:00:00.000Z",
  );
});

Deno.test("only stale initial and follow-up flow items expire", () => {
  const now = new Date("2026-09-02T12:00:00Z");
  assertEquals(isStaleFlowOutbox("flow_followup", "2026-09-01T12:00:00Z", now), true);
  assertEquals(isStaleFlowOutbox("flow_initial", "2026-09-01T11:59:59Z", now), true);
  assertEquals(isStaleFlowOutbox("flow_followup", "2026-09-01T12:00:01Z", now), false);
  assertEquals(isStaleFlowOutbox("meeting_confirmation", "2026-08-01T00:00:00Z", now), false);
  assertEquals(isStaleFlowOutbox("ai_reply", "2026-08-01T00:00:00Z", now), false);
});

Deno.test("valid aging follow-up outranks a new initial without outranking essential flows", () => {
  const now = new Date("2026-09-02T12:00:00Z");
  assertEquals(effectiveOutboxPriority({ empresa_id: BULLINK_EMPRESA_ID, source_type: "flow_followup", scheduled_for: "2026-09-02T11:31:00Z", priority: 40 }, now), 40);
  assertEquals(effectiveOutboxPriority({ empresa_id: BULLINK_EMPRESA_ID, source_type: "flow_followup", scheduled_for: "2026-09-02T11:30:00Z", priority: 40 }, now), 71);
  assertEquals(effectiveOutboxPriority({ empresa_id: BULLINK_EMPRESA_ID, source_type: "flow_followup", scheduled_for: "2026-09-01T12:00:00Z", priority: 40 }, now), 40);
  assertEquals(effectiveOutboxPriority({ empresa_id: BULLINK_EMPRESA_ID, source_type: "meeting_confirmation", scheduled_for: "2026-09-01T00:00:00Z", priority: 90 }, now), 90);
  assertEquals(effectiveOutboxPriority({ empresa_id: "00000000-0000-0000-0000-000000000000", source_type: "flow_followup", scheduled_for: "2026-09-02T11:00:00Z", priority: 40 }, now), 40);
  assertEquals(usesEssentialFlowDeliveryRepair(BULLINK_EMPRESA_ID), true);
  assertEquals(usesEssentialFlowDeliveryRepair("00000000-0000-0000-0000-000000000000"), false);
});
