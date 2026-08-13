import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  detectIdentitySplit,
  enforceNoIdentitySplit,
  isHandoffAllowed,
  leadRequestsHuman,
  buildIdentityPromptBlock,
  IDENTITY_GUARD_FALLBACK,
} from "./no-identity-split.ts";
import { replyExplainsOffer, updateCommercialState } from "./commercial-signals.ts";

const NO_HANDOFF = { leadAskedHuman: false, humanTalk: false, handoffAuthorized: false };

// A) Caso Ronaldo exato — saída real que gerou o incidente.
Deno.test("A) Ronaldo: oferta de especialista é violação e é sanitizada", () => {
  const out =
    "Ficou claro então. Quer que eu te coloque em contato com um especialista para seguir de forma mais objetiva?";
  const verdict = detectIdentitySplit(out, NO_HANDOFF);
  assert(verdict.violates);
  const enforced = enforceNoIdentitySplit(out, true, NO_HANDOFF);
  assert(enforced.changed);
  assertFalse(/especialista/i.test(enforced.text));
});

// B) "Ficou mais claro" → continuação natural em primeira pessoa passa intacta.
Deno.test("B) continuação natural em primeira pessoa passa intacta", () => {
  const out = "Que bom! Quer que eu te mostre o investimento ou ficou outra dúvida?";
  assertFalse(detectIdentitySplit(out, NO_HANDOFF).violates);
  assertEquals(enforceNoIdentitySplit(out, true, NO_HANDOFF).changed, false);
});

// C) "Quero avançar" → resposta comercial sem especialista.
Deno.test("C) avanço comercial sem terceiro passa intacto", () => {
  const out = "Perfeito. A Mentoria é R$6.500 no PIX ou 12x de R$642,44 no cartão. Prefere qual forma?";
  assertFalse(detectIdentitySplit(out, NO_HANDOFF).violates);
});

// D) Handoff legítimo: lead pediu pessoa. Transferência real permitida, perito fictício não.
Deno.test("D) handoff legítimo permite aviso neutro mas não especialista fictício", () => {
  const ctx = { leadAskedHuman: true };
  assert(isHandoffAllowed(ctx));
  assertFalse(detectIdentitySplit("Claro, eu mesmo continuo com você por aqui.", ctx).violates);
  assert(detectIdentitySplit("Vou colocar um especialista para falar com você.", ctx).violates);
});

// E) Dúvida técnica respondida em primeira pessoa.
Deno.test("E) dúvida técnica em primeira pessoa passa", () => {
  const out = "Eu mesmo analiso seu canal e ajusto os roteiros com você durante a Mentoria.";
  assertFalse(detectIdentitySplit(out, NO_HANDOFF).violates);
});

// F) Saída simulada "vou chamar um especialista" → sanitize/fallback.
Deno.test("F) 'vou chamar um especialista' cai no fallback de primeira pessoa", () => {
  const enforced = enforceNoIdentitySplit("Vou chamar um especialista para te atender.", true, NO_HANDOFF);
  assert(enforced.changed);
  assert(enforced.fallbackUsed);
  assertEquals(enforced.text, IDENTITY_GUARD_FALLBACK);
});

// G) "IA especialista em algoritmo" é legítimo.
Deno.test("G) IA especialista em algoritmo é permitida", () => {
  const out =
    "Você recebe acesso à IA especialista em algoritmo do YouTube para minerar referências.";
  assertFalse(detectIdentitySplit(out, NO_HANDOFF).violates);
  assertFalse(
    detectIdentitySplit("Tenho uma IA especialista em algoritmo que valida seus títulos.", NO_HANDOFF).violates,
  );
});

// H) human_talk=true → handoff permitido (agente não deve inventar terceiro mesmo assim).
Deno.test("H) human_talk=true libera handoff e mantém proibição de perito fictício", () => {
  const ctx = { humanTalk: true };
  assert(isHandoffAllowed(ctx));
  assert(detectIdentitySplit("Vou te encaminhar para um consultor.", ctx).violates);
});

