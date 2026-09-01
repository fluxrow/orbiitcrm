import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildPrimaryOfferPromptBlock,
  computePrimaryOfferPermission,
  detectBudgetObjection,
  detectSecondaryOffer,
  readPrimaryOfferLockConfig,
  sanitizeSecondaryOffer,
  sanitizeSecondaryOfferV2,
} from "./primary-offer-guard.ts";

const BULLINK_CONFIG = {
  primary_offer_lock: {
    enabled: true,
    primary_focus: "mentoria",
    primary_focus_tags: ["OFERTA_MENTORIA"],
    secondary_focus: "curso",
    secondary_label: "Curso Gravado",
    primary_price_line: "R$6.500 no PIX ou 12x de R$642,44 no cartão",
  },
};

const cfg = readPrimaryOfferLockConfig(BULLINK_CONFIG)!;

const LEONARDO_TAGS = [
  "BULLINK",
  "MOMENTO_COMECANDO_ZERO",
  "OFERTA_MENTORIA",
  "ORIGEM_TYPEBOT",
  "RENDA_6_A_9K",
];

const OUT_CARDAPIO =
  "A Mentoria fica R$6.500 no PIX ou 12x de R$642,44 no cartão. Também tenho o Curso Gravado por R$997. Qual faz mais sentido?";

Deno.test("tenant sem config: trava desligada (outros tenants intactos)", () => {
  assertEquals(readPrimaryOfferLockConfig(null), null);
  assertEquals(readPrimaryOfferLockConfig({}), null);
  assertEquals(
    readPrimaryOfferLockConfig({ primary_offer_lock: { enabled: false } }),
    null,
  );
});

Deno.test("Leonardo exato: pergunta genérica de valor => somente Mentoria", () => {
  const perm = computePrimaryOfferPermission({
    cfg,
    inbound: "Entendi e qual valor fica",
    tags: LEONARDO_TAGS,
    stateFocus: null,
    stateBudgetObjection: false,
  });
  assertEquals(perm.maySecondary, false);
  assertEquals(perm.effectiveFocus, "mentoria");
  assert(detectSecondaryOffer(OUT_CARDAPIO, cfg, perm).violates);
  const s = sanitizeSecondaryOffer(OUT_CARDAPIO, cfg, perm);
  assert(s.changed);
  assert(!/997|curso gravado/i.test(s.text));
  assertStringIncludes(s.text, "R$6.500");
});

Deno.test("'qual valor?' + OFERTA_MENTORIA => somente Mentoria", () => {
  const perm = computePrimaryOfferPermission({
    cfg,
    inbound: "qual valor?",
    tags: ["OFERTA_MENTORIA"],
  });
  assertEquals(perm.maySecondary, false);
  assertEquals(perm.effectiveFocus, "mentoria");
});

Deno.test("objeção explícita de orçamento => pode oferecer Curso R$997", () => {
  for (
    const msg of [
      "achei caro",
      "não tenho orçamento pra isso agora",
      "está muito caro pra mim",
      "não consigo esse valor",
      "estou sem verba",
      "tá fora do meu orçamento",
    ]
  ) {
    assert(detectBudgetObjection(msg), `deveria detectar objeção: ${msg}`);
    const perm = computePrimaryOfferPermission({
      cfg,
      inbound: msg,
      tags: LEONARDO_TAGS,
    });
    assertEquals(perm.maySecondary, true, msg);
    assertEquals(detectSecondaryOffer(OUT_CARDAPIO, cfg, perm).violates, false);
    assertEquals(
      sanitizeSecondaryOffer(OUT_CARDAPIO, cfg, perm).changed,
      false,
    );
  }
});

Deno.test("pedido pelo curso sem objeção financeira => permanece somente na Mentoria", () => {
  for (
    const msg of [
      "tem curso gravado?",
      "quero o curso",
      "o gravado é passo a passo?",
      "qual o valor do curso?",
    ]
  ) {
    const perm = computePrimaryOfferPermission({
      cfg,
      inbound: msg,
      tags: LEONARDO_TAGS,
    });
    assertEquals(perm.maySecondary, false, msg);
    assertEquals(perm.effectiveFocus, "mentoria", msg);
    assertEquals(perm.reason, "locked_to_primary", msg);
  }
});

Deno.test("tag de renda baixa/desemprego não força downsell", () => {
  const perm = computePrimaryOfferPermission({
    cfg,
    inbound: "quanto custa a mentoria?",
    tags: ["BULLINK", "OFERTA_MENTORIA", "RENDA_ATE_2K", "DESEMPREGADO"],
  });
  assertEquals(perm.maySecondary, false);
  assertEquals(perm.effectiveFocus, "mentoria");
  assert(
    detectSecondaryOffer("Tenho também o Curso Gravado por R$997.", cfg, perm)
      .violates,
  );
});

