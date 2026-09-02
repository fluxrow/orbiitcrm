/**
 * Testes A–P da condução comercial v2 (sinais acumulados + permissões).
 * Puros: nenhuma chamada de rede, nenhuma dependência de tenant real.
 *
 * Rodar: deno test --allow-import supabase/functions/_shared/commercial_signals_test.ts
 */

import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  extractCommercialSignals,
  computeCommercialPermissions,
  evaluateCommercialV2,
  sanitizeCommercialV2,
  updateCommercialState,
  readCommercialState,
  replyInvitesPriceAnswer,
  detectProductInReply,
  isCommercialSaleHandoffAuthorized,
  EMPTY_COMMERCIAL_STATE,
  type CommercialStateV2,
} from "./commercial-signals.ts";

const NOW = "2026-08-12T20:00:00.000Z";
const LINK = "https://link.infinitepay.io/albuquerqueadsltda/VC1D-JKIVWAm1tg-6500,00";

function state(partial: Partial<CommercialStateV2> = {}): CommercialStateV2 {
  return { ...EMPTY_COMMERCIAL_STATE, ...partial };
}

function run(inbound: string, st: CommercialStateV2) {
  const extracted = extractCommercialSignals(inbound);
  const perms = computeCommercialPermissions(extracted, st);
  return { extracted, perms };
}

const PRICE_INFORMED = state({
  product_focus: "mentoria",
  product_explained: true,
  price_informed: { product: "mentoria", at: "2026-08-12T19:00:00.000Z" },
});

// A — "qual valor?" exige preço no mesmo turno
Deno.test("A: pergunta direta de valor obriga responder preço agora", () => {
  const { perms } = run("qual valor?", state({ product_focus: "mentoria" }));
  assert(perms.mustAnswerPriceNow);
  assert(perms.mayMentionPrice);
  assertFalse(perms.mayAskPaymentMethod);
  const v = evaluateCommercialV2("Te explico como funciona. Como você prefere seguir?", perms);
  assert(v.reasons.includes("price_omitted_when_required"));
});

Deno.test("A2: variações reais de preço curto e produto + valores são detectadas", () => {
  for (const inbound of [
    "O preço",
    "E os valores?",
    "Gostaria de saber sobre a mentoria e valores",
    "A questão maior que eu precisaria saber ainda é o preço",
    "Curso e preço",
  ]) {
    const { extracted, perms } = run(inbound, state({ product_focus: "mentoria" }));
    assert(extracted.signals.has("direct_price_question"), inbound);
    assert(perms.mustAnswerPriceNow, inbound);
  }
});

Deno.test("A3: decisão autoritativa limpa objeção financeira legada sem prova", () => {
  const contaminated = state({
    product_focus: "curso",
    budget_objection: true,
    budget_objection_verified: false,
  });
  const extracted = extractCommercialSignals(
    "Estou avaliando as condições e o retorno esperado.",
  );
  const perms = computeCommercialPermissions(extracted, contaminated);
  const next = updateCommercialState(
    contaminated,
    extracted,
    "Posso esclarecer a estrutura da Mentoria.",
    perms,
    NOW,
    { authoritativeBudgetObjection: false },
  );
  assertFalse(next.budget_objection);
  assertFalse(next.budget_objection_verified === true);
});

// B — "quanto custa a mentoria?" responde preço sem iniciar pagamento
Deno.test("B: quanto custa -> preço permitido, pagamento não", () => {
  const { perms } = run("quanto custa a mentoria?", state());
  assert(perms.mustAnswerPriceNow);
  assertFalse(perms.mayAskPaymentMethod);
  assertFalse(perms.maySharePaymentDetails);
  const ok = evaluateCommercialV2("A Mentoria é R$ 6.500. Ela é individual e vai direto no seu caso.", perms);
  assertFalse(ok.violates);
});

