import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  evaluateReminderDeliveryTime,
  evaluateViverMorningReminder,
  isMeetingReminderKind,
  MEETING_REMINDER_WINDOWS,
} from "./meeting-reminder-policy.ts";

const now = new Date("2026-08-26T18:00:00.000Z");

Deno.test("scheduler exposes exactly 24h, 1h, 15m and 5m reminders", () => {
  assertEquals(MEETING_REMINDER_WINDOWS.map((item) => item.kind), [
    "meeting_reminder_24h",
    "meeting_reminder_1h",
    "meeting_reminder_15m",
    "meeting_reminder_5m",
  ]);
});

Deno.test("lembrete matinal Viver só nasce cedo para reunião individual à tarde no mesmo dia", () => {
  const meeting = {
    scheduledAt: "2026-09-22T19:00:00.000Z", // 16h em São Paulo
    createdAt: "2026-09-21T20:00:00.000Z",
    meetingKind: "viver_individual",
  };
  assertEquals(isMeetingReminderKind("meeting_reminder_morning"), true);
  assertEquals(evaluateViverMorningReminder(meeting, new Date("2026-09-22T12:05:00.000Z"), "emit"), { allowed: true });
  assertEquals(evaluateViverMorningReminder(meeting, new Date("2026-09-22T12:20:00.000Z"), "delivery"), { allowed: true });
  assertEquals(evaluateViverMorningReminder(meeting, new Date("2026-09-22T12:20:00.000Z"), "emit").allowed, false);
  assertEquals(evaluateViverMorningReminder(meeting, new Date("2026-09-22T12:31:00.000Z"), "delivery").allowed, false);
  assertEquals(evaluateViverMorningReminder(meeting, new Date("2026-09-23T12:05:00.000Z"), "emit").allowed, false);
  assertEquals(evaluateViverMorningReminder({ ...meeting, meetingKind: "viver_group_class" }, new Date("2026-09-22T12:05:00.000Z"), "emit").allowed, false);
  assertEquals(evaluateViverMorningReminder({ ...meeting, createdAt: "2026-09-22T12:01:00.000Z" }, new Date("2026-09-22T12:05:00.000Z"), "emit").allowed, false);
  assertEquals(evaluateViverMorningReminder({ ...meeting, createdAt: null }, new Date("2026-09-22T12:05:00.000Z"), "emit").allowed, false);
});

Deno.test("each reminder is accepted only inside its own delivery window", () => {
  assertEquals(
    evaluateReminderDeliveryTime(
      "meeting_reminder_15m",
      "2026-08-26T18:15:00.000Z",
      now,
    ).allowed,
    true,
  );
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
