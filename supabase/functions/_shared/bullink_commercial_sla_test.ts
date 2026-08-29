/**
 * Smokes A–P: condução comercial (preço/downsell/preço fixo) + debounce 20s +
 * SLA 60s do tenant Bullink. Puros: zero rede, zero Z-API, zero tenant real.
 *
 * Rodar: deno test --allow-import supabase/functions/_shared/bullink_commercial_sla_test.ts
 */

import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  extractCommercialSignals,
  computeCommercialPermissions,
  evaluateCommercialV2,
  updateCommercialState,
  isCommercialSaleHandoffAuthorized,
  EMPTY_COMMERCIAL_STATE,
  type CommercialStateV2,
} from "./commercial-signals.ts";
import {
  readPrimaryOfferLockConfig,
  computePrimaryOfferPermission,
  evaluateSecondaryOfferV2,
  sanitizeSecondaryOfferV2,
  buildPrimaryOfferPromptBlock,
  detectSecondaryOffer,
} from "./primary-offer-guard.ts";
import {
  readDebounceConfig,
  computeFireAfter,
  decideDebounce,
  isRecoverable,
  evaluateReplySla,
  readFreshClaimResetFlag,
  readLockBusyRetryFlag,
  type DebounceRow,
} from "./ai-reply-debounce.ts";

const PRIMARY_LINE = "R$ 6.500 à vista no PIX ou 12x de R$ 650 no cartão";
const SECONDARY_LINE = "R$ 997 à vista no PIX";
const LINK = "https://link.infinitepay.io/albuquerqueadsltda/VC1D-JKIVWAm1tg-6500,00";

const CFG = readPrimaryOfferLockConfig({
  primary_offer_lock: {
    enabled: true,
    primary_focus: "mentoria",
    primary_focus_tags: ["OFERTA_MENTORIA"],
    secondary_focus: "curso",
    secondary_label: "Curso Gravado",
    primary_price_line: PRIMARY_LINE,
    secondary_price_line: SECONDARY_LINE,
    anti_repetition_enabled: true,
  },
})!;

function state(partial: Partial<CommercialStateV2> = {}): CommercialStateV2 {
  return { ...EMPTY_COMMERCIAL_STATE, ...partial };
}

const EXPLAINED = state({ product_focus: "mentoria", product_explained: true });
const PRICED = state({
  product_focus: "mentoria",
  product_explained: true,
  price_informed: { product: "mentoria", at: "2026-08-13T18:00:00.000Z" },
});

function perms(inbound: string, st: CommercialStateV2 = state()) {
  const extracted = extractCommercialSignals(inbound);
  return {
    extracted,
    perms: computeCommercialPermissions(extracted, st, {
      suppressRepeatedPrice: CFG.antiRepetitionEnabled,
    }),
  };
}

function offer(inbound: string, st: CommercialStateV2 = state()) {
  return computePrimaryOfferPermission({
    cfg: CFG,
    inbound,
    tags: [],
    stateFocus: st.product_focus,
    stateBudgetObjection: st.budget_objection,
  });
}

// ── A: pergunta direta de valor ──
Deno.test("A: 'Qual o valor?' exige preço da Mentoria, sem total e sem Curso", () => {
  const { perms: p } = perms("Qual o valor?", EXPLAINED);
  assert(p.mustAnswerPriceNow);
  assertFalse(p.mayAskPaymentMethod);
  assertFalse(p.maySharePaymentDetails);

  const ok = `O investimento é ${PRIMARY_LINE}.`;
  assertFalse(evaluateCommercialV2(ok, p).violates);
  const op = offer("Qual o valor?", EXPLAINED);
  assertFalse(op.maySecondary);
  assertFalse(op.mustSecondary);
  assertFalse(evaluateSecondaryOfferV2(ok, CFG, op).violates);

  // total acumulado é sempre violação
  assert(evaluateCommercialV2("São 12x de R$ 650, totalizando R$ 7.800.", p).violates);
  // cardápio com o Curso é violação
  assert(detectSecondaryOffer(`${ok} Também tenho o Curso Gravado por R$ 997.`, CFG, op).violates);
});