// C — pergunta de parcelamento é pergunta de preço
Deno.test("C: parcelamento obriga preço/condição e não abre checkout", () => {
  const { perms } = run("da pra parcelar?", PRICE_INFORMED);
  assert(perms.mustAnswerPriceNow);
  const v = evaluateCommercialV2("Dá sim: 12x de R$ 650 no cartão.", perms);
  assertFalse(v.violates);
});

// D — total do parcelamento nunca aparece
Deno.test("D: total acumulado do parcelamento é sempre removido", () => {
  const { perms } = run("quantas vezes posso parcelar?", PRICE_INFORMED);
  const v = evaluateCommercialV2("Fica 12x de R$ 650, totalizando R$ 7.800.", perms);
  assert(v.reasons.includes("installment_total_disclosed"));
  const s = sanitizeCommercialV2("Fica 12x de R$ 650. Totalizando R$ 7.800 no total.", perms);
  assertFalse(/totalizando/i.test(s.text));
  assert(/650/.test(s.text));
});

// E — interesse ambíguo não força preço nem pagamento
Deno.test("E: interesse ambíguo permite preço mas não obriga", () => {
  const { perms } = run("tenho interesse", state({ product_focus: "mentoria", product_explained: true }));
  assert(perms.mayMentionPrice);
  assertFalse(perms.mustAnswerPriceNow);
  assertFalse(perms.mayAskPaymentMethod);
});

// F — dado cadastral isolado nunca é sinal comercial
Deno.test("F: e-mail isolado não gera sinal comercial", () => {
  const { extracted, perms } = run("joao@empresa.com.br", state());
  assert(extracted.signals.has("contact_data_only"));
  assertFalse(perms.mayMentionPrice);
  assertFalse(perms.mustAnswerPriceNow);
  assertFalse(perms.mayAskPaymentMethod);
  assertFalse(perms.maySharePaymentDetails);
});

// G — preço sem contexto e sem pergunta é removido
Deno.test("G: preço espontâneo em conversa fria é sanitizado", () => {
  const { perms } = run("bom dia", state());
  const v = evaluateCommercialV2("Bom dia! A Mentoria custa R$ 6.500.", perms);
  assert(v.reasons.includes("price_without_context"));
  const s = sanitizeCommercialV2("Bom dia! A Mentoria custa R$ 6.500.", perms);
  assertFalse(/6\.500/.test(s.text));
  assert(/Bom dia/.test(s.text));
});

// H — preço obrigatório nunca é apagado pela sanitização
Deno.test("H: sanitização preserva preço quando é obrigatório", () => {
  const { perms } = run("qual o valor da mentoria?", state());
  const s = sanitizeCommercialV2("A Mentoria é R$ 6.500. Quer que eu gere o link agora?", perms);
  assert(/6\.500/.test(s.text));
});

// I — fechamento explícito após preço libera pergunta de forma
Deno.test("I: quero fechar após preço libera PIX ou cartão", () => {
  const { perms } = run("quero fechar", PRICE_INFORMED);
  assert(perms.closingRecognized);
  assert(perms.mayAskPaymentMethod);
  assertFalse(perms.maySharePaymentDetails);
  const v = evaluateCommercialV2("Perfeito. Prefere no PIX ou no cartão?", perms);
  assertFalse(v.violates);
});

// J — aceite curto sem contexto não é fechamento
Deno.test("J: 'bora' sem preço informado não abre pagamento", () => {
  const { perms } = run("bora", state());
  assertFalse(perms.closingRecognized);
  assertFalse(perms.mayAskPaymentMethod);
  const v = evaluateCommercialV2("Fechado! Prefere PIX ou cartão?", perms);
  assert(v.reasons.includes("payment_method_without_intent"));
});

// K — preserva o fechamento legado, mas notificação exige confirmação explícita
Deno.test("K: 'bora' com preço mantém checkout sem autorizar notificação verificada", () => {
  const { perms } = run("bora", PRICE_INFORMED);
  assert(perms.closingRecognized);
  assert(perms.mayAskPaymentMethod);
  assertFalse(perms.verifiedPurchaseIntent);
});