// Fernando em terceira pessoa é sempre violação.
Deno.test("Fernando em terceira pessoa é sempre violação", () => {
  for (const ctx of [NO_HANDOFF, { leadAskedHuman: true }, { humanTalk: true }]) {
    assert(detectIdentitySplit("Você quer falar com o Fernando?", ctx).violates);
    assert(detectIdentitySplit("O Fernando vai entrar em contato com você.", ctx).violates);
  }
});

// I) product_explained persiste true quando a saída explica a Mentoria.
Deno.test("I) product_explained marcado a partir da explicação na resposta", () => {
  assert(replyExplainsOffer("São 3 meses com acompanhamento direto e nichos já validados."));
  assert(replyExplainsOffer("A mentoria funciona com estrutura de validação e roteiros de alta retenção."));
  assertFalse(replyExplainsOffer("Que bom, ficou claro então?"));

  const baseState: any = {
    product_focus: null,
    product_explained: false,
    budget_objection: false,
    price_answered: false,
    payment_method_asked: false,
    payment_details_sent: false,
    closing_intent: false,
  };
  const extracted: any = { signals: new Set<string>(), productMentioned: null };
  const perms: any = {
    mayAnswerPrice: false,
    mayAskPaymentMethod: false,
    maySharePaymentDetails: false,
  };
  const reply = "A mentoria funciona em 3 meses com acompanhamento direto e nichos já validados.";

  const legacy = updateCommercialState(baseState, extracted, reply, perms, new Date().toISOString());
  assertEquals(legacy.product_explained, false, "sem a flag, comportamento legado preservado");

  const flagged = updateCommercialState(baseState, extracted, reply, perms, new Date().toISOString(), {
    detectExplanationInReply: true,
  });
  assertEquals(flagged.product_explained, true);
  // Idempotência: reaplicar mantém true.
  const again = updateCommercialState(flagged, extracted, "Ok!", perms, new Date().toISOString(), {
    detectExplanationInReply: true,
  });
  assertEquals(again.product_explained, true);
});

// J) Regressão dos padrões reais observados no tenant.
Deno.test("J) regressão das ocorrências reais de falsa transferência", () => {
  const reais = [
    "Perfeito. Vou colocar um especialista para avançarmos de forma mais objetiva.",
    "Quer que eu te coloque em contato com um especialista?",
    "Vou encaminhar para a nossa equipe dar continuidade.",
    "Um consultor entra em contato com você em breve.",
  ];
  for (const msg of reais) {
    assert(detectIdentitySplit(msg, NO_HANDOFF).violates, msg);
    const enforced = enforceNoIdentitySplit(msg, true, NO_HANDOFF);
    assertFalse(/especialista|consultor|nossa equipe/i.test(enforced.text), msg);
  }
});

// K) Outros tenants: guard desligado não altera nada.
Deno.test("K) guard desligado preserva a saída byte-for-byte", () => {
  const out = "Perfeito. Vou colocar um especialista para avançarmos de forma mais objetiva.";
  const enforced = enforceNoIdentitySplit(out, false, NO_HANDOFF);
  assertEquals(enforced.text, out);
  assertEquals(enforced.changed, false);
});

// Detector de pedido de humano.
Deno.test("leadRequestsHuman só dispara em pedido explícito", () => {
  assert(leadRequestsHuman("Quero falar com uma pessoa"));
  assert(leadRequestsHuman("Isso é um robô?"));
  assertFalse(leadRequestsHuman("Ficou mais claro."));
  assertFalse(leadRequestsHuman("Entendi e qual valor fica"));
});

// Bloco de prompt reflete o estado de handoff.
Deno.test("bloco de prompt muda conforme handoff permitido", () => {
  assert(buildIdentityPromptBlock(false).includes("NÃO existe pedido de atendimento humano"));
  assert(buildIdentityPromptBlock(true).includes("continua por aqui"));
});
