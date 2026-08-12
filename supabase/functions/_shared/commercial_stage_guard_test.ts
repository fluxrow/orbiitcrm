import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isInboundOnlyContactData,
  hasExplicitPricingIntent,
  hasExplicitClosingIntent,
  hasCommercialAdvance,
  evaluateCommercialStage,
  enforceCommercialStage,
  COMMERCIAL_GUARD_FALLBACK,
} from "./commercial-stage-guard.ts";
import { detectEmailCollection, enforceNoEmailCollection } from "./no-email-collection.ts";

const PRECO = "A mentoria custa R$ 6.500,00 à vista no PIX ou parcelado no cartão. Para você, fica melhor fazer à vista no PIX ou parcelado no cartão de crédito?";

Deno.test("CS-A: caso real Daniel — inbound só e-mail + resposta com preço bloqueia e cai no fallback", () => {
  const r = enforceCommercialStage("sdjdaniel@gmail.com", PRECO, true);
  assert(r.changed);
  assert(r.fallbackUsed);
  assertEquals(r.text, COMMERCIAL_GUARD_FALLBACK);
  assertEquals(r.verdict.reason, "inbound_only_contact_data");
  assertEquals(hasCommercialAdvance(r.text), false);
});

Deno.test("CS-B: 'boa noite, meu email é x@y.com' não autoriza preço", () => {
  assert(isInboundOnlyContactData("boa noite, meu email é x@y.com"));
  assert(isInboundOnlyContactData("  sdjdaniel@gmail.com  "));
  assert(isInboundOnlyContactData("Oi, segue meu e-mail: a.b@c.com.br. Obrigado!"));
  const r = enforceCommercialStage("boa noite, meu email é x@y.com", PRECO, true);
  assertEquals(r.text, COMMERCIAL_GUARD_FALLBACK);
});

Deno.test("CS-C: 'quanto custa?' libera preço", () => {
  assert(hasExplicitPricingIntent("quanto custa?"));
  assert(hasExplicitPricingIntent("qual o valor da mentoria?"));
  assert(hasExplicitPricingIntent("dá pra parcelar?"));
  const r = enforceCommercialStage("quanto custa?", PRECO, true);
  assertEquals(r.changed, false);
  assertEquals(r.text, PRECO);
});

Deno.test("CS-D: 'quero fechar' libera pergunta PIX/cartão", () => {
  assert(hasExplicitClosingIntent("quero fechar"));
  assert(hasExplicitClosingIntent("como faço para pagar?"));
  assert(hasExplicitClosingIntent("fechado, pode gerar o pedido"));
  const msg = "Perfeito! Para você, fica melhor fazer à vista no PIX ou parcelado no cartão de crédito?";
  const r = enforceCommercialStage("quero fechar", msg, true);
  assertEquals(r.changed, false);
  assertEquals(r.text, msg);
});

Deno.test("CS-E: 'como funciona a mentoria?' não permite PIX/cartão", () => {
  const inbound = "como funciona a mentoria?";
  assertEquals(hasExplicitPricingIntent(inbound), false);
  assertEquals(hasExplicitClosingIntent(inbound), false);
  const resposta = "São 3 meses de acompanhamento direto comigo, com nichos validados. Para você, fica melhor à vista no PIX ou parcelado no cartão?";
  const r = enforceCommercialStage(inbound, resposta, true);
  assert(r.changed);
  assertEquals(r.fallbackUsed, false);
  assertEquals(r.text, "São 3 meses de acompanhamento direto comigo, com nichos validados.");
  assertEquals(hasCommercialAdvance(r.text), false);
});

Deno.test("CS-F: dado cadastral isolado não avança estágio (telefone/nome)", () => {
  assert(isInboundOnlyContactData("meu whatsapp é 47 99123-7508"));
  assertEquals(evaluateCommercialStage("meu whatsapp é 47 99123-7508", PRECO).violates, true);
  // Nome isolado não é dado de contato reconhecido, mas também não gera intenção.
  const v = evaluateCommercialStage("Daniel", PRECO);
  assertEquals(v.pricingIntent, false);
  assertEquals(v.closingIntent, false);
  assertEquals(v.reason, "no_commercial_intent");
});

Deno.test("CS-G: e-mail espontâneo não é repetido nem confirmado", () => {
  const ok = "Perfeito. Seguimos por aqui mesmo no WhatsApp. Qual é o seu objetivo com o canal?";
  assertEquals(hasCommercialAdvance(ok), false);
  assertEquals(detectEmailCollection(ok).violates, false);
  assertEquals(enforceCommercialStage("sdjdaniel@gmail.com", ok, true).changed, false);
  assert(!/@/.test(COMMERCIAL_GUARD_FALLBACK));
});

Deno.test("CS-H: outros tenants inalterados (guard desligado)", () => {
  const r = enforceCommercialStage("sdjdaniel@gmail.com", PRECO, false);
  assertEquals(r.changed, false);
  assertEquals(r.text, PRECO);
});

Deno.test("CS-I: prova social e regra no-email sem regressão", () => {
  const inbound = "pode me mostrar resultados de alunos?";
  const resposta = "Claro, te mando um vídeo curto com resultados reais agora. Você já tem canal no ar?";
  const r = enforceCommercialStage(inbound, resposta, true);
  assertEquals(r.changed, false);
  assertEquals(r.text, resposta);
  // no-email guard continua permitindo o informativo e bloqueando coleta.
  assertEquals(enforceNoEmailCollection("Não enviamos por e-mail, seguimos por aqui.", true).changed, false);
  assert(enforceNoEmailCollection("Qual seu melhor e-mail?", true).changed);
  // Fallback comercial não pede e-mail.
  assertEquals(detectEmailCollection(COMMERCIAL_GUARD_FALLBACK).violates, false);
});

Deno.test("CS-J: notificações internas não são afetadas (guard só na resposta ao lead)", () => {
  const notif = "Novo lead qualificado: Daniel. E-mail: sdjdaniel@gmail.com. Valor previsto R$ 6.500,00.";
  // Guard desligado no caminho interno => texto intacto.
  assertEquals(enforceCommercialStage(null, notif, false).text, notif);
});
