import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isFlowTriggerActiveForEvent } from "./flow-trigger-activation.ts";

Deno.test("flow sem activation_not_before permanece compatível", () => {
  assertEquals(isFlowTriggerActiveForEvent({}, "2026-08-28T12:00:00Z"), true);
});

Deno.test("flow só aceita evento criado depois da ativação", () => {
  const cfg = { activation_not_before: "2026-08-29T03:00:00.000Z" };
  assertEquals(isFlowTriggerActiveForEvent(cfg, "2026-08-29T02:59:59.999Z"), false);
  assertEquals(isFlowTriggerActiveForEvent(cfg, "2026-08-29T03:00:00.000Z"), true);
});

Deno.test("activation_not_before inválido falha fechado", () => {
  assertEquals(isFlowTriggerActiveForEvent({ activation_not_before: "amanhã" }, "2026-08-29T03:00:00Z"), false);
});
