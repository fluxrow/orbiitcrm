import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyScheduledActionResult } from "./scheduled-action-result.ts";

Deno.test("classifies a completed scheduled action", () => {
  assertEquals(classifyScheduledActionResult(true, { ok: true, data: { scheduled_id: "x" } }), "success");
});

Deno.test("preserves executor cancellation instead of reporting success", () => {
  assertEquals(classifyScheduledActionResult(true, { ok: true, data: { skipped: true, reason: "meeting_reminder_expired" } }), "skipped");
  assertEquals(classifyScheduledActionResult(true, { ok: true, data: { output: { skipped: true, reason: "action_disabled" } } }), "skipped");
});

Deno.test("outbox eligibility block is not recorded as a sent follow-up", () => {
  assertEquals(classifyScheduledActionResult(true, { ok: true, data: { output: {
    adapter: true, queued: false, outbox_id: null, reason: "missing_prior_real_outbound",
  } } }), "skipped");
  assertEquals(classifyScheduledActionResult(true, { ok: true, data: { output: {
    adapter: true, queued: false, outbox_id: "existing", reason: "duplicate",
  } } }), "success");
});

Deno.test("classifies failed executor and transport responses", () => {
  assertEquals(classifyScheduledActionResult(false, { ok: true }), "error");
  assertEquals(classifyScheduledActionResult(true, { ok: false, error: "blocked" }), "error");
});