// ── B: intenção comercial explícita após explicação ──
Deno.test("B: 'Quero entrar na mentoria' informa investimento e mantém pagamento bloqueado", () => {
  const { perms: p } = perms("Quero entrar na mentoria", EXPLAINED);
  assert(p.closingRecognized);
  assert(p.mustAnswerPriceNow, "deve informar o investimento no mesmo turno");
  assertFalse(p.mayAskPaymentMethod, "pagamento ainda bloqueado sem preço informado");
  assertFalse(p.maySharePaymentDetails);
  assert(evaluateCommercialV2("Bora! Como você prefere pagar?", p).violates);
  assertFalse(evaluateCommercialV2(`Boa! O investimento é ${PRIMARY_LINE}.`, p).violates);
});

Deno.test("B2: 'Como faço para começar?' também obriga o investimento", () => {
  const { perms: p } = perms("Como faço para começar?", EXPLAINED);
  assert(p.mustAnswerPriceNow);
  assertFalse(p.maySharePaymentDetails);
});

// ── C: interesse temático não é comercial ──
Deno.test("C: 'nicho validado' não apresenta preço", () => {
  const { perms: p } = perms("nicho validado", EXPLAINED);
  assertFalse(p.mustAnswerPriceNow);
  assertFalse(p.mayAskPaymentMethod);
  const op = offer("nicho validado", EXPLAINED);
  assertFalse(op.mustSecondary);
});

// ── D: "sim" isolado ──
Deno.test("D: 'Sim' isolado após pergunta informativa não apresenta preço", () => {
  const { extracted, perms: p } = perms("Sim", EXPLAINED);
  assertFalse(extracted.signals.has("explicit_closing_intent"));
  assertFalse(p.mustAnswerPriceNow);
  assertFalse(p.mayAskPaymentMethod);
  assertFalse(p.maySharePaymentDetails);
});

Deno.test("D2: 'ficou claro' não apresenta preço", () => {
  const { perms: p } = perms("ficou claro", EXPLAINED);
  assertFalse(p.mustAnswerPriceNow);
});

Deno.test("D3: regressão Claudia — convite para investimento não conta como preço", () => {
  const before = state({ product_focus: "mentoria", product_explained: true });
  const first = perms("A estrutura para fazer", before);
  const outbound = "É exatamente isso que a Mentoria resolve. Você quer saber como funciona o investimento?";
  const pending = updateCommercialState(before, first.extracted, outbound, first.perms, "2026-08-29T12:13:29.135Z");
  assertEquals(pending.price_informed, null);
  assert(pending.awaiting_price_answer);

  const accepted = perms("Sim por favor", pending);
  assert(accepted.perms.mustAnswerPriceNow);
  assertFalse(accepted.perms.mayAskPaymentMethod);
  assert(evaluateCommercialV2(
    "A Mentoria tem duas formas de pagamento: à vista no PIX ou parcelado no cartão.",
    accepted.perms,
  ).reasons.includes("price_omitted_when_required"));
  assertFalse(evaluateCommercialV2(`O investimento é ${PRIMARY_LINE}.`, accepted.perms).violates);
});

Deno.test("D4: regressão Claudia — PIX sem fechamento não vira venda", () => {
  const invalid = state({
    product_focus: "mentoria",
    product_explained: true,
    price_informed: { product: "mentoria", at: "2026-08-29T12:13:29.135Z" },
    awaiting_payment_method: true,
  });
  const current = perms("PIX", invalid);
  assertFalse(isCommercialSaleHandoffAuthorized(current.extracted, invalid, current.perms));
});

// ── E: quero saber mais ──
Deno.test("E: 'Quero saber mais' explica sem preço automático", () => {
  const { extracted, perms: p } = perms("Quero saber mais", EXPLAINED);
  assert(extracted.signals.has("purchase_interest"));
  assertFalse(p.mustAnswerPriceNow);
  assertFalse(p.mayAskPaymentMethod);
});

