import { assertEquals, assert } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { maskPii, maskPreview } from "./pii-mask.ts";
import { normalizeAgentModel } from "./ai-model.ts";
import { safePreview } from "./inbound-zapi.ts";

Deno.test("mask CPF formatado e cru", () => {
  assert(!maskPii("meu cpf é 123.456.789-09").includes("123.456"));
  assert(!maskPii("cpf 12345678909 ok").includes("12345678909"));
  assert(maskPii("meu cpf é 123.456.789-09").includes("meu cpf"));
});

Deno.test("mask CNPJ", () => {
  const out = maskPii("CNPJ 12.345.678/0001-95 da empresa");
  assert(!out.includes("12.345.678"));
  assert(out.includes("da empresa"));
});

Deno.test("mask email", () => {
  const out = maskPii("me manda em joao.silva+x@dominio.com.br por favor");
  assert(!out.includes("@dominio"));
  assert(out.includes("por favor"));
});

Deno.test("mask telefone com e sem DDI", () => {
  assert(!maskPii("liga no +55 31 98735-5864").includes("98735"));
  assert(!maskPii("meu zap 31987355864").includes("31987355864"));
});

Deno.test("mask CEP e numero de endereco", () => {
  const out = maskPii("Rua das Flores, 1234 - CEP 30140-071");
  assert(!out.includes("30140-071"));
  assert(!out.includes("1234"));
  assert(out.toLowerCase().includes("rua das flores"));
});

Deno.test("texto conversacional comum é preservado", () => {
  const t = "Boa tarde Fernando, queria saber como funciona a mentoria?";
  assertEquals(maskPii(t), t);
  const t2 = "Entorno de 5mil e pouco ne o plano em grupo";
  assertEquals(maskPii(t2), t2);
});

Deno.test("maskPreview trunca e normaliza espaços", () => {
  const out = maskPreview("a".repeat(200));
  assertEquals(out.length, 100);
  assertEquals(maskPreview("  oi   tudo\nbem  "), "oi tudo bem");
});

Deno.test("safePreview aplica masking e fallback de mídia", () => {
  assert(!safePreview("cpf 123.456.789-09", null).includes("123.456"));
  assertEquals(safePreview("", "audio"), "📎 audio");
});

Deno.test("normalizeAgentModel converte vendors não-Anthropic", () => {
  assertEquals(normalizeAgentModel("google/gemini-2.5-flash"), "claude-sonnet-4-5");
  assertEquals(normalizeAgentModel("google/gemini-2.5-flash-lite"), "claude-haiku-4-5");
  assertEquals(normalizeAgentModel("google/gemini-2.5-pro"), "claude-opus-4-1");
  assertEquals(normalizeAgentModel("openai/gpt-5-mini"), "claude-haiku-4-5");
  assertEquals(normalizeAgentModel(""), "claude-sonnet-4-5");
  assertEquals(normalizeAgentModel(null), "claude-sonnet-4-5");
});

Deno.test("normalizeAgentModel preserva ids Anthropic", () => {
  assertEquals(normalizeAgentModel("claude-haiku-4-5"), "claude-haiku-4-5");
  assertEquals(normalizeAgentModel("claude-opus-4-1"), "claude-opus-4-1");
});
