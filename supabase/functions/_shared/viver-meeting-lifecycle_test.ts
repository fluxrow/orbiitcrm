import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { meetingIdFromFlowContext } from "./viver-meeting-lifecycle.ts";

Deno.test("extrai meeting_id apenas de UUID persistido no payload", () => {
  assertEquals(meetingIdFromFlowContext({ payload: { meeting_id: "0010b897-cd5d-43f1-8844-64d64c940015" } }), "0010b897-cd5d-43f1-8844-64d64c940015");
  assertEquals(meetingIdFromFlowContext({ payload: { meeting_id: "arbitrario" } }), null);
  assertEquals(meetingIdFromFlowContext({}), null);
});
