/**
 * Trava de oferta principal (tenant-scoped, data-driven).
 *
 * Problema real: a pergunta genérica de preço ("e qual valor fica") fazia o
 * agente responder em formato de cardápio, apresentando a oferta principal
 * (Mentoria) e a oferta secundária/downsell (Curso Gravado R$997) no mesmo
 * turno — inclusive quando não havia objeção de orçamento. Pedido pelo Curso,
 * menção ao gravado ou foco secundário legado NÃO liberam o downsell. Tags
 * informativas do Typebot (renda, desemprego)
 * também não devem forçar o downsell.
 *
 * Esta trava é ativada SOMENTE quando `orbit_ai_config.primary_offer_lock`
 * traz `enabled: true`. Sem essa configuração o comportamento de todos os
 * outros tenants permanece byte-for-behavior idêntico.
 *
 * Nunca persiste PII: opera apenas sobre texto do turno e rótulos.
 */

function deaccent(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function norm(s: string | null | undefined): string {
  return deaccent(String(s ?? "")).toLowerCase().replace(/\s+/g, " ").trim();
}

export interface PrimaryOfferLockConfig {
  enabled: boolean;
  /** Rótulo do foco principal, ex.: "mentoria". */
  primaryFocus: string;
  /** Tags que estabelecem o foco principal, ex.: ["OFERTA_MENTORIA"]. */
  primaryFocusTags: string[];
  /** Rótulo do foco secundário/downsell, ex.: "curso". */
  secondaryFocus: string;
  /** Regex (source) que identificam menção à oferta secundária na resposta. */
  secondaryMentionPatterns: string[];
  /** Regex (source) que identificam pedido explícito pela oferta secundária. */
  secondaryRequestPatterns: string[];
  /** Linha oficial de preço/condições da oferta principal. */
  primaryPriceLine: string;
  /** Nome comercial da oferta secundária (para o prompt). */
  secondaryLabel: string;
  /** Linha oficial de preço/condições da oferta secundária. */
  secondaryPriceLine: string;
  /** Não repetir preço já informado sem o lead pedi-lo novamente. */
  antiRepetitionEnabled: boolean;
}

const DEFAULT_SECONDARY_MENTION = [
  "\\bcurso\\s+gravad\\w*",
  "\\bgravad\\w*\\s+curso\\b",
  "r\\$\\s*997",
  "\\b997\\s*reais\\b",
];

const DEFAULT_SECONDARY_REQUEST = [
  "\\bcurso\\s+gravad\\w*",
  "\\btem\\s+(?:algum\\s+)?curso\\b",
  "\\bquero\\s+(?:o\\s+)?curso\\b",
  "\\bopcao\\s+mais\\s+(?:barata|acessivel|em\\s+conta)\\b",
  "\\balgo\\s+mais\\s+(?:barato|acessivel|em\\s+conta)\\b",
  "\\bmais\\s+barat\\w+\\b",
  "\\btem\\s+(?:algo|alguma\\s+coisa)\\s+mais\\s+barat\\w+\\b",
];

/** Objeção explícita de orçamento/preço no turno atual. */
const RE_BUDGET_OBJECTION: RegExp[] = [
  /\bnao\s+(?:tenho|consigo|da)\b[^.?!]{0,40}\b(?:esse|todo\s+esse|valor|dinheiro|grana|condic\w*|agora)\b/,
  /\bnao\s+consigo\b/,
  /\b(?:esta|ta|e|eh)\s+(?:muito\s+)?caro\b/,
  /\b(?:ser|seria|ficou|parece)\s+(?:muito\s+)?caro\b/,
  /\bachei\s+caro\b/,
  /\b(?:muito\s+)?alto\s+(?:pra|para)\s+mim\b/,
  /\b(?:valor|investimento|preco)\s+(?:muito\s+)?alto\b/,
  /\b(?:esse|o)\s+(?:valor|investimento|preco)\s+(?:e|eh|esta|ta|ficou|parece)\s+(?:muito\s+)?alto\b/,
  /\b(?:esse|o)\s+(?:valor|investimento|preco)\s+(?:pesou|pesa)\b/,
  /\bfora\s+do\s+(?:meu\s+)?orcamento\b/,
  /\bsem\s+(?:verba|orcamento|grana|dinheiro|condicoes)\b/,
  /\b(?:to|estou)\s+(?:apertado|sem\s+grana|sem\s+dinheiro)\b/,
  /\bnao\s+tenho\s+orcamento\b/,
  /\bpesado\s+(?:pra|para)\s+mim\b/,
  /\b(?:esse\s+)?investimento\s+pesa\b/,
  /\bpesa\s+(?:no\s+)?(?:meu\s+)?(?:bolso|orcamento|momento)\b/,
  /\bvou\s+tentar\s+levantar\b/,
  /\bpreciso\s+(?:levantar|juntar|guardar)\b[^.?!]{0,30}\b(?:valor|dinheiro|grana)\b/,
  /\bfora\s+do\s+(?:meu\s+)?alcance\b/,
  /\b(?:valor|investimento|preco)?\s*(?:esta|ta|e|eh|ficou)?\s*(?:totalmente|completamente|muito)?\s*fora\s+da\s+curva\b/,
  /\bnao\s+cabe\s+(?:no\s+)?(?:meu\s+)?(?:bolso|orcamento)\b/,
  /\bacima\s+do\s+que\s+(?:eu\s+)?(?:posso|consigo)\b/,
  /\balem\s+(?:do\s+)?(?:meu\s+)?orcamento\b/,
  /\b(?:esse|este|o)?\s*(?:valor|investimento)\b[^.?!]{0,45}\balem\b[^.?!]{0,25}\b(?:do\s+que\s+)?(?:eu\s+)?(?:posso|consigo|tenho\s+condic\w*)\b/,
  /\balem\s+do\s+que\s+(?:eu\s+)?(?:posso|consigo)\b/,
  /\bta\s+salgado\b/,
  /\bmuito\s+dinheiro\b/,
  /\bfalta\s+(?:de\s+)?(?:dinheiro|grana|verba|orcamento)\b/,
  /\b(?:esse|o)\s+valor\b[^.?!]{0,45}\b(?:nao\s+e\s+possivel|nao\s+da|nao\s+consigo|impossivel)\b/,
  /\b(?:hoje|agora)\b[^.?!]{0,35}\bnao\s+(?:e\s+possivel|da|consigo)\b/,
  /\b(?:um\s+)?pouco\s+acima\s+(?:do\s+valor\s+)?da\s+minha\s+expectativa\b/,
  /\b(?:fica|ficou|esta|ta)\s+acima\s+(?:do\s+valor\s+)?da\s+(?:minha\s+)?expectativa\b/,
  /\b(?:nesse|neste)\s+momento\b[^.?!]{0,45}\bnao\s+(?:teria|tenho|consigo)\b[^.?!]{0,30}\b(?:valor|investimento|condic\w*)\b/,
  /\bnao\s+(?:teria|tenho|consigo)\b[^.?!]{0,35}\b(?:esse|o)?\s*(?:valor|investimento)\b/,
];

/** Pedido de desconto/negociação: valores são FIXOS, mas abre a alternativa. */
const RE_DISCOUNT_REQUEST: RegExp[] = [
  /\bdesconto\b/,
  /\bcupom\b/,
  /\bpromoc\w+\b/,
  /\bmelhora\w*\s+(?:o\s+)?(?:preco|valor)\b/,
  /\b(?:faz|fazer)\s+por\s+(?:menos|r?\$?\s*\d)/,
  /\bultimo\s+preco\b/,
];

/** Enquadramentos proibidos: jamais julgar o lead. */
const RE_JUDGMENTAL: RegExp[] = [
  /\bdesempregad\w+\b/,
  /\bsem\s+caixa\b/,
  /\bdesqualificad\w+\b/,
  /\bnao\s+(?:e|eh)\s+(?:o\s+)?seu\s+momento\b/,
  /\bnao\s+(?:e|eh)\s+(?:pra|para)\s+voce\b/,
  /\bvoce\s+nao\s+tem\s+(?:condicoes|dinheiro|grana)\b/,
  /\bfalta\s+de\s+(?:dinheiro|grana|condicao)\b/,
];

/** Concessão inventada: preço é fixo, sem negociação. */
const RE_INVENTED_DISCOUNT: RegExp[] = [
  /\b(?:consigo|posso|vou|da\s+pra)\s+(?:te\s+)?(?:dar|fazer|liberar|conceder)\s+(?:um\s+)?desconto\b/,
  /\bdesconto\s+(?:especial|exclusivo|de\s+\d+%)\b/,
  /\bcondicao\s+especial\b/,
  /\bfaco\s+por\s+r?\$?\s*\d/,
  /\bpreco\s+promocional\b/,
];

/** Perguntas que transformam a objeção em barganha/leilão em vez de oferecer a alternativa oficial. */
const RE_BUDGET_PROBING: RegExp[] = [
  /\bquanto\s+(?:voce\s+)?(?:consegue|conseguiria|pode|poderia|tem)\s+(?:investir|pagar|colocar)\b/,
  /\bqual\s+(?:valor|investimento)\s+(?:cabe|caberia|consegue|conseguiria)\b/,
  /\bate\s+quanto\s+(?:voce\s+)?(?:consegue|conseguiria|pode|poderia)\b/,
];

export function readPrimaryOfferLockConfig(
  aiConfig: Record<string, unknown> | null | undefined,
): PrimaryOfferLockConfig | null {
  const raw = (aiConfig as any)?.primary_offer_lock;
  if (!raw || typeof raw !== "object" || raw.enabled !== true) return null;
  const arr = (v: unknown, fallback: string[]): string[] =>
    Array.isArray(v) && v.every((x) => typeof x === "string") && v.length > 0
      ? (v as string[])
      : fallback;
  return {
    enabled: true,
    primaryFocus: typeof raw.primary_focus === "string"
      ? raw.primary_focus
      : "mentoria",
    primaryFocusTags: arr(raw.primary_focus_tags, ["OFERTA_MENTORIA"]),
    secondaryFocus: typeof raw.secondary_focus === "string"
      ? raw.secondary_focus
      : "curso",
    secondaryMentionPatterns: arr(
      raw.secondary_mention_patterns,
      DEFAULT_SECONDARY_MENTION,
    ),
    secondaryRequestPatterns: arr(
      raw.secondary_request_patterns,
      DEFAULT_SECONDARY_REQUEST,
    ),
    primaryPriceLine: typeof raw.primary_price_line === "string" &&
        raw.primary_price_line.trim()
      ? raw.primary_price_line
      : "R$ 6.500 à vista no PIX ou 12x de R$ 650 no cartão",
    secondaryLabel: typeof raw.secondary_label === "string"
      ? raw.secondary_label
      : "Curso Gravado",
    secondaryPriceLine: typeof raw.secondary_price_line === "string" &&
        raw.secondary_price_line.trim()
      ? raw.secondary_price_line
      : "R$ 997 à vista no PIX",
    antiRepetitionEnabled: raw.anti_repetition_enabled === true,
  };
}

function anyMatch(sources: string[], text: string): boolean {
  return sources.some((src) => {
    try {
      return new RegExp(src).test(text);
    } catch {
      return false;
    }
  });
}

export interface PrimaryOfferPermissionInput {
  cfg: PrimaryOfferLockConfig;
  inbound: string | null | undefined;
  tags?: string[] | null;
  /** Foco comercial já estabelecido no estado (commercial_v2.product_focus). */
  stateFocus?: string | null;
  /** Objeção de orçamento já registrada no estado. */
  stateBudgetObjection?: boolean;
}

export type PrimaryOfferReason =
  | "budget_objection"
  | "locked_to_primary";

export interface PrimaryOfferPermission {
  maySecondary: boolean;
  /**
   * Objeção de orçamento (ou pedido de desconto) NESTE turno: a alternativa
   * secundária deve ser apresentada imediatamente, de forma respeitosa.
   */
  mustSecondary: boolean;
  reason: PrimaryOfferReason;
  effectiveFocus: string;
  budgetObjectionNow: boolean;
  discountRequestNow: boolean;
}

/** Objeção explícita de orçamento detectada no turno atual. */
export function detectBudgetObjection(
  inbound: string | null | undefined,
): boolean {
  const n = norm(inbound);
  if (!n) return false;
  return RE_BUDGET_OBJECTION.some((re) => re.test(n));
}

/** Pedido explícito de desconto no turno atual. */
export function detectDiscountRequest(
  inbound: string | null | undefined,
): boolean {
  const n = norm(inbound);
  if (!n) return false;
  return RE_DISCOUNT_REQUEST.some((re) => re.test(n));
}

export function computePrimaryOfferPermission(
  input: PrimaryOfferPermissionInput,
): PrimaryOfferPermission {
  const { cfg } = input;
  const budgetObjectionNow = detectBudgetObjection(input.inbound);
  const discountRequestNow = detectDiscountRequest(input.inbound);
  const mustSecondary = budgetObjectionNow || discountRequestNow;
  if (mustSecondary || input.stateBudgetObjection === true) {
    return {
      maySecondary: true,
      mustSecondary,
      reason: "budget_objection",
      effectiveFocus: cfg.secondaryFocus,
      budgetObjectionNow,
      discountRequestNow,
    };
  }
  // Fail-closed: pedido pelo Curso ou foco secundário deixado por runtime antigo
  // não substituem a prova de objeção financeira. Sem essa prova, a Mentoria é
  // sempre o único foco comercial permitido.
  return {
    maySecondary: false,
    mustSecondary: false,
    reason: "locked_to_primary",
    effectiveFocus: cfg.primaryFocus,
    budgetObjectionNow,
    discountRequestNow,
  };
}

function splitClauses(text: string): string[] {
  return String(text)
    .split(/(?<=[.!?\n])\s+/)
    .flatMap((s) => s.split(/(?<=;)\s+/))
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export interface SecondaryOfferVerdict {
  violates: boolean;
  offending: string[];
}

/** Detecta menção à oferta secundária quando ela não é permitida. */
export function detectSecondaryOffer(
  resposta: string | null | undefined,
  cfg: PrimaryOfferLockConfig,
  perm: PrimaryOfferPermission,
): SecondaryOfferVerdict {
  if (perm.maySecondary) return { violates: false, offending: [] };
  const offending = splitClauses(String(resposta ?? "")).filter((c) =>
    anyMatch(cfg.secondaryMentionPatterns, norm(c))
  );
  return { violates: offending.length > 0, offending };
}

/** Remove apenas as cláusulas que citam a oferta secundária não permitida. */
export function sanitizeSecondaryOffer(
  resposta: string | null | undefined,
  cfg: PrimaryOfferLockConfig,
  perm: PrimaryOfferPermission,
): { text: string; changed: boolean; fallbackUsed: boolean } {
  const raw = String(resposta ?? "");
  if (perm.maySecondary || !raw.trim()) {
    return { text: raw.trim(), changed: false, fallbackUsed: false };
  }
  const kept: string[] = [];
  let changed = false;
  for (const clause of splitClauses(raw)) {
    if (anyMatch(cfg.secondaryMentionPatterns, norm(clause))) {
      changed = true;
      continue;
    }
    kept.push(clause);
  }
  const text = kept.join(" ").replace(/\s{2,}/g, " ").trim();
  if (!text) {
    return {
      text: `O investimento fica ${cfg.primaryPriceLine}.`,
      changed: true,
      fallbackUsed: true,
    };
  }
  return { text, changed, fallbackUsed: false };
}

export function buildSecondaryOfferCorrective(
  cfg: PrimaryOfferLockConfig,
): string {
  return (
    "CORREÇÃO OBRIGATÓRIA (oferta principal): não cite, compare nem ofereça " +
    `${cfg.secondaryLabel} neste turno. O lead fez uma pergunta de preço e o foco é a ` +
    `${cfg.primaryFocus}. Responda somente o preço/condições oficiais da ${cfg.primaryFocus}: ` +
    `${cfg.primaryPriceLine}. Nunca responda em formato de cardápio com duas ofertas. ` +
    "Não envie chave PIX, link de pagamento nem peça comprovante antes de o lead escolher a forma de pagamento. " +
    "Mantenha 1 a 3 frases curtas."
  );
}

export function buildPrimaryOfferPromptBlock(
  cfg: PrimaryOfferLockConfig,
  perm: PrimaryOfferPermission,
): string {
  const lines = [
    "\n=== TRAVA DE OFERTA PRINCIPAL (INVIOLÁVEL PARA ESTE TENANT) ===",
    `Foco comercial deste turno: ${perm.effectiveFocus}`,
    `Preço/condições oficiais da ${cfg.primaryFocus}: ${cfg.primaryPriceLine}`,
    perm.maySecondary
      ? `PODE apresentar ${cfg.secondaryLabel} neste turno (motivo: ${perm.reason}).`
      : `NÃO PODE citar, comparar ou oferecer ${cfg.secondaryLabel} neste turno.`,
    `- Pergunta genérica de preço/valor => responda SOMENTE preço e condições da ${cfg.primaryFocus}.`,
    `- ${cfg.secondaryLabel} só entra depois de objeção explícita de orçamento/preço à ${cfg.primaryFocus}. Pedido pelo curso, menção ao gravado, pergunta de preço do curso ou foco secundário legado NÃO liberam a alternativa.`,
    "- PROIBIDO responder em formato de cardápio/comparação espontânea das duas ofertas.",
    "- Tags de renda, momento ou desemprego servem apenas de contexto: nunca forçam o downsell nem impedem a oferta principal.",
    "- Não envie chave PIX, link de pagamento nem peça comprovante antes de o lead escolher a forma de pagamento.",
    `- Os valores são FIXOS: proibido inventar desconto, negociação, condição especial, cupom ou promoção.`,
    ...(perm.mustSecondary
      ? [
        perm.discountRequestNow
          ? `- O lead pediu desconto: diga com leveza que os valores são fixos e, no MESMO turno, apresente ${cfg.secondaryLabel} (${cfg.secondaryPriceLine}) como alternativa. Não pressione com "quer fechar?".`
          : `- O lead sinalizou limitação de orçamento: apresente IMEDIATAMENTE, no mesmo turno, ${cfg.secondaryLabel} (${cfg.secondaryPriceLine}) como alternativa leve e digna.`,
        `- Não insista na ${cfg.primaryFocus} antes de oferecer a alternativa. Mesmo método, sem o acompanhamento individual.`,
        '- PROIBIDO julgar: nunca diga ou insinue desempregado, sem caixa, sem condições, desqualificado, "não é o seu momento" ou "não é para você".',
        '- Tom: 1 a 3 frases, até 300 caracteres, no máximo uma pergunta curta. Exemplo de tom: "Entendo, cara. Pra você não ficar sem um caminho, tenho o ' +
        cfg.secondaryLabel + " por " + cfg.secondaryPriceLine +
        ', com o mesmo método, só sem meu acompanhamento individual. Faz mais sentido pra você?"',
        `- Se o lead recusar ${cfg.secondaryLabel} ou reafirmar que quer a ${cfg.primaryFocus}, respeite e siga pela escolha dele.`,
      ]
      : []),
    "=== FIM DA TRAVA DE OFERTA PRINCIPAL ===\n",
  ];
  return lines.join("\n");
}

// ── Downsell obrigatório, respeito e preço fixo (mesmo tenant-scope) ──

export type SecondaryOfferReasonV2 =
  | "secondary_offered_without_permission"
  | "secondary_offer_omitted_when_required"
  | "secondary_price_omitted_when_required"
  | "judgmental_framing"
  | "invented_discount";

export interface SecondaryOfferVerdictV2 {
  violates: boolean;
  reasons: SecondaryOfferReasonV2[];
  offending: string[];
}

function mentionsSecondary(text: string, cfg: PrimaryOfferLockConfig): boolean {
  return anyMatch(cfg.secondaryMentionPatterns, norm(text));
}

function normalizeMoneyToken(raw: string): string | null {
  const value = Number(raw.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(value) ? value.toFixed(2) : null;
}

function officialPriceToken(priceLine: string): string | null {
  const match = String(priceLine).match(/r\$\s*([0-9.]+(?:,[0-9]{1,2})?)/i);
  return match ? normalizeMoneyToken(match[1]) : null;
}

export function mentionsOfficialSecondaryPrice(
  text: string | null | undefined,
  cfg: PrimaryOfferLockConfig,
): boolean {
  const expected = officialPriceToken(cfg.secondaryPriceLine);
  if (!expected) return false;
  const values = [
    ...String(text ?? "").matchAll(/r\$\s*([0-9.]+(?:,[0-9]{1,2})?)/gi),
  ]
    .map((match) => normalizeMoneyToken(match[1]));
  return values.includes(expected);
}

/** Cláusulas que julgam o lead. */
export function detectJudgmentalFraming(
  resposta: string | null | undefined,
): string[] {
  return splitClauses(String(resposta ?? "")).filter((c) =>
    RE_JUDGMENTAL.some((re) => re.test(norm(c)))
  );
}

/** Cláusulas que inventam desconto/negociação. */
export function detectInventedDiscount(
  resposta: string | null | undefined,
): string[] {
  return splitClauses(String(resposta ?? "")).filter((c) =>
    RE_INVENTED_DISCOUNT.some((re) => re.test(norm(c)))
  );
}

export function evaluateSecondaryOfferV2(
  resposta: string | null | undefined,
  cfg: PrimaryOfferLockConfig,
  perm: PrimaryOfferPermission,
): SecondaryOfferVerdictV2 {
  const raw = String(resposta ?? "");
  const reasons: SecondaryOfferReasonV2[] = [];
  const offending: string[] = [];

  if (!perm.maySecondary) {
    const bad = splitClauses(raw).filter((c) => mentionsSecondary(c, cfg));
    if (bad.length) {
      reasons.push("secondary_offered_without_permission");
      offending.push(...bad);
    }
  }
  if (perm.mustSecondary && !mentionsSecondary(raw, cfg)) {
    reasons.push("secondary_offer_omitted_when_required");
  }
  if (
    perm.mustSecondary && mentionsSecondary(raw, cfg) &&
    !mentionsOfficialSecondaryPrice(raw, cfg)
  ) {
    reasons.push("secondary_price_omitted_when_required");
  }
  const judg = detectJudgmentalFraming(raw);
  if (judg.length) {
    reasons.push("judgmental_framing");
    offending.push(...judg);
  }
  const disc = detectInventedDiscount(raw);
  if (disc.length) {
    reasons.push("invented_discount");
    offending.push(...disc);
  }
  return { violates: reasons.length > 0, reasons, offending };
}

/**
 * Sanitização determinística: remove julgamento e desconto inventado; quando a
 * alternativa é obrigatória e ficou ausente, acrescenta a frase oficial.
 * Nunca remove a alternativa quando ela é obrigatória.
 */
export function sanitizeSecondaryOfferV2(
  resposta: string | null | undefined,
  cfg: PrimaryOfferLockConfig,
  perm: PrimaryOfferPermission,
): { text: string; changed: boolean; fallbackUsed: boolean } {
  const raw = String(resposta ?? "");
  if (!raw.trim()) return { text: "", changed: false, fallbackUsed: false };
  const kept: string[] = [];
  let changed = false;
  for (const clause of splitClauses(raw)) {
    const n = norm(clause);
    const judg = RE_JUDGMENTAL.some((re) => re.test(n));
    const disc = RE_INVENTED_DISCOUNT.some((re) => re.test(n));
    const budgetProbe = perm.mustSecondary && RE_BUDGET_PROBING.some((re) => re.test(n));
    const badSecondary = !perm.maySecondary && mentionsSecondary(clause, cfg);
    if (judg || disc || budgetProbe || badSecondary) {
      changed = true;
      continue;
    }
    kept.push(clause);
  }
  let text = kept.join(" ").replace(/\s{2,}/g, " ").trim();

  if (
    perm.mustSecondary &&
    (!mentionsSecondary(text, cfg) ||
      !mentionsOfficialSecondaryPrice(text, cfg))
  ) {
    const withoutIncompleteSecondary = splitClauses(text)
      .filter((clause) => !mentionsSecondary(clause, cfg))
      .join(" ")
      .trim();
    const alt =
      `Pra você não ficar sem caminho, tenho o ${cfg.secondaryLabel} por ${cfg.secondaryPriceLine}, com o mesmo método, só sem meu acompanhamento individual.`;
    const prefix = perm.discountRequestNow
      ? "Os valores são fixos. "
      : "Entendo. ";
    text = withoutIncompleteSecondary
      ? `${withoutIncompleteSecondary} ${alt}`
      : `${prefix}${alt}`;
    changed = true;
    return { text: text.trim(), changed: true, fallbackUsed: !kept.length };
  }
  if (!text) {
    return {
      text: `O investimento fica ${cfg.primaryPriceLine}.`,
      changed: true,
      fallbackUsed: true,
    };
  }
  return { text, changed, fallbackUsed: false };
}

export function buildSecondaryOfferCorrectiveV2(
  cfg: PrimaryOfferLockConfig,
  perm: PrimaryOfferPermission,
  verdict: SecondaryOfferVerdictV2,
): string {
  const parts: string[] = ["CORREÇÃO OBRIGATÓRIA (condução da oferta):"];
  if (verdict.reasons.includes("secondary_offered_without_permission")) {
    parts.push(
      `não cite, compare nem ofereça ${cfg.secondaryLabel} neste turno. O foco é a ${cfg.primaryFocus}: ${cfg.primaryPriceLine}. Nunca responda em formato de cardápio.`,
    );
  }
  if (verdict.reasons.includes("secondary_offer_omitted_when_required")) {
    parts.push(
      perm.discountRequestNow
        ? `o lead pediu desconto: diga com leveza que os valores são fixos e apresente ${cfg.secondaryLabel} por ${cfg.secondaryPriceLine} como alternativa, sem pressionar por fechamento.`
        : `o lead sinalizou limitação de orçamento: apresente AGORA ${cfg.secondaryLabel} por ${cfg.secondaryPriceLine}, com o mesmo método e sem acompanhamento individual, de forma respeitosa. Não insista na ${cfg.primaryFocus}.`,
    );
  }
  if (verdict.reasons.includes("secondary_price_omitted_when_required")) {
    parts.push(
      `${cfg.secondaryLabel} foi citado sem o valor: informe no mesmo turno o preço oficial ${cfg.secondaryPriceLine}.`,
    );
  }
  if (verdict.reasons.includes("judgmental_framing")) {
    parts.push(
      'nunca julgue o lead: proibido desempregado, sem caixa, sem condições, desqualificado, "não é o seu momento" ou "não é para você".',
    );
  }
  if (verdict.reasons.includes("invented_discount")) {
    parts.push(
      "os valores são FIXOS: nunca ofereça desconto, negociação, cupom, promoção ou condição especial.",
    );
  }
  parts.push(
    "Mantenha 1 a 3 frases curtas, até 300 caracteres, no máximo uma pergunta curta.",
  );
  return parts.join(" ");
}
