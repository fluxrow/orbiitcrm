import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildPrimaryOfferPromptBlock,
  computePrimaryOfferPermission,
  detectBudgetObjection,
  detectSecondaryOffer,
  readPrimaryOfferLockConfig,
  sanitizeSecondaryOffer,
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

const LEONARDO_TAGS = ["BULLINK", "MOMENTO_COMECANDO_ZERO", "OFERTA_MENTORIA", "ORIGEM_TYPEBOT", "RENDA_6_A_9K"];

const OUT_CARDAPIO =
  "A Mentoria fica R$6.500 no PIX ou 12x de R$642,44 no cartão. Também tenho o Curso Gravado por R$997. Qual faz mais sentido?";

Deno.test("tenant sem config: trava desligada (outros tenants intactos)", () => {
  assertEquals(readPrimaryOfferLockConfig(null), null);
  assertEquals(readPrimaryOfferLockConfig({}), null);
  assertEquals(readPrimaryOfferLockConfig({ primary_offer_lock: { enabled: false } }), null);
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
  const perm = computePrimaryOfferPermission({ cfg, inbound: "qual valor?", tags: ["OFERTA_MENTORIA"] });
  assertEquals(perm.maySecondary, false);
  assertEquals(perm.effectiveFocus, "mentoria");
});

Deno.test("objeção explícita de orçamento => pode oferecer Curso R$997", () => {
  for (const msg of [
    "achei caro",
    "não tenho orçamento pra isso agora",
    "está muito caro pra mim",
    "não consigo esse valor",
    "estou sem verba",
    "tá fora do meu orçamento",
  ]) {
    assert(detectBudgetObjection(msg), `deveria detectar objeção: ${msg}`);
    const perm = computePrimaryOfferPermission({ cfg, inbound: msg, tags: LEONARDO_TAGS });
    assertEquals(perm.maySecondary, true, msg);
    assertEquals(detectSecondaryOffer(OUT_CARDAPIO, cfg, perm).violates, false);
    assertEquals(sanitizeSecondaryOffer(OUT_CARDAPIO, cfg, perm).changed, false);
  }
});

Deno.test("pedido explícito pelo curso gravado => Curso liberado", () => {
  for (const msg of ["tem curso gravado?", "tem algo mais barato?", "quero o curso", "tem opção mais barata?"]) {
    const perm = computePrimaryOfferPermission({ cfg, inbound: msg, tags: LEONARDO_TAGS });
    assertEquals(perm.maySecondary, true, msg);
  }
  const perm = computePrimaryOfferPermission({ cfg, inbound: "tem curso gravado?", tags: LEONARDO_TAGS });
  assertEquals(perm.effectiveFocus, "curso");
});

Deno.test("tag de renda baixa/desemprego não força downsell", () => {
  const perm = computePrimaryOfferPermission({
    cfg,
    inbound: "quanto custa a mentoria?",
    tags: ["BULLINK", "OFERTA_MENTORIA", "RENDA_ATE_2K", "DESEMPREGADO"],
  });
  assertEquals(perm.maySecondary, false);
  assertEquals(perm.effectiveFocus, "mentoria");
  assert(detectSecondaryOffer("Tenho também o Curso Gravado por R$997.", cfg, perm).violates);
});

Deno.test("foco curso já estabelecido => Curso permitido", () => {
  const perm = computePrimaryOfferPermission({ cfg, inbound: "e o valor?", tags: LEONARDO_TAGS, stateFocus: "curso" });
  assertEquals(perm.maySecondary, true);
  assertEquals(perm.effectiveFocus, "curso");
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
});

Deno.test("sanitização preserva mentoria e nunca cria link/chave de pagamento", () => {
  const perm = computePrimaryOfferPermission({ cfg, inbound: "qual o valor", tags: LEONARDO_TAGS });
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
  const perm = computePrimaryOfferPermission({ cfg, inbound: "qual o valor", tags: LEONARDO_TAGS });
  const s = sanitizeSecondaryOffer("Tenho o Curso Gravado por R$997.", cfg, perm);
  assert(s.fallbackUsed);
  assertStringIncludes(s.text, "R$6.500");
  assert(!/997/.test(s.text));
});

Deno.test("prompt block reflete a permissão do turno", () => {
  const locked = computePrimaryOfferPermission({ cfg, inbound: "qual valor fica", tags: LEONARDO_TAGS });
  assertStringIncludes(buildPrimaryOfferPromptBlock(cfg, locked), "NÃO PODE citar");
  const open = computePrimaryOfferPermission({ cfg, inbound: "achei caro", tags: LEONARDO_TAGS });
  assertStringIncludes(buildPrimaryOfferPromptBlock(cfg, open), "PODE apresentar");
});
