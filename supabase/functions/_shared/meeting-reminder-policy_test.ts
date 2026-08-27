import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  evaluateReminderDeliveryTime,
  MEETING_REMINDER_WINDOWS,
} from "./meeting-reminder-policy.ts";

const now = new Date("2026-08-26T18:00:00.000Z");

Deno.test("scheduler exposes exactly 24h, 1h and 5m reminders", () => {
  assertEquals(MEETING_REMINDER_WINDOWS.map((item) => item.kind), [
    "meeting_reminder_24h",
    "meeting_reminder_1h",
    "meeting_reminder_5m",
  ]);
});

Deno.test("each reminder is accepted only inside its own delivery window", () => {
  assertEquals(
    evaluateReminderDeliveryTime(
      "meeting_reminder_24h",
      "2026-08-27T18:00:00.000Z",
      now,
    ).allowed,
    true,
  );
  assertEquals(
    evaluateReminderDeliveryTime(
      "meeting_reminder_1h",
      "2026-08-26T19:00:00.000Z",
      now,
    ).allowed,
    true,
  );
  assertEquals(
    evaluateReminderDeliveryTime(
      "meeting_reminder_5m",
      "2026-08-26T18:05:00.000Z",
      now,
    ).allowed,
    true,
  );
});

Deno.test("late or early reminders fail closed instead of compensating backlog", () => {
  assertEquals(
    evaluateReminderDeliveryTime(
      "meeting_reminder_5m",
      "2026-08-26T17:59:59.000Z",
      now,
    ).reason,
    "meeting_reminder_expired",
  );
  assertEquals(
    evaluateReminderDeliveryTime(
      "meeting_reminder_5m",
      "2026-08-26T18:20:00.000Z",
      now,
    ).reason,
    "meeting_reminder_outside_delivery_window",
  );
  assertEquals(
    evaluateReminderDeliveryTime(
      "meeting_reminder_1h",
      "2026-08-26T18:05:00.000Z",
      now,
    ).reason,
    "meeting_reminder_outside_delivery_window",
  );
});
