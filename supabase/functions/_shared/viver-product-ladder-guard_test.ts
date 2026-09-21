import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  enforceViverProductLadder,
  isViverLowCapital,
  VIVER_PRODUCT_LADDER_EMPRESA_ID,
} from "./viver-product-ladder-guard.ts";

Deno.test("reconhece as duas faixas low aprovadas", () => {
  assert(isViverLowCapital("Até R$ 1.500,00"));
  assert(isViverLowCapital("De R$ 1.600,00 a R$ 3.000,00"));
  assertEquals(isViverLowCapital("De R$ 4.000,00 a R$ 6.000,00"), false);
});

Deno.test("Viver low não recebe convite para conversa individual", () => {
  const result = enforceViverProductLadder({
    empresaId: VIVER_PRODUCT_LADDER_EMPRESA_ID,
    capitalValue: "Até R$ 1.500,00",
    response:
      "Quero te convidar para uma conversa comigo para buscar a meta de R$ 50 mil. Topas?",
  });
  assert(result.changed);
  assertEquals(result.reason, "low_capital_individual_call_blocked");
  assert(result.text.includes("quarta-feira às 19h30"));
  assertEquals((result.text.match(/\?/g) ?? []).length, 1);
  assertEquals(/https?:\/\//.test(result.text), false);
});

Deno.test("continuação errada da call também é redirecionada", () => {
  const result = enforceViverProductLadder({
    empresaId: VIVER_PRODUCT_LADDER_EMPRESA_ID,
    capitalValue: "Até R$ 1.500,00",
    response: "Essa conversa é sem custo. Qual horário funciona melhor?",
  });
  assert(result.changed);
  assert(result.text.includes("aula em grupo"));
});

Deno.test("não altera perfil qualificado nem outros tenants", () => {
  const response = "Quero te convidar para uma conversa comigo. Topas?";
  assertEquals(enforceViverProductLadder({
    empresaId: VIVER_PRODUCT_LADDER_EMPRESA_ID,
    capitalValue: "De R$ 7.000,00 a R$ 9.000,00",
    response,
  }).changed, false);
  assertEquals(enforceViverProductLadder({
    empresaId: "outro-tenant",
    capitalValue: "Até R$ 1.500,00",
    response,
  }).changed, false);
});