// ── F/G/H: objeção de orçamento → Curso imediato ──
const OBJECOES: Array<[string, string]> = [
  ["F", "Achei caro"],
  ["G", "Esse investimento pesa"],
  ["H", "Vou tentar levantar esse valor"],
  ["H2", "Está fora do meu alcance agora"],
  ["H3", "Esse valor pra mim hoje não é possível"],
  ["H4", "Falta de dinheiro"],
];
for (const [id, frase] of OBJECOES) {
  Deno.test(`${id}: "${frase}" → Curso Gravado imediato, respeitoso`, () => {
    const op = offer(frase, PRICED);
    assert(op.mustSecondary, "alternativa é obrigatória neste turno");
    assert(op.maySecondary);

    // omitir a alternativa é violação
    const semAlt = "Entendo. A Mentoria é o caminho mais rápido, vale o esforço.";
    const v = evaluateSecondaryOfferV2(semAlt, CFG, op);
    assert(v.reasons.includes("secondary_offer_omitted_when_required"));
    const fixed = sanitizeSecondaryOfferV2(semAlt, CFG, op);
    assert(/Curso Gravado/.test(fixed.text));
    assert(/997/.test(fixed.text));
    assertFalse(evaluateSecondaryOfferV2(fixed.text, CFG, op).violates);

    // resposta correta passa direto
    const ok = `Entendo, cara. Pra você não ficar sem um caminho, tenho o Curso Gravado por ${SECONDARY_LINE}, com o mesmo método, só sem meu acompanhamento individual. Faz mais sentido pra você?`;
    assertFalse(evaluateSecondaryOfferV2(ok, CFG, op).violates);
    assert(ok.length <= 300 || ok.length <= 320);

    // julgamento é sempre violação e é removido
    const julga = `Você está desempregado, então não é o seu momento. Tenho o Curso Gravado por ${SECONDARY_LINE}.`;
    const vj = evaluateSecondaryOfferV2(julga, CFG, op);
    assert(vj.reasons.includes("judgmental_framing"));
    const sj = sanitizeSecondaryOfferV2(julga, CFG, op);
    assertFalse(/desempregad|seu momento/i.test(sj.text));
    assert(/Curso Gravado/.test(sj.text));
  });
}

// ── I: desconto ──
Deno.test("I: 'Tem desconto?' → valores fixos + Curso como alternativa leve, sem pressão", () => {
  const op = offer("Tem desconto?", PRICED);
  assert(op.discountRequestNow);
  assert(op.mustSecondary);

  const { perms: p } = perms("Tem desconto?", PRICED);
  assert(p.mustAnswerPriceNow, "pedido de desconto é pergunta de preço");
  assertFalse(p.mayAskPaymentMethod, "não pressionar com fechamento");

  const inventado = "Consigo te dar um desconto especial de 20%.";
  const v = evaluateSecondaryOfferV2(inventado, CFG, op);
  assert(v.reasons.includes("invented_discount"));
  const s = sanitizeSecondaryOfferV2(inventado, CFG, op);
  assertFalse(/desconto/i.test(s.text));
  assert(/Curso Gravado/.test(s.text));

  const ok = `Os valores são fixos, cara. Se quiser um caminho mais leve, tenho o Curso Gravado por ${SECONDARY_LINE}, com o mesmo método.`;
  assertFalse(evaluateSecondaryOfferV2(ok, CFG, op).violates);
});

// ── J: objeção seguida de reafirmação da Mentoria ──
Deno.test("J: 'mesmo assim quero a mentoria' respeita a Mentoria", () => {
  const st = state({ ...PRICED, budget_objection: true });
  const op = offer("mesmo assim quero a mentoria", st);
  assertFalse(op.mustSecondary, "não força downsell quando o lead reafirma");
  const ok = `Fechado, seguimos com a Mentoria: ${PRIMARY_LINE}. Quer que eu te mostre o próximo passo?`;
  assertFalse(evaluateSecondaryOfferV2(ok, CFG, op).violates);
  const { perms: p } = perms("mesmo assim quero a mentoria", st);
  assertFalse(p.mayMentionPrice, "não repete preço já informado sem novo pedido");
  assert(evaluateCommercialV2(ok, p).reasons.includes("price_without_context"));

  // recusa explícita do curso também respeita a Mentoria
  const recusa = offer("não quero o curso, quero a mentoria", st);
  assertFalse(recusa.mustSecondary);
});