Deno.test("foco curso legado sem objeção registrada => volta fail-closed para Mentoria", () => {
  const perm = computePrimaryOfferPermission({
    cfg,
    inbound: "e o valor?",
    tags: LEONARDO_TAGS,
    stateFocus: "curso",
  });
  assertEquals(perm.maySecondary, false);
  assertEquals(perm.effectiveFocus, "mentoria");
  assertEquals(perm.reason, "locked_to_primary");
});

Deno.test("objeção registrada no estado mantém curso liberado nos turnos seguintes", () => {
  const perm = computePrimaryOfferPermission({
    cfg,
    inbound: "e como funciona?",
    tags: LEONARDO_TAGS,
    stateBudgetObjection: true,
  });
  assertEquals(perm.maySecondary, true);
  assertEquals(perm.reason, "budget_objection");
  assertEquals(perm.effectiveFocus, "curso");
});

Deno.test("regressão Gabriela: nunca responde com os dois valores sem objeção", () => {
  const perm = computePrimaryOfferPermission({
    cfg,
    inbound:
      "O gravado é certinho passo a passo, mas qual seria os valores de cada?",
    tags: LEONARDO_TAGS,
    stateFocus: "curso",
  });
  const sanitized = sanitizeSecondaryOffer(
    "A Mentoria sai por R$6.500 no PIX. O Curso Gravado por R$997 à vista no PIX.",
    cfg,
    perm,
  );
  assertEquals(perm.maySecondary, false);
  assertStringIncludes(sanitized.text, "R$6.500");
  assert(!/curso|997/i.test(sanitized.text));
});

Deno.test("sanitização preserva mentoria e nunca cria link/chave de pagamento", () => {
  const perm = computePrimaryOfferPermission({
    cfg,
    inbound: "qual o valor",
    tags: LEONARDO_TAGS,
  });
  const s = sanitizeSecondaryOffer(
    "O Curso Gravado sai R$997. A Mentoria fica R$6.500 no PIX ou 12x de R$642,44.",
    cfg,
    perm,
  );
  assertEquals(s.text, "A Mentoria fica R$6.500 no PIX ou 12x de R$642,44.");
  assert(!/https?:\/\//.test(s.text));
  assert(!/chave/i.test(s.text));
});

Deno.test("fallback quando toda a resposta era downsell", () => {
  const perm = computePrimaryOfferPermission({
    cfg,
    inbound: "qual o valor",
    tags: LEONARDO_TAGS,
  });
  const s = sanitizeSecondaryOffer(
    "Tenho o Curso Gravado por R$997.",
    cfg,
    perm,
  );
  assert(s.fallbackUsed);
  assertStringIncludes(s.text, "R$6.500");
  assert(!/997/.test(s.text));
});

Deno.test("prompt block reflete a permissão do turno", () => {
  const locked = computePrimaryOfferPermission({
    cfg,
    inbound: "qual valor fica",
    tags: LEONARDO_TAGS,
  });
  assertStringIncludes(
    buildPrimaryOfferPromptBlock(cfg, locked),
    "NÃO PODE citar",
  );
  const open = computePrimaryOfferPermission({
    cfg,
    inbound: "achei caro",
    tags: LEONARDO_TAGS,
  });
  assertStringIncludes(
    buildPrimaryOfferPromptBlock(cfg, open),
    "PODE apresentar",
  );
});

Deno.test("Bullink: linguagem natural de preço alto exige downsell imediato", () => {
  for (
    const inbound of [
      "MUITO ALTO PRA MIM",
      "Ser muito caro",
      "Esse investimento ficou alto para mim",
      "Esse valor pesou",
      "de forma alguma, valor tá totalmente fora da curva",
    ]
  ) {
    const perm = computePrimaryOfferPermission({
      cfg,
      inbound,
      tags: LEONARDO_TAGS,
      stateFocus: "mentoria",
      stateBudgetObjection: false,
    });
    assert(perm.budgetObjectionNow, `não detectou: ${inbound}`);
    assert(perm.mustSecondary, `não obrigou downsell: ${inbound}`);
  }
});

Deno.test("Bullink: objeção fora da curva remove sondagem de orçamento e injeta alternativa oficial", () => {
  const perm = computePrimaryOfferPermission({
    cfg,
    inbound: "de forma alguma, valor tá totalmente fora da curva",
    tags: LEONARDO_TAGS,
    stateFocus: "mentoria",
  });
  assert(perm.mustSecondary);
  const fixed = sanitizeSecondaryOfferV2(
    "Entendo. Quanto você conseguiria investir agora?",
    cfg,
    perm,
  );
  assert(!/quanto .*investir/i.test(fixed.text));
  assertStringIncludes(fixed.text, "Curso Gravado");
  assertStringIncludes(fixed.text, "R$ 997");
});
