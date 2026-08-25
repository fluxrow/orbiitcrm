import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { VIVER_EMPRESA_ID, schedulingPolicy, isAmbiguousSlotAcceptance, selectExplicitSuggestion } from "./tenant-scheduling-policy.ts";

Deno.test("Viver usa janela backend exclusiva 13h-17h em São Paulo", () => {
  const p = schedulingPolicy(VIVER_EMPRESA_ID, { timezone: "UTC", availability_start: "09:00", availability_end: "18:00" });
  assertEquals(p.timezone, "America/Sao_Paulo");
  assertEquals(p.availability_start, "13:00:00");
  assertEquals(p.availability_end, "17:00:00");
});

Deno.test("outros tenants preservam configuração", () => {
  const p = schedulingPolicy("outro", { timezone: "UTC", availability_start: "09:00", availability_end: "18:00" });
  assertEquals(p.timezone, "UTC");
  assertEquals(p.availability_start, "09:00");
});

Deno.test("aceite genérico não escolhe entre múltiplos horários", () => {
  for (const v of ["Ok", "pode ser", "beleza", "sim"]) assertEquals(isAmbiguousSlotAcceptance(v, 2), true);
  assertEquals(isAmbiguousSlotAcceptance("pode ser o segundo", 2), false);
});

Deno.test("escolha explícita seleciona a opção correta", () => {
  const slots = [{ label: "13:00", start: "a" }, { label: "15:00", start: "b" }];
  assertEquals(selectExplicitSuggestion("A segunda opção", slots)?.start, "b");
  assertEquals(selectExplicitSuggestion("Pode ser às 13:00", slots)?.start, "a");
});