Deno.test("K2: 'bora' aguardando confirmação da oferta é fechamento", () => {
  const awaiting = state({ ...PRICE_INFORMED, awaiting_offer_confirmation: "mentoria" });
  const { perms } = run("bora", awaiting);
  assert(perms.closingRecognized);
  assert(perms.mayAskPaymentMethod);
  assert(perms.verifiedPurchaseIntent);
});

Deno.test("K3: objetivos vagos e link sem finalidade de pagamento nunca verificam intenção", () => {
  for (const inbound of [
    "Quero começar do zero",
    "Quero começar a ganhar dinheiro com vídeos",
    "Pode enviar o link da publicação para eu lembrar",
    "Quero sim",
  ]) {
    const { extracted, perms } = run(inbound, PRICE_INFORMED);
    assertFalse(extracted.signals.has("verified_purchase_intent"), inbound);
    assertFalse(perms.verifiedPurchaseIntent, inbound);
  }
});

Deno.test("K4: pergunta genérica de próximo passo informa preço sem notificar intenção verificada", () => {
  const { perms } = run("Como faço para começar?", state({ product_focus: "mentoria", product_explained: true }));
  assert(perms.closingRecognized);
  assert(perms.mustAnswerPriceNow);
  assertFalse(perms.verifiedPurchaseIntent);
});

// L — link só depois da escolha da forma
Deno.test("L: link novo apenas após escolha de cartão", () => {
  const antes = run("quero fechar", PRICE_INFORMED);
  const vAntes = evaluateCommercialV2(`Aqui está: ${LINK}`, antes.perms);
  assert(vAntes.reasons.includes("payment_details_without_method"));

  const aguardando = state({ ...PRICE_INFORMED, awaiting_payment_method: true, closing_intent_at: NOW });
  const depois = run("cartão", aguardando);
  assertEquals(depois.extracted.paymentMethod, "cartao");
  assert(depois.perms.maySharePaymentDetails);
  const vDepois = evaluateCommercialV2(`Perfeito, segue o link: ${LINK}`, depois.perms);
  assertFalse(vDepois.violates);
});

// M — PIX escolhido libera chave
Deno.test("M: escolha de PIX libera chave, sem exigir link de cartão", () => {
  const aguardando = state({ ...PRICE_INFORMED, awaiting_payment_method: true, closing_intent_at: NOW });
  const { perms } = run("prefiro no pix", aguardando);
  assertEquals(perms.chosenMethod, "pix");
  assert(perms.maySharePaymentDetails);
  assertFalse(evaluateCommercialV2("Segue a chave PIX para pagamento.", perms).violates);
});

// N — objeção de orçamento não bloqueia preço e não abre checkout
Deno.test("N: objeção de orçamento mantém conversa consultiva", () => {
  const { extracted, perms } = run("está muito caro pra mim agora", PRICE_INFORMED);
  assert(extracted.signals.has("budget_objection"));
  assert(perms.mayMentionPrice);
  assertFalse(perms.mayAskPaymentMethod);
  const next = updateCommercialState(perms ? PRICE_INFORMED : PRICE_INFORMED, extracted, "Entendo. Dá pra começar pelo curso.", perms, NOW);
  assert(next.budget_objection);
});

Deno.test("N2: objeções reais de expectativa e momento financeiro são detectadas", () => {
  for (const inbound of [
    "Acho um pouco acima do valor da minha expectativa",
    "Fica acima da expectativa",
    "Nesse momento não teria esse investimento",
    "Esse valor no momento é além do que eu posso",
    "Muito além do meu orçamento",
  ]) {
    const { extracted } = run(inbound, PRICE_INFORMED);
    assert(extracted.signals.has("budget_objection"), inbound);
  }
});