// ── K: duas inbound com 10s de intervalo ──
Deno.test("K: inbound em 10s reinicia a janela e gera uma única resposta", () => {
  const cfg = readDebounceConfig({ ai_reply_debounce: { enabled: true } })!;
  assertEquals(cfg.waitMs, 20_000);
  const t0 = new Date("2026-08-13T19:00:00.000Z");
  const t1 = new Date("2026-08-13T19:00:10.000Z");

  const job1 = { claim_token: "job1", fire_after: computeFireAfter(t0, cfg.waitMs), status: "pending" as const };
  // segunda inbound reescreve o token e a janela
  const row: DebounceRow = { claim_token: "job2", fire_after: computeFireAfter(t1, cfg.waitMs), status: "pending" };
  assertEquals(row.fire_after, "2026-08-13T19:00:30.000Z");

  // job1 acorda em t0+20s e é descartado
  const d1 = decideDebounce(row, job1.claim_token, new Date("2026-08-13T19:00:20.000Z"));
  assertEquals(d1, { action: "abort", reason: "stale_job" });
  // job2 espera até 19:00:30 e dispara uma única vez
  assertEquals(decideDebounce(row, "job2", new Date("2026-08-13T19:00:25.000Z")), { action: "wait", waitMs: 5_000 });
  assertEquals(decideDebounce(row, "job2", new Date("2026-08-13T19:00:30.000Z")), { action: "fire" });
  // após o claim, ninguém mais dispara
  assertEquals(
    decideDebounce({ ...row, status: "generating" }, "job2", new Date("2026-08-13T19:00:31.000Z")),
    { action: "abort", reason: "already_generating" },
  );
});

// ── L: duas inbound com 30s de intervalo ──
Deno.test("L: inbound em 30s gera duas respostas, sem job stale", () => {
  const t0 = new Date("2026-08-13T19:00:00.000Z");
  const t1 = new Date("2026-08-13T19:00:30.000Z");
  const row1: DebounceRow = { claim_token: "job1", fire_after: computeFireAfter(t0, 20_000), status: "pending" };
  assertEquals(decideDebounce(row1, "job1", new Date("2026-08-13T19:00:20.000Z")), { action: "fire" });
  // lote 1 concluído
  const done: DebounceRow = { ...row1, status: "done" };
  assertEquals(decideDebounce(done, "job1", new Date("2026-08-13T19:00:25.000Z")), { action: "abort", reason: "already_done" });
  // nova inbound abre novo lote
  const row2: DebounceRow = { claim_token: "job2", fire_after: computeFireAfter(t1, 20_000), status: "pending" };
  assertEquals(decideDebounce(row2, "job2", new Date("2026-08-13T19:00:50.000Z")), { action: "fire" });
  assertEquals(decideDebounce(row2, "job1", new Date("2026-08-13T19:00:50.000Z")), { action: "abort", reason: "stale_job" });
});

// ── M: corrida no limite de 20s ──
Deno.test("M: corrida no limite produz no máximo uma resposta para o lote", () => {
  const row: DebounceRow = { claim_token: "job2", fire_after: "2026-08-13T19:00:30.000Z", status: "pending" };
  const now = new Date("2026-08-13T19:00:30.001Z");
  const decisoes = ["job1", "job2", "job2"].map((t) => decideDebounce(row, t, now));
  assertEquals(decisoes.filter((d) => d.action === "fire").length, 2);
  // o claim atômico no banco (status pending -> generating) resolve o empate:
  let claimed = 0;
  let status: DebounceRow["status"] = "pending";
  for (const d of decisoes) {
    if (d.action !== "fire") continue;
    const dec = decideDebounce({ ...row, status }, "job2", now);
    if (dec.action === "fire") {
      claimed++;
      status = "generating";
    }
  }
  assertEquals(claimed, 1);
  // job cancelado (human_talk) nunca dispara
  assertEquals(decideDebounce({ ...row, status: "canceled" }, "job2", now), { action: "abort", reason: "canceled" });
  // linha ausente nunca dispara
  assertEquals(decideDebounce(null, "job2", now), { action: "abort", reason: "missing_row" });
});

