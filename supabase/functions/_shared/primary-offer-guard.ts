/**
 * Trava de oferta principal (tenant-scoped, data-driven).
 *
 * Problema real: a pergunta genérica de preço ("e qual valor fica") fazia o
 * agente responder em formato de cardápio, apresentando a oferta principal
 * (Mentoria) e a oferta secundária/downsell (Curso Gravado R$997) no mesmo
 * turno — inclusive quando não havia objeção de orçamento nem pedido explícito
 * pela opção mais barata. Tags informativas do Typebot (renda, desemprego)
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
  /\bachei\s+caro\b/,
  /\bfora\s+do\s+(?:meu\s+)?orcamento\b/,
  /\bsem\s+(?:verba|orcamento|grana|dinheiro|condicoes)\b/,
  /\b(?:to|estou)\s+(?:apertado|sem\s+grana|sem\s+dinheiro)\b/,
  /\bnao\s+tenho\s+orcamento\b/,
  /\bpesado\s+(?:pra|para)\s+mim\b/,
];

export function readPrimaryOfferLockConfig(
  aiConfig: Record<string, unknown> | null | undefined,
): PrimaryOfferLockConfig | null {
  const raw = (aiConfig as any)?.primary_offer_lock;
  if (!raw || typeof raw !== "object" || raw.enabled !== true) return null;
  const arr = (v: unknown, fallback: string[]): string[] =>
    Array.isArray(v) && v.every((x) => typeof x === "string") && v.length > 0 ? (v as string[]) : fallback;
  return {
    enabled: true,
    primaryFocus: typeof raw.primary_focus === "string" ? raw.primary_focus : "mentoria",
    primaryFocusTags: arr(raw.primary_focus_tags, ["OFERTA_MENTORIA"]),
    secondaryFocus: typeof raw.secondary_focus === "string" ? raw.secondary_focus : "curso",
    secondaryMentionPatterns: arr(raw.secondary_mention_patterns, DEFAULT_SECONDARY_MENTION),
    secondaryRequestPatterns: arr(raw.secondary_request_patterns, DEFAULT_SECONDARY_REQUEST),
    primaryPriceLine: typeof raw.primary_price_line === "string" && raw.primary_price_line.trim()
      ? raw.primary_price_line
      : "R$6.500 no PIX ou 12x de R$642,44 no cartão",
    secondaryLabel: typeof raw.secondary_label === "string" ? raw.secondary_label : "Curso Gravado",
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
  | "explicit_secondary_request"
  | "secondary_focus_established"
  | "locked_to_primary";

export interface PrimaryOfferPermission {
  maySecondary: boolean;
  reason: PrimaryOfferReason;
  effectiveFocus: string;
  budgetObjectionNow: boolean;
}

/** Objeção explícita de orçamento detectada no turno atual. */
export function detectBudgetObjection(inbound: string | null | undefined): boolean {
  const n = norm(inbound);
  if (!n) return false;
  return RE_BUDGET_OBJECTION.some((re) => re.test(n));
}

export function computePrimaryOfferPermission(
  input: PrimaryOfferPermissionInput,
): PrimaryOfferPermission {
  const { cfg } = input;
  const n = norm(input.inbound);
  const tags = (input.tags ?? []).map((t) => String(t).toUpperCase());
  const stateFocus = input.stateFocus ?? null;

  const budgetObjectionNow = detectBudgetObjection(input.inbound);
  const explicitRequest = !!n && anyMatch(cfg.secondaryRequestPatterns, n);
  const secondaryEstablished = stateFocus === cfg.secondaryFocus;

  const primaryByTag = tags.some((t) => cfg.primaryFocusTags.map((x) => x.toUpperCase()).includes(t));
  const effectiveFocus = secondaryEstablished
    ? cfg.secondaryFocus
    : (stateFocus === cfg.primaryFocus || primaryByTag || !stateFocus ? cfg.primaryFocus : stateFocus);

  if (budgetObjectionNow || input.stateBudgetObjection === true) {
    return { maySecondary: true, reason: "budget_objection", effectiveFocus, budgetObjectionNow };
  }
  if (explicitRequest) {
    return { maySecondary: true, reason: "explicit_secondary_request", effectiveFocus: cfg.secondaryFocus, budgetObjectionNow };
  }
  if (secondaryEstablished) {
    return { maySecondary: true, reason: "secondary_focus_established", effectiveFocus, budgetObjectionNow };
  }
  return { maySecondary: false, reason: "locked_to_primary", effectiveFocus, budgetObjectionNow };
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
  if (perm.maySecondary || !raw.trim()) return { text: raw.trim(), changed: false, fallbackUsed: false };
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

export function buildSecondaryOfferCorrective(cfg: PrimaryOfferLockConfig): string {
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
    `- ${cfg.secondaryLabel} só entra se houver objeção explícita de orçamento/preço, pedido explícito pela opção mais barata, ou foco já estabelecido como ${cfg.secondaryFocus}.`,
    "- PROIBIDO responder em formato de cardápio/comparação espontânea das duas ofertas.",
    "- Tags de renda, momento ou desemprego servem apenas de contexto: nunca forçam o downsell nem impedem a oferta principal.",
    "- Não envie chave PIX, link de pagamento nem peça comprovante antes de o lead escolher a forma de pagamento.",
    "=== FIM DA TRAVA DE OFERTA PRINCIPAL ===\n",
  ];
  return lines.join("\n");
}