// O — estado é idempotente e sem PII
Deno.test("O: estado acumula sem PII e é idempotente", () => {
  const { extracted, perms } = run("qual valor da mentoria?", state());
  const after1 = updateCommercialState(state(), extracted, "A Mentoria é R$ 6.500.", perms, NOW);
  assertEquals(after1.price_informed?.product, "mentoria");
  assertFalse(after1.unanswered_price_question);
  const after2 = updateCommercialState(after1, extracted, "A Mentoria é R$ 6.500.", perms, "2026-08-12T21:00:00.000Z");
  assertEquals(after2.price_informed?.at, "2026-08-12T21:00:00.000Z");
  const serialized = JSON.stringify(after2);
  assertFalse(/@|\+55|\d{11}/.test(serialized));
  // round-trip
  assertEquals(readCommercialState({ commercial_v2: after2 }), after2);
});

// P — regressão: prova social e comportamento legado intactos
Deno.test("P: pergunta informacional não vira preço nem pagamento", () => {
  const { extracted, perms } = run("como funciona a mentoria?", state());
  assert(extracted.signals.has("informational_question"));
  assertFalse(perms.mustAnswerPriceNow);
  assertFalse(perms.mayAskPaymentMethod);
  assertFalse(perms.maySharePaymentDetails);
  const v = evaluateCommercialV2("São encontros individuais comigo, focados no seu caso.", perms);
  assertFalse(v.violates);
});

Deno.test("P2: 'Opa' isolado não gera nenhum sinal comercial forte", () => {
  const { extracted, perms } = run("Opa", PRICE_INFORMED);
  assertFalse(extracted.signals.has("explicit_closing_intent"));
  assertFalse(perms.closingRecognized);
  assertFalse(perms.mayAskPaymentMethod);
  assertFalse(perms.maySharePaymentDetails);
});

Deno.test("P3: pergunta de preço pendente permanece obrigatória no turno seguinte", () => {
  const { extracted, perms } = run("qual o valor?", state());
  const pendente = updateCommercialState(state(), extracted, "Deixa eu entender seu momento antes.", perms, NOW);
  assert(pendente.unanswered_price_question);
  const proximo = run("é isso", pendente);
  assert(proximo.perms.mustAnswerPriceNow);
});

Deno.test("Q: mencionar investimento sem número não registra preço informado", () => {
  const st = state({ product_focus: "mentoria", product_explained: true });
  const { extracted, perms } = run("A estrutura para fazer", st);
  const resposta = "É exatamente isso que a Mentoria resolve. Você quer saber como funciona o investimento?";
  assert(replyInvitesPriceAnswer(resposta));
  assertFalse(evaluateCommercialV2(resposta, perms).hasPrice);

  const next = updateCommercialState(st, extracted, resposta, perms, NOW);
  assertEquals(next.price_informed, null);
  assert(next.awaiting_price_answer);
});

Deno.test("Q2: aceite da oferta de investimento exige o preço no turno seguinte", () => {
  const pending = state({
    product_focus: "mentoria",
    product_explained: true,
    awaiting_price_answer: true,
  });
  const { perms } = run("Sim, por favor", pending);
  assert(perms.mustAnswerPriceNow);
  assertFalse(perms.mayAskPaymentMethod);
  assert(evaluateCommercialV2(
    "A Mentoria tem pagamento à vista no PIX ou parcelado no cartão.",
    perms,
  ).reasons.includes("price_omitted_when_required"));
  assertFalse(evaluateCommercialV2(
    "A Mentoria custa R$ 6.500 à vista no PIX ou 12x de R$ 650 no cartão.",
    perms,
  ).violates);
});

Deno.test("Q2b: resposta não afirmativa não força preço fora de contexto", () => {
  const pending = state({
    product_focus: "mentoria",
    product_explained: true,
    awaiting_price_answer: true,
  });
  const { extracted, perms } = run("Só um momento", pending);
  assertFalse(perms.mustAnswerPriceNow);
  const next = updateCommercialState(pending, extracted, "Claro, fico à disposição.", perms, NOW);
  assertFalse(next.awaiting_price_answer);
});

