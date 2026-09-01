import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { deriveOutboxSourceType } from "./outbox-source.ts";

Deno.test("meeting reminders are always routed as meeting_confirmation", () => {
  for (
    const triggerType of [
      "meeting_reminder_24h",
      "meeting_reminder_1h",
      "meeting_reminder_5m",
    ]
  ) {
    assertEquals(
      deriveOutboxSourceType(triggerType, false, {}),
      "meeting_confirmation",
    );
    assertEquals(
      deriveOutboxSourceType(triggerType, true, {}),
      "meeting_confirmation",
    );
    assertEquals(
      deriveOutboxSourceType(triggerType, false, {
        outbox_source_type: "flow_initial",
      }),
      "meeting_confirmation",
    );
  }
});

Deno.test("commercial flow sources keep their existing semantics", () => {
  assertEquals(
    deriveOutboxSourceType("lead_recebido", false, {}),
    "flow_initial",
  );
  assertEquals(
    deriveOutboxSourceType("lead_recebido", true, {}),
    "flow_followup",
  );
  assertEquals(
    deriveOutboxSourceType("deal_stage_changed", false, {}),
    "flow_stage",
  );
  assertEquals(deriveOutboxSourceType("deal_idle", true, {}), "flow_followup");
});
