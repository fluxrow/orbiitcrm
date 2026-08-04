import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { consumesProspectingQuota, saoPauloDayStartIso } from "./outbox-quota.ts";

Deno.test("only outbound prospecting sources consume the daily quota", () => {
  for (const source of ["campaign", "flow_initial", "flow_followup"]) {
    assertEquals(consumesProspectingQuota(source), true, source);
  }

  for (const source of ["ai_reply", "manual", "meeting_confirmation", "flow_stage", null]) {
    assertEquals(consumesProspectingQuota(source), false, String(source));
  }
});

Deno.test("Sao Paulo day starts at 03:00 UTC", () => {
  assertEquals(saoPauloDayStartIso(new Date("2026-08-03T23:59:00Z")), "2026-08-03T03:00:00.000Z");
  assertEquals(saoPauloDayStartIso(new Date("2026-08-04T02:59:00Z")), "2026-08-03T03:00:00.000Z");
  assertEquals(saoPauloDayStartIso(new Date("2026-08-04T03:00:00Z")), "2026-08-04T03:00:00.000Z");
});
