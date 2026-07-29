import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normalizeAgentText } from "./pt-br-normalizer.ts";

Deno.test("corrige acentos de voce/voces/avancar", () => {
  assertEquals(
    normalizeAgentText("Voce quer avancar?"),
    "Você quer avançar?",
  );
  assertEquals(
    normalizeAgentText("Voces topam avancar agora?"),
    "Vocês topam avançar agora?",
  );
});

Deno.test("remove travessão e meia-risca", () => {
  const out = normalizeAgentText("Oi — tudo bem – hoje?");
  assertFalse(/[—–]/.test(out), `sobrou dash: ${out}`);
  assert(out.includes("Oi, tudo bem, hoje?"), `esperado, mas foi: ${out}`);
});

Deno.test("preserva hífen legítimo em pós-graduação", () => {
  const out = normalizeAgentText("Tem pós-graduação em curso?");
  assert(out.includes("pós-graduação"), `esperava pós-graduação, foi: ${out}`);
});

Deno.test("humaniza frases mecânicas", () => {
  const a = normalizeAgentText("Antes de avançar, preciso confirmar algo.");
  assertFalse(/antes de avançar/i.test(a), a);
  const b = normalizeAgentText("Podemos dar o próximo passo?");
  assertFalse(/próximo passo/i.test(b), b);
});

Deno.test("idempotente", () => {
  const once = normalizeAgentText("Voce quer avancar — hoje?");
  const twice = normalizeAgentText(once);
  assertEquals(once, twice);
});

Deno.test("preserva capitalização inicial ao corrigir acento", () => {
  assertEquals(normalizeAgentText("Nao sei"), "Não sei");
  assertEquals(normalizeAgentText("nao sei"), "não sei");
});

Deno.test("não corrompe 'esta' como pronome demonstrativo", () => {
  assertEquals(
    normalizeAgentText("Esta mensagem está correta."),
    "Esta mensagem está correta.",
  );
});