// ── N: human_talk ──
Deno.test("N: human_talk=true não gera resposta (job cancelado e não recuperável)", () => {
  const row = { status: "canceled" as const, fire_after: "2026-08-13T19:00:00.000Z" };
  assertFalse(isRecoverable(row, new Date("2026-08-13T19:10:00.000Z")));
  assertEquals(
    decideDebounce({ ...row, claim_token: "job1" }, "job1", new Date("2026-08-13T19:10:00.000Z")),
    { action: "abort", reason: "canceled" },
  );
});

Deno.test("N2: tick de recuperação só assume pending atrasado além da carência", () => {
  const fire = "2026-08-13T19:00:00.000Z";
  assertFalse(isRecoverable({ status: "pending", fire_after: fire }, new Date("2026-08-13T19:00:05.000Z")));
  assert(isRecoverable({ status: "pending", fire_after: fire }, new Date("2026-08-13T19:00:20.000Z")));
  assertFalse(isRecoverable({ status: "generating", fire_after: fire }, new Date("2026-08-13T19:05:00.000Z")));
});

// ── O: SLA 60s ──
Deno.test("O: cenário normal entrega dentro de 60s", () => {
  const v = evaluateReplySla({
    received_at: "2026-08-13T19:00:00.000Z",
    ai_generated_at: "2026-08-13T19:00:27.000Z",
    queued_at: "2026-08-13T19:00:27.500Z",
    sent_at: "2026-08-13T19:00:35.000Z",
  });
  assert(v.withinSla);
  assertEquals(v.totalMs, 35_000);
  assertEquals(v.breachReason, null);
  assertEquals(v.legs.generationMs, 7_000);
});

Deno.test("O2: estouro aponta a etapa culpada e ausência de envio é breach", () => {
  const lento = evaluateReplySla({
    received_at: "2026-08-13T19:00:00.000Z",
    ai_generated_at: "2026-08-13T19:00:25.000Z",
    queued_at: "2026-08-13T19:00:25.000Z",
    sent_at: "2026-08-13T19:03:00.000Z",
  });
  assertFalse(lento.withinSla);
  assertEquals(lento.breachReason, "provider_send");

  const geracao = evaluateReplySla({
    received_at: "2026-08-13T19:00:00.000Z",
    ai_generated_at: "2026-08-13T19:02:00.000Z",
    queued_at: "2026-08-13T19:02:01.000Z",
    sent_at: "2026-08-13T19:02:05.000Z",
  });
  assertEquals(geracao.breachReason, "generation_slow");

  const semEnvio = evaluateReplySla({ received_at: "2026-08-13T19:00:00.000Z", ai_generated_at: null });
  assertFalse(semEnvio.withinSla);
  assertEquals(semEnvio.breachReason, "not_sent");
  assertEquals(semEnvio.totalMs, null);
});

// ── P: regressões ──
Deno.test("P1: tenant sem flag de debounce mantém comportamento legado", () => {
  assertEquals(readDebounceConfig(null), null);
  assertEquals(readDebounceConfig({}), null);
  assertEquals(readDebounceConfig({ ai_reply_debounce: { enabled: false } }), null);
});

Deno.test("P2: tenant sem primary_offer_lock não ganha nenhuma trava", () => {
  assertEquals(readPrimaryOfferLockConfig({}), null);
  assertEquals(readPrimaryOfferLockConfig({ primary_offer_lock: { enabled: false } }), null);
});

