import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { evaluateViverMeetingReminder, meetingIdFromFlowContext } from "./viver-meeting-lifecycle.ts";

Deno.test("extrai meeting_id apenas de UUID persistido no payload", () => {
  assertEquals(meetingIdFromFlowContext({ payload: { meeting_id: "0010b897-cd5d-43f1-8844-64d64c940015" } }), "0010b897-cd5d-43f1-8844-64d64c940015");
  assertEquals(meetingIdFromFlowContext({ payload: { meeting_id: "arbitrario" } }), null);
  assertEquals(meetingIdFromFlowContext({}), null);
});

Deno.test("lembrete sem meeting_id ou UUID inválido é bloqueado", () => {
  for (const context of [{ payload: { reminder_kind: "meeting_reminder_1h" } }, { payload: { reminder_kind: "meeting_reminder_1h", meeting_id: "invalido" } }]) {
    const result = evaluateViverMeetingReminder({
      reminderKind: context.payload.reminder_kind,
      meetingId: meetingIdFromFlowContext(context),
      meeting: null,
    });
    assertEquals(result, { allowed: false, reason: "meeting_reminder_invalid_meeting_id" });
  }
});

Deno.test("meeting_id válido sem linha pertencente à Viver é bloqueado cross-tenant", () => {
  const result = evaluateViverMeetingReminder({
    reminderKind: "meeting_reminder_24h",
    meetingId: "0010b897-cd5d-43f1-8844-64d64c940015",
    meeting: null,
  });
  assertEquals(result, { allowed: false, reason: "meeting_reminder_not_owned_by_viver" });
});