Deno.test("Q3: PIX isolado sem intenção comprovada não autoriza venda/handoff", () => {
  const falseContext = state({
    product_focus: "mentoria",
    product_explained: true,
    price_informed: { product: "mentoria", at: NOW },
    awaiting_payment_method: true,
  });
  const current = run("PIX", falseContext);
  assertFalse(current.perms.closingRecognized);
  assertFalse(isCommercialSaleHandoffAuthorized(current.extracted, falseContext, current.perms));
});

Deno.test("Q4: escolha da forma após fechamento comprovado mantém handoff autorizado", () => {
  const valid = state({
    ...PRICE_INFORMED,
    awaiting_payment_method: true,
    closing_intent_at: NOW,
  });
  const current = run("PIX", valid);
  assert(isCommercialSaleHandoffAuthorized(current.extracted, valid, current.perms));
});

Deno.test("R: preço da Mentoria nunca autoriza pagamento do Curso", () => {
  const mentorshipPriced = state({
    product_focus: "curso",
    product_explained: true,
    price_informed: { product: "mentoria", at: NOW },
    awaiting_offer_confirmation: "curso",
  });
  const extracted = extractCommercialSignals("sim");
  const perms = computeCommercialPermissions(extracted, mentorshipPriced, {
    effectiveProduct: "curso",
    defaultPaymentMethod: "pix",
  });
  assertFalse(perms.closingRecognized);
  assertFalse(perms.maySharePaymentDetails);
});

Deno.test("R2: downsell com preço troca o estado para Curso e aguarda um único aceite", () => {
  const mentorshipPriced = state({
    product_focus: "mentoria",
    product_explained: true,
    price_informed: { product: "mentoria", at: NOW },
  });
  const objection = extractCommercialSignals(
    "sim, faz. mas infelizmente está fora do meu alcance financeiro",
  );
  assert(objection.signals.has("budget_objection"));
  const perms = computeCommercialPermissions(objection, mentorshipPriced, {
    effectiveProduct: "curso",
  });
  const reply = "Entendo. Tenho o Curso Gravado por R$ 997 à vista no PIX. Faz mais sentido para você?";
  assertEquals(detectProductInReply(reply), "curso");
  const next = updateCommercialState(mentorshipPriced, objection, reply, perms, NOW);
  assertEquals(next.product_focus, "curso");
  assertEquals(next.price_informed?.product, "curso");
  assertEquals(next.awaiting_offer_confirmation, "curso");
  assertEquals(next.payment_method, null);
  assertEquals(next.closing_intent_at, null);

  const accepted = extractCommercialSignals("sim");
  const acceptedPerms = computeCommercialPermissions(accepted, next, {
    effectiveProduct: "curso",
    defaultPaymentMethod: "pix",
  });
  assert(acceptedPerms.closingRecognized);
  assertEquals(acceptedPerms.chosenMethod, "pix");
  assertFalse(acceptedPerms.mayAskPaymentMethod);
  assert(acceptedPerms.maySharePaymentDetails);
});

Deno.test("R3: trocar para Curso sem informar R$ 997 invalida o preço herdado", () => {
  const mentorshipPriced = state({
    product_focus: "mentoria",
    product_explained: true,
    price_informed: { product: "mentoria", at: NOW },
  });
  const objection = extractCommercialSignals("está fora do meu alcance financeiro");
  const perms = computeCommercialPermissions(objection, mentorshipPriced, { effectiveProduct: "curso" });
  const next = updateCommercialState(
    mentorshipPriced,
    objection,
    "Tenho o Curso Gravado com o mesmo método. Faz sentido para você?",
    perms,
    NOW,
  );
  assertEquals(next.product_focus, "curso");
  assertEquals(next.price_informed, null);
  assertEquals(next.awaiting_offer_confirmation, null);
});