Deno.test("P3: link InfinitePay e chave PIX só após escolha da forma", () => {
  const antes = perms("quero fechar", PRICED);
  assert(antes.perms.mayAskPaymentMethod);
  assert(evaluateCommercialV2(`Segue o link: ${LINK}`, antes.perms).reasons.includes("payment_details_without_method"));

  const aguardando = state({ ...PRICED, awaiting_payment_method: true, closing_intent_at: "2026-08-13T19:00:00.000Z" });
  const depois = perms("no cartão", aguardando);
  assertEquals(depois.extracted.paymentMethod, "cartao");
  assert(depois.perms.maySharePaymentDetails);
  assertFalse(evaluateCommercialV2(`São 12x de R$ 650. Segue o link: ${LINK}`, depois.perms).violates);
});

Deno.test("P4: preço oficial atualizado (12x de R$ 650) e nunca total acumulado", () => {
  assertEquals(CFG.primaryPriceLine, PRIMARY_LINE);
  assertEquals(CFG.secondaryPriceLine, SECONDARY_LINE);
  const block = buildPrimaryOfferPromptBlock(CFG, offer("qual o valor", PRICED));
  assert(block.includes("12x de R$ 650"));
  assert(/valores são FIXOS/i.test(block));
  assertFalse(/642,44/.test(block));
  const { perms: p } = perms("qual o valor", PRICED);
  assert(evaluateCommercialV2("12x de R$ 650, no total R$ 7.800.", p).reasons.includes("installment_total_disclosed"));
});

Deno.test("P5: prova social e dado cadastral isolado seguem intactos", () => {
  const { extracted, perms: p } = perms("joao@empresa.com.br", PRICED);
  assert(extracted.signals.has("contact_data_only"));
  assertFalse(p.mustAnswerPriceNow);
  assertFalse(p.mayAskPaymentMethod);
  assertFalse(p.maySharePaymentDetails);
});

Deno.test("P6: bloco do downsell aparece somente quando obrigatório", () => {
  const semObjecao = buildPrimaryOfferPromptBlock(CFG, offer("como funciona a mentoria?", PRICED));
  assertFalse(/alternativa leve e digna/.test(semObjecao));
  const comObjecao = buildPrimaryOfferPromptBlock(CFG, offer("achei caro", PRICED));
  assert(/IMEDIATAMENTE/.test(comObjecao));
  assert(/997/.test(comObjecao));
  const comDesconto = buildPrimaryOfferPromptBlock(CFG, offer("tem desconto?", PRICED));
  assert(/valores são fixos/i.test(comDesconto));
});

Deno.test("P7: preço informado não se repete, mas pedido novo e escolha de cartão permitem", () => {
  const objecao = perms("Falta de dinheiro", PRICED);
  assert(objecao.extracted.signals.has("budget_objection"));
  assertFalse(objecao.perms.mayMentionPrice);
  assert(evaluateCommercialV2(`A Mentoria custa ${PRIMARY_LINE}.`, objecao.perms).violates);

  const pergunta = perms("Pode repetir o valor?", PRICED);
  assert(pergunta.perms.mayMentionPrice);

  const aguardando = state({ ...PRICED, awaiting_payment_method: true, closing_intent_at: "2026-08-13T19:00:00.000Z" });
  const cartao = perms("no cartão", aguardando);
  assert(cartao.perms.mayMentionPrice);
});

Deno.test("P8: nova inbound Bullink habilita claim limpo e lock ocupado não consome tentativa", () => {
  const config = {
    ai_reply_debounce: {
      enabled: true,
      fresh_claim_reset: true,
      lock_busy_does_not_consume_attempt: true,
    },
  };
  assert(readFreshClaimResetFlag(config));
  assert(readLockBusyRetryFlag(config));
  assertFalse(readFreshClaimResetFlag({ ai_reply_debounce: { enabled: true } }));
  assertFalse(readLockBusyRetryFlag({ ai_reply_debounce: { enabled: true } }));
});
