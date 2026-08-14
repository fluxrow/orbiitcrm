// Smokes Bullink: pagamento misto (PIX + cartão) e remoção de autoapresentação.
// 100% determinístico, zero rede, zero Z-API, zero mutação.
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  detectMixedPaymentRequest,
  readMixedPaymentHandoffConfig,
  readMixedPaymentState,
  buildMixedPaymentClaim,
  mergeMixedPaymentState,
  MIXED_PAYMENT_DEFAULT_CONFIRMATION,
} from "./mixed-payment-handoff.ts";
import {
  readSelfIntroductionGuardConfig,
  detectSelfIntroduction,
  sanitizeSelfIntroduction,
  enforceNoSelfIntroduction,
} from "./no-self-introduction.ts";
import { detectIdentitySplit, enforceNoIdentitySplit } from "./no-identity-split.ts";
import { readPrimaryOfferLockConfig } from "./primary-offer-guard.ts";

const CFG_ON = { mixed_payment_handoff: { enabled: true } };
const INTRO_ON = { self_introduction_guard: { enabled: true, names: ["Fernando Albuquerque", "Fernando"] } };
const introCfg = readSelfIntroductionGuardConfig(INTRO_ON)!;

// ── A: caso real do lead ──
Deno.test("A: pedido real (1000 no pix + parcelar o restante) é detectado", () => {
  assert(detectMixedPaymentRequest("E teria a possibilidade de eu dar 1000 no pix e parcelar o restante no cartão?"));
});

// ── B: variações inequívocas ──
Deno.test("B: variações de pagamento misto", () => {
  const casos = [
    "posso dar uma parte no pix e o resto no cartão?",
    "dá pra fazer entrada no pix e o saldo parcelado?",
    "consigo pagar metade no pix e metade no cartão de crédito",
    "queria dividir: pix e cartão",
    "aceita pagamento misto, pix mais cartão?",
    "dou 2.000 no PIX e parcelo o restante",
  ];
  for (const c of casos) assert(detectMixedPaymentRequest(c), c);
});

// ── C: falsos positivos ──
Deno.test("C: alternativa simples e perguntas comuns não disparam", () => {
  const nao = [
    "posso pagar no pix ou no cartão?",
    "quanto custa a mentoria?",
    "aceita cartão?",
    "o pix é na hora?",
    "consigo parcelar em 12x no cartão?",
    "",
  ];
  for (const c of nao) assertEquals(detectMixedPaymentRequest(c), false, c);
});

// ── D: tenant-scoped, default preserva demais tenants ──
Deno.test("D: config off/ausente devolve null", () => {
  assertEquals(readMixedPaymentHandoffConfig(null), null);
  assertEquals(readMixedPaymentHandoffConfig({}), null);
  assertEquals(readMixedPaymentHandoffConfig({ mixed_payment_handoff: { enabled: false } }), null);
  assertEquals(readMixedPaymentHandoffConfig(CFG_ON)?.enabled, true);
});

// ── E: confirmação curta, positiva e sem condição inventada ──
Deno.test("E: confirmação padrão diz SIM sem definir entrada/parcelas/link", () => {
  const msg = readMixedPaymentHandoffConfig(CFG_ON)!.confirmation_message;
  assertEquals(msg, MIXED_PAYMENT_DEFAULT_CONFIRMATION);
  assertStringIncludes(msg.toLowerCase(), "pix");
  assertStringIncludes(msg.toLowerCase(), "cart");
  assertEquals(/\d{1,2}\s*x|entrada de|desconto|http|chave pix/i.test(msg), false);
  assert(msg.split(/[.!?]+\s/).filter(Boolean).length <= 3);
});

Deno.test("E2: confirmação customizada do tenant é respeitada", () => {
  const custom = readMixedPaymentHandoffConfig({
    mixed_payment_handoff: { enabled: true, confirmation_message: "Sim, consigo combinar PIX e cartão." },
  })!;
  assertEquals(custom.confirmation_message, "Sim, consigo combinar PIX e cartão.");
});

