import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  VIVER_EMPRESA_ID,
  detectsViverDayChangeIntent,
  hasExplicitSchedulingDate,
  hasExplicitSchedulingTime,
  isAmbiguousSlotAcceptance,
  schedulingPolicy,
  selectExplicitSuggestion,
  shouldClarifyViverReschedule,
} from "./tenant-scheduling-policy.ts";

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

Deno.test("detecta mudança de dia e exige data mais horário durante remarcação Viver", () => {
  assertEquals(detectsViverDayChangeIntent("Pode ser outro dia"), true);
  assertEquals(detectsViverDayChangeIntent("Não posso hoje, preciso outro dia"), true);
  assertEquals(hasExplicitSchedulingDate("dia 16 às 16h"), true);
  assertEquals(hasExplicitSchedulingTime("dia 16 às 16h"), true);
  assertEquals(shouldClarifyViverReschedule({
    empresaId: VIVER_EMPRESA_ID,
    message: "16",
    state: { active: true, reason: "change_day" },
  }).blocked, true);
  assertEquals(shouldClarifyViverReschedule({
    empresaId: VIVER_EMPRESA_ID,
    message: "dia 16 às 16h",
    state: { active: true, reason: "change_day" },
  }).blocked, false);
});

Deno.test("guarda de remarcação não altera outros tenants", () => {
  assertEquals(shouldClarifyViverReschedule({
    empresaId: "bullink-ou-outro-tenant",
    message: "16",
    state: { active: true, reason: "change_day" },
  }).blocked, false);
});