// ── F: idempotência de estado ──
Deno.test("F: estado marcado impede segunda confirmação/notificação", () => {
  assertEquals(readMixedPaymentState({}).handled, false);
  const at = "2026-08-15T10:00:00.000Z";
  const claim = buildMixedPaymentClaim("in-1", new Date(at));
  // Claim isolado NÃO é "handled": as etapas ainda precisam concluir.
  assertEquals(readMixedPaymentState({ mixed_payment_handoff: claim }).handled, false);
  const st = mergeMixedPaymentState({ mixed_payment_handoff: claim }, {
    confirmation_outbox_id: "ob-1",
    confirmation_enqueued_at: at,
    human_talk_set_at: at,
    notification_sent_at: at,
  });
  assertEquals(readMixedPaymentState({ mixed_payment_handoff: st }).handled, true);
  assertEquals(readMixedPaymentState({ mixed_payment_handoff: st }).at, at);
});

// ── G: a confirmação passa pelo guard de identidade sem alteração ──
Deno.test("G: confirmação não viola identidade única", () => {
  const v = detectIdentitySplit(MIXED_PAYMENT_DEFAULT_CONFIRMATION, { humanTalk: true });
  assertEquals(v.violates, false);
  assertEquals(enforceNoIdentitySplit(MIXED_PAYMENT_DEFAULT_CONFIRMATION, true, { humanTalk: true }).changed, false);
});

// ── H: autoapresentação detectada e removida ──
Deno.test("H: remove 'Aqui é o Fernando' preservando o resto", () => {
  const out = sanitizeSelfIntroduction(
    "Daniel! Aqui é o Fernando Albuquerque. Vi que você respondeu sobre a mentoria, tudo bem?",
    introCfg,
  );
  assertEquals(/aqui é o fernando/i.test(out), false);
  assertStringIncludes(out, "Vi que você respondeu sobre a mentoria");
  assertStringIncludes(out, "Daniel");
});

Deno.test("H2: variações de apresentação", () => {
  const casos = [
    "Oi! Eu sou o Fernando, dono da mentoria. Vamos falar do investimento?",
    "Fernando aqui. Vamos falar do investimento?",
    "Bom dia. Me chamo Fernando. Vamos falar do investimento?",
    "Olá, meu nome é Fernando Albuquerque. Vamos falar do investimento?",
    "Quem fala é o Fernando. Vamos falar do investimento?",
    "Sou o Fernando. Vamos falar do investimento?",
  ];
  for (const c of casos) {
    assert(detectSelfIntroduction(c, introCfg).violates, c);
    const out = sanitizeSelfIntroduction(c, introCfg);
    assertStringIncludes(out, "Vamos falar do investimento?");
    assertEquals(/sou o fernando|fernando aqui|me chamo|meu nome é|aqui é o fernando|quem fala é/i.test(out), false, out);
  }
});

// ── I: menções legítimas preservadas ──
Deno.test("I: não mutila contexto legítimo nem primeira pessoa", () => {
  const ok = [
    "Vou te acompanhar de perto nos 3 meses, combinado?",
    "A mentoria sai R$ 6.500 no PIX ou 12x de R$ 650 no cartão.",
    "Você falou com a minha equipe antes? Pode me contar o que já viu.",
    "Sim, consigo combinar uma parte no PIX e o restante no cartão.",
  ];
  for (const c of ok) {
    assertEquals(detectSelfIntroduction(c, introCfg).violates, false, c);
    assertEquals(sanitizeSelfIntroduction(c, introCfg), c, c);
  }
});

// ── J: guard off preserva byte-for-byte ──
Deno.test("J: tenant sem self_introduction_guard não é afetado", () => {
  assertEquals(readSelfIntroductionGuardConfig({}), null);
  const texto = "Aqui é o Fernando. Tudo bem?";
  assertEquals(enforceNoSelfIntroduction(texto, null).text, texto);
  assertEquals(enforceNoSelfIntroduction(texto, null).changed, false);
  const on = enforceNoSelfIntroduction(texto, introCfg);
  assertEquals(on.changed, true);
  assertEquals(on.text, "Tudo bem?");
});

// ── K: preços e trava de oferta preservados ──
Deno.test("K: primary_offer_lock permanece legível e intacto", () => {
  const cfg = readPrimaryOfferLockConfig({
    primary_offer_lock: {
      enabled: true,
      primary: { name: "Mentoria", price_label: "R$ 6.500 no PIX ou 12x de R$ 650 no cartão" },
      secondary: { name: "Curso Gravado", price_label: "R$ 997 no PIX" },
    },
  } as Record<string, unknown>);
  assert(cfg);
  assertStringIncludes(JSON.stringify(cfg), "6.500");
  assertStringIncludes(JSON.stringify(cfg), "997");
});
