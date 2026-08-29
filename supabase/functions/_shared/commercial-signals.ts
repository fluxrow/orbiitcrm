/**
 * Condução comercial v2 — sinais acumulados + estado flexível + permissões.
 *
 * Objetivo: substituir o portão único de "avanço comercial" por três permissões
 * independentes, sem árvore rígida e sem que uma palavra isolada decida tudo.
 *
 *   - may_mention_price        → preço PODE aparecer naturalmente.
 *   - must_answer_price_now    → preço DEVE aparecer neste turno (omitir é violação).
 *   - may_ask_payment_method   → PODE perguntar PIX ou cartão.
 *   - may_share_payment_details→ PODE enviar chave/link (forma já escolhida).
 *
 * Tenant-scoped: aplicado apenas quando
 * `orbit_ai_config.commercial_stage_v2_enabled = true`.
 * Sem a flag, o comportamento legado de `commercial-stage-guard.ts` permanece
 * byte-for-behavior idêntico.
 *
 * Nunca persiste PII: o estado guarda apenas rótulos e timestamps.
 */

import { isInboundOnlyContactData } from "./commercial-stage-guard.ts";

function deaccent(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function norm(s: string | null | undefined): string {
  return deaccent(String(s ?? "")).toLowerCase().replace(/\s+/g, " ").trim();
}

// ── Sinais ──

export const COMMERCIAL_SIGNALS = [
  "direct_price_question",
  "payment_terms_question",
  "product_comparison",
  "informational_question",
  "budget_objection",
  "purchase_interest",
  "explicit_closing_intent",
  "closing_affirmative_contextual",
  "payment_method_choice",
  "payment_details_request",
  "discount_request",
  "price_answer_affirmative",
  "contact_data_only",
] as const;

export type CommercialSignal = typeof COMMERCIAL_SIGNALS[number];

export interface CommercialSignalsResult {
  signals: Set<CommercialSignal>;
  paymentMethod: "pix" | "cartao" | null;
  productMentioned: "mentoria" | "curso" | null;
}

const RE_DIRECT_PRICE: RegExp[] = [
  /\bquanto\s+(?:custa|custam|fica|ficaria|sai|seria|e|eh|ta|esta)\b/,
  /\bqual\s+(?:e\s+|eh\s+)?(?:o\s+|a\s+)?(?:valor|preco|investimento|custo|ticket)\b/,
  /\b(?:valor|preco|precos|investimento)\s+(?:da|do|de|dessa|desse|total)\b/,
  /\b(?:me\s+)?(?:passa|manda|informa|diz)\w*\s+(?:o\s+)?(?:valor|preco|investimento)\b/,
  /\bqual\s+o\s+(?:custo|montante)\b/,
  /\b(?:valor|preco|investimento)\s*\?/,
];

const RE_PAYMENT_TERMS: RegExp[] = [
  /\bparcel\w+\b/,
  /\bquantas\s+vezes\b/,
  /\b(?:aceita|tem|da\s+pra|pode)\s+(?:no\s+)?cart(?:ao|ão)\b/,
  /\bcondic(?:ao|oes)\s+(?:de\s+)?(?:pagamento|especial)?\b/,
  /\bdesconto\b/,
  /\bentrada\b.{0,20}\bparcela\b/,
  /\bboleto\b/,
];

const RE_PRODUCT_COMPARISON: RegExp[] = [
  /\bdiferenca\s+entre\b/,
  /\bmentoria\s+(?:ou|vs\.?|versus)\s+(?:o\s+)?curso\b/,
  /\bcurso\s+(?:ou|vs\.?|versus)\s+(?:a\s+)?mentoria\b/,
  /\bqual\s+(?:a\s+)?diferenca\b/,
];

const RE_INFORMATIONAL: RegExp[] = [
  /\bcomo\s+funciona\b/,
  /\bo\s+que\s+(?:inclui|tem\s+dentro|vem\s+junto)\b/,
  /\bquantas\s+(?:aulas|semanas|encontros)\b/,
  /\bquanto\s+tempo\s+(?:dura|de\s+acompanhamento)\b/,
  /\btem\s+suporte\b/,
  /\bpor\s+onde\s+(?:comeco|comeca)\b/,
  /\bas\s+aulas\b/,
  /\bcomo\s+(?:sao|e)\s+(?:as\s+)?(?:aulas|encontros|mentorias)\b/,
];

const RE_BUDGET_OBJECTION: RegExp[] = [
  /\bnao\s+tenho\s+(?:esse|todo\s+esse|como|dinheiro|grana|condic)\w*/,
  /\b(?:esta|ta|e|eh)\s+(?:muito\s+)?caro\b/,
  /\bfora\s+do\s+(?:meu\s+)?orcamento\b/,
  /\b(?:to|estou)\s+(?:apertado|sem\s+grana|sem\s+dinheiro|desempregad\w+)\b/,
  /\bpouco\s+(?:dinheiro|orcamento)\b/,
  /\balgo\s+mais\s+(?:barato|acessivel|em\s+conta)\b/,
  /\bdesempregad\w+\b/,
  /\bfalta\s+(?:de\s+)?(?:dinheiro|grana|verba|orcamento)\b/,
  /\b(?:esse|o)\s+valor\b[^.?!]{0,45}\b(?:nao\s+e\s+possivel|nao\s+da|nao\s+consigo|impossivel)\b/,
  /\b(?:hoje|agora)\b[^.?!]{0,35}\bnao\s+(?:e\s+possivel|da|consigo)\b/,
];

const RE_PURCHASE_INTEREST: RegExp[] = [
  /\btenho\s+interesse\b/,
  /\bme\s+interess\w+\b/,
  /\bquero\s+saber\s+mais\b/,
  /\bgostei\b/,
  /\bfaz\s+sentido\s+(?:pra\s+mim|para\s+mim)\b/,
  /\bquero\s+(?:a\s+)?(?:mentoria|o\s+curso)\b/,
];

const RE_EXPLICIT_CLOSING: RegExp[] = [
  /\bquero\s+(?:fechar|comprar|entrar|participar|assinar|come[cç]ar|garantir|contratar|me\s+inscrever)\b/,
  /\bvamos\s+fechar\b/,
  /\bfechado\b/,
  /\bpode\s+(?:gerar|mandar|enviar)\s+(?:o\s+)?(?:pedido|link|pagamento)\b/,
  /\bquero\s+garantir\s+(?:minha\s+)?vaga\b/,
  /\bvou\s+(?:querer|fechar|entrar)\b/,
  /\bbora\s+(?:fechar|come[cç]ar|nessa)\b/,
  // Intenção comercial explícita em linguagem livre (não é apenas curiosidade).
  /\bcomo\s+(?:eu\s+)?(?:fa[cç]o|posso\s+fazer)\s+(?:para|pra)\s+(?:come[cç]ar|entrar|participar|fazer\s+parte|avancar)\b/,
  /\bcomo\s+(?:eu\s+)?(?:come[cç]o|participo|entro)\s+(?:na|no)\s+(?:mentoria|curso)\b/,
  /^como\s+(?:eu\s+)?(?:come[cç]o|participo)\b[\s?!.]*$/,
  /\bquero\s+avancar\b/,
  /\bquero\s+dar\s+(?:o\s+)?proximo\s+passo\b/,
  /\bquero\s+(?:muito\s+)?(?:fazer|entrar\s+n)(?:a|o)\s+(?:mentoria|curso)\b/,
];

/**
 * Aceites curtos que SÓ contam como fechamento quando o contexto já tem
 * produto em foco e preço informado. Nunca decidem sozinhos.
 */
const RE_CLOSING_AFFIRMATIVE_CONTEXTUAL: RegExp[] = [
  /^(?:bora|vamos\s+nessa|vamos\s+que\s+vamos|topo|to\s+dentro|estou\s+dentro|eu\s+quero|quero\s+sim|isso\s+mesmo|vamos)\b[\s!.]*$/,
  /^(?:pode\s+ser|combinado|perfeito,?\s+quero)\b[\s!.]*$/,
];

const RE_PAYMENT_DETAILS_REQUEST: RegExp[] = [
  /\bcomo\s+(?:eu\s+)?(?:fa[cç]o\s+(?:para|pra)\s+)?(?:pagar|pago|pagamento)\b/,
  /\bcomo\s+(?:eu\s+)?(?:fa[cç]o\s+(?:para|pra)\s+)?(?:me\s+)?inscrev\w*/,
  /\bonde\s+(?:eu\s+)?pago\b/,
  /\bme\s+manda\s+(?:o\s+)?link\b/,
  /\bmanda\s+(?:a\s+)?(?:chave|link)\b/,
  /\bqual\s+(?:e\s+)?(?:a\s+)?chave\s+pix\b/,
  /\bcomo\s+(?:eu\s+)?entro\b/,
];

/**
 * Pedido de desconto/negociação. Preço é FIXO: o pedido obriga resposta de
 * preço no mesmo turno (valores fixos) e habilita a alternativa secundária.
 */
const RE_DISCOUNT_REQUEST: RegExp[] = [
  /\bdesconto\b/,
  /\bcupom\b/,
  /\bpromoc\w+\b/,
  /\b(?:consegue|da|tem|faz)\s+(?:um\s+)?(?:melhor|abatimento)\b/,
  /\bmelhora\w*\s+(?:o\s+)?(?:preco|valor)\b/,
  /\bfaz\s+(?:por|pra\s+mim\s+por)\s+r?\$?\s*\d/,
];

/** Aceite curto a uma pergunta anterior do agente sobre explicar o preço. */
const RE_PRICE_ANSWER_AFFIRMATIVE: RegExp[] = [
  /^(?:sim(?:,?\s+por\s+favor)?|claro|por\s+favor|pode\s+(?:falar|dizer|passar|informar)|quero\s+saber)[\s!.,]*$/,
];

const RE_PIX_CHOICE: RegExp[] = [
  /^(?:pix|no\s+pix|a\s+vista|à\s+vista|vista\s+no\s+pix|prefiro\s+(?:o\s+)?pix|pix\s+mesmo)\b[\s!.,]*$/,
  /\b(?:prefiro|vou|quero|melhor|fico|opto)\s+(?:fazer\s+)?(?:no\s+|com\s+|de\s+|pelo\s+)?pix\b/,
  /\b(?:a|à)\s+vista\s+no\s+pix\b/,
];

const RE_CARD_CHOICE: RegExp[] = [
  /^(?:cart(?:ao|ão)|no\s+cart(?:ao|ão)|parcelado|cart(?:ao|ão)\s+de\s+credito|prefiro\s+(?:o\s+)?cart(?:ao|ão))\b[\s!.,]*$/,
  /\b(?:prefiro|vou|quero|melhor|fico|opto)\s+(?:fazer\s+)?(?:no\s+|com\s+|de\s+|pelo\s+)?cart(?:ao|ão)\b/,
  /\bparcelado\s+no\s+cart(?:ao|ão)\b/,
];

function anyMatch(res: RegExp[], text: string): boolean {
  return res.some((re) => re.test(text));
}

export interface LlmCommercialSignals {
  signals?: unknown;
  payment_method?: unknown;
  product_focus?: unknown;
}

/** Rótulos aceitos do LLM (reforço, nunca autoridade isolada em permissão forte). */
function readLlmSignals(llm: LlmCommercialSignals | null | undefined): Set<CommercialSignal> {
  const out = new Set<CommercialSignal>();
  const raw = llm?.signals;
  if (!Array.isArray(raw)) return out;
  for (const item of raw) {
    const key = norm(item).replace(/ /g, "_") as CommercialSignal;
    if ((COMMERCIAL_SIGNALS as readonly string[]).includes(key)) out.add(key);
  }
  return out;
}

/**
 * Extrai sinais do turno atual.
 * Sinais "fracos" (informational, interest, comparison) aceitam reforço do LLM.
 * Sinais fortes (fechamento, escolha de forma, pedido de dados) exigem evidência
 * determinística no texto do lead — o LLM só confirma o que o texto sustenta.
 */
export function extractCommercialSignals(
  inbound: string | null | undefined,
  llm?: LlmCommercialSignals | null,
): CommercialSignalsResult {
  const signals = new Set<CommercialSignal>();
  const n = norm(inbound);
  const llmSignals = readLlmSignals(llm);
  let paymentMethod: "pix" | "cartao" | null = null;
  let productMentioned: "mentoria" | "curso" | null = null;

  if (!n) return { signals, paymentMethod, productMentioned };

  if (isInboundOnlyContactData(inbound)) {
    signals.add("contact_data_only");
    // Dado cadastral isolado nunca gera nenhum outro sinal comercial.
    return { signals, paymentMethod, productMentioned };
  }

  if (/\bmentoria\b/.test(n)) productMentioned = "mentoria";
  else if (/\bcurso\b/.test(n)) productMentioned = "curso";

  // Determinísticos
  if (anyMatch(RE_DIRECT_PRICE, n)) signals.add("direct_price_question");
  if (anyMatch(RE_PAYMENT_TERMS, n)) signals.add("payment_terms_question");
  if (anyMatch(RE_PRODUCT_COMPARISON, n)) signals.add("product_comparison");
  if (anyMatch(RE_INFORMATIONAL, n)) signals.add("informational_question");
  if (anyMatch(RE_BUDGET_OBJECTION, n)) signals.add("budget_objection");
  if (anyMatch(RE_PURCHASE_INTEREST, n)) signals.add("purchase_interest");
  if (anyMatch(RE_EXPLICIT_CLOSING, n)) signals.add("explicit_closing_intent");
  if (anyMatch(RE_CLOSING_AFFIRMATIVE_CONTEXTUAL, n)) signals.add("closing_affirmative_contextual");
  if (anyMatch(RE_PAYMENT_DETAILS_REQUEST, n)) signals.add("payment_details_request");
  if (anyMatch(RE_DISCOUNT_REQUEST, n)) signals.add("discount_request");
  if (anyMatch(RE_PRICE_ANSWER_AFFIRMATIVE, n)) signals.add("price_answer_affirmative");

  if (anyMatch(RE_PIX_CHOICE, n)) {
    signals.add("payment_method_choice");
    paymentMethod = "pix";
  } else if (anyMatch(RE_CARD_CHOICE, n)) {
    signals.add("payment_method_choice");
    paymentMethod = "cartao";
  }

  // Reforço do LLM apenas para sinais fracos/consultivos.
  for (const weak of ["informational_question", "product_comparison", "purchase_interest", "budget_objection"] as CommercialSignal[]) {
    if (llmSignals.has(weak)) signals.add(weak);
  }
  // O LLM pode reforçar pergunta de preço/condições, que são perguntas explícitas
  // e visíveis no texto — nunca fechamento, escolha de forma ou pedido de dados.
  for (const q of ["direct_price_question", "payment_terms_question"] as CommercialSignal[]) {
    if (llmSignals.has(q) && /\?|valor|preco|custa|quanto|parcel/.test(n)) signals.add(q);
  }

  return { signals, paymentMethod, productMentioned };
}

// ── Estado flexível (namespace commercial_v2 em ai_contexto) ──

export interface CommercialStateV2 {
  product_focus: "mentoria" | "curso" | null;
  product_explained: boolean;
  price_informed: { product: string; at: string } | null;
  budget_objection: boolean;
  closing_intent_at: string | null;
  payment_method: "pix" | "cartao" | null;
  payment_details_sent_at: string | null;
  awaiting_receipt: boolean;
  awaiting_payment_method: boolean;
  /** O agente ofereceu explicar o preço, mas ainda não informou nenhum valor. */
  awaiting_price_answer: boolean;
  unanswered_price_question: boolean;
}

export const EMPTY_COMMERCIAL_STATE: CommercialStateV2 = {
  product_focus: null,
  product_explained: false,
  price_informed: null,
  budget_objection: false,
  closing_intent_at: null,
  payment_method: null,
  payment_details_sent_at: null,
  awaiting_receipt: false,
  awaiting_payment_method: false,
  awaiting_price_answer: false,
  unanswered_price_question: false,
};

export function readCommercialState(aiContexto: Record<string, unknown> | null | undefined): CommercialStateV2 {
  const raw = (aiContexto?.["commercial_v2"] ?? null) as Partial<CommercialStateV2> | null;
  if (!raw || typeof raw !== "object") return { ...EMPTY_COMMERCIAL_STATE };
  const method = raw.payment_method === "pix" || raw.payment_method === "cartao" ? raw.payment_method : null;
  const focus = raw.product_focus === "mentoria" || raw.product_focus === "curso" ? raw.product_focus : null;
  const price = raw.price_informed && typeof raw.price_informed === "object" && typeof (raw.price_informed as any).at === "string"
    ? { product: String((raw.price_informed as any).product ?? ""), at: String((raw.price_informed as any).at) }
    : null;
  return {
    product_focus: focus,
    product_explained: raw.product_explained === true,
    price_informed: price,
    budget_objection: raw.budget_objection === true,
    closing_intent_at: typeof raw.closing_intent_at === "string" ? raw.closing_intent_at : null,
    payment_method: method,
    payment_details_sent_at: typeof raw.payment_details_sent_at === "string" ? raw.payment_details_sent_at : null,
    awaiting_receipt: raw.awaiting_receipt === true,
    awaiting_payment_method: raw.awaiting_payment_method === true,
    awaiting_price_answer: raw.awaiting_price_answer === true,
    unanswered_price_question: raw.unanswered_price_question === true,
  };
}

// ── Permissões ──

export interface CommercialPermissions {
  mayMentionPrice: boolean;
  mustAnswerPriceNow: boolean;
  mayAskPaymentMethod: boolean;
  maySharePaymentDetails: boolean;
  chosenMethod: "pix" | "cartao" | null;
  closingRecognized: boolean;
}

export interface CommercialPermissionOptions {
  /** Impede repetir preço já informado sem novo pedido explícito. */
  suppressRepeatedPrice?: boolean;
}

export function computeCommercialPermissions(
  extracted: CommercialSignalsResult,
  state: CommercialStateV2,
  opts?: CommercialPermissionOptions,
): CommercialPermissions {
  const s = extracted.signals;
  const contactOnly = s.has("contact_data_only");

  const hasPriceContext = !!state.price_informed;
  const hasCommercialContext =
    hasPriceContext ||
    state.product_explained ||
    !!state.product_focus ||
    s.has("purchase_interest") ||
    s.has("product_comparison") ||
    s.has("budget_objection") ||
    s.has("explicit_closing_intent");

  const priceAsked =
    s.has("direct_price_question") || s.has("payment_terms_question") || s.has("discount_request");

  // Fechamento reconhecido: explícito sempre; aceite curto só com contexto real
  // (produto em foco + preço já informado).
  const closingRecognized =
    !contactOnly &&
    (s.has("explicit_closing_intent") ||
      (s.has("closing_affirmative_contextual") && hasPriceContext && !!state.product_focus));

  const mayMentionPrice = !contactOnly && (
    opts?.suppressRepeatedPrice === true && hasPriceContext
      ? priceAsked || s.has("payment_method_choice")
      : priceAsked || hasCommercialContext
  );
  // Intenção comercial explícita ("quero entrar", "como faço pra começar") com a
  // oferta ainda sem preço informado exige o investimento no mesmo turno —
  // sem abrir pagamento (isso continua dependendo de hasPriceContext).
  const commercialIntentNeedsPrice =
    !hasPriceContext && (closingRecognized || s.has("payment_details_request"));
  const mustAnswerPriceNow =
    !contactOnly && (
      priceAsked ||
      (state.awaiting_price_answer && s.has("price_answer_affirmative")) ||
      state.unanswered_price_question ||
      commercialIntentNeedsPrice
    );

  const mayAskPaymentMethod =
    !contactOnly &&
    ((hasPriceContext && (closingRecognized || s.has("payment_details_request"))) ||
      (closingRecognized && hasPriceContext));

  const chosenMethod = extracted.paymentMethod ?? state.payment_method;

  const maySharePaymentDetails =
    !contactOnly &&
    !!chosenMethod &&
    hasPriceContext &&
    (state.awaiting_payment_method || !!state.closing_intent_at || closingRecognized || s.has("payment_details_request"));

  return {
    mayMentionPrice,
    mustAnswerPriceNow,
    mayAskPaymentMethod,
    maySharePaymentDetails,
    chosenMethod: chosenMethod ?? null,
    closingRecognized,
  };
}

// ── Classificação de sentenças da resposta ──

const RE_PRICE_SENTENCE: RegExp[] = [
  /r\$\s*\d/,
  /\bcusta\b|\bcustam\b/,
  /\bpre[cç]o\b|\bvalor(?:es)?\b/,
  /\binvestimento\b/,
  /\b\d{1,2}\s*x\s*(?:de\s*)?r?\$?\s*\d/,
];

/** Evidência de que um valor monetário foi realmente comunicado. */
const RE_PRICE_AMOUNT: RegExp[] = [
  /r\$\s*\d/,
  /\b\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?\s*reais\b/,
  /\b\d{1,2}\s*x\s*(?:de\s*)?r?\$?\s*\d/,
];

/** Pergunta meta do agente: promete explicar preço, mas ainda não o informa. */
const RE_PRICE_ANSWER_INVITATION: RegExp[] = [
  /\b(?:voce\s+)?quer\s+saber\b[^?]{0,80}\b(?:investimento|valor|preco|custo)\b[^?]*\?/,
  /\b(?:quer|posso)\s+(?:que\s+eu\s+)?(?:te\s+)?(?:explicar|mostrar|passar|informar)\b[^?]{0,80}\b(?:investimento|valor|preco|custo)\b[^?]*\?/,
];

const RE_METHOD_QUESTION: RegExp[] = [
  /\bpix\b[^?]{0,60}\bcart(?:ao|ão)\b[^?]{0,40}\?/,
  /\bcart(?:ao|ão)\b[^?]{0,60}\bpix\b[^?]{0,40}\?/,
  /\bcomo\s+(?:voce\s+)?(?:prefere|quer)\s+(?:pagar|fazer)\b[^?]{0,40}\?/,
  /\bforma\s+de\s+pagamento\b[^?]{0,40}\?/,
];

const RE_PAYMENT_DETAILS: RegExp[] = [
  /\bchave\s+(?:pix|aleatoria)\b/,
  /\bhttps?:\/\/\S+/,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/,
  /\bcomprovante\b/,
];

const RE_INSTALLMENT_TOTAL: RegExp[] = [
  /\btotal\b[^.?!]{0,30}r\$\s*\d/,
  /r\$\s*\d[^.?!]{0,20}\bno\s+total\b/,
  /\btotalizando\b/,
  /\bsomando\b[^.?!]{0,20}r\$/,
];

function splitClauses(text: string): string[] {
  return String(text)
    .split(/(?<=[.!?])\s+/)
    .flatMap((s) => s.split(/(?<=;)\s+/))
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export interface SentenceKinds {
  price: boolean;
  priceAmount: boolean;
  methodQuestion: boolean;
  paymentDetails: boolean;
  installmentTotal: boolean;
}

export function classifySentence(sentence: string): SentenceKinds {
  const n = norm(sentence);
  return {
    price: anyMatch(RE_PRICE_SENTENCE, n),
    priceAmount: anyMatch(RE_PRICE_AMOUNT, n),
    methodQuestion: anyMatch(RE_METHOD_QUESTION, n),
    paymentDetails: anyMatch(RE_PAYMENT_DETAILS, n),
    installmentTotal: anyMatch(RE_INSTALLMENT_TOTAL, n),
  };
}

export function replyInvitesPriceAnswer(response: string | null | undefined): boolean {
  const n = norm(response);
  return n ? anyMatch(RE_PRICE_ANSWER_INVITATION, n) : false;
}

export type CommercialV2Reason =
  | "price_without_context"
  | "payment_method_without_intent"
  | "payment_details_without_method"
  | "installment_total_disclosed"
  | "price_omitted_when_required";

export interface CommercialV2Verdict {
  violates: boolean;
  reasons: CommercialV2Reason[];
  hasPrice: boolean;
  hasMethodQuestion: boolean;
  hasPaymentDetails: boolean;
}

export function evaluateCommercialV2(
  resposta: string | null | undefined,
  perms: CommercialPermissions,
): CommercialV2Verdict {
  const clauses = splitClauses(String(resposta ?? ""));
  const kinds = clauses.map(classifySentence);
  // "Quer saber como funciona o investimento?" menciona preço, mas não
  // comunica nenhum valor. Só evidência monetária satisfaz a obrigação.
  const hasPrice = kinds.some((k) => k.priceAmount);
  const hasMethodQuestion = kinds.some((k) => k.methodQuestion);
  const hasPaymentDetails = kinds.some((k) => k.paymentDetails);
  const hasTotal = kinds.some((k) => k.installmentTotal);

  const reasons: CommercialV2Reason[] = [];
  if (hasPrice && !perms.mayMentionPrice) reasons.push("price_without_context");
  if (hasMethodQuestion && !perms.mayAskPaymentMethod) reasons.push("payment_method_without_intent");
  if (hasPaymentDetails && !perms.maySharePaymentDetails) reasons.push("payment_details_without_method");
  if (hasTotal) reasons.push("installment_total_disclosed");
  if (perms.mustAnswerPriceNow && !hasPrice) reasons.push("price_omitted_when_required");

  return { violates: reasons.length > 0, reasons, hasPrice, hasMethodQuestion, hasPaymentDetails };
}

export const COMMERCIAL_V2_FALLBACK =
  "Consigo te explicar isso agora mesmo, sem enrolação.";

/**
 * Remove apenas as cláusulas realmente não permitidas.
 * Preço NUNCA é removido quando `mustAnswerPriceNow` é verdadeiro.
 */
export function sanitizeCommercialV2(
  resposta: string | null | undefined,
  perms: CommercialPermissions,
): { text: string; changed: boolean; fallbackUsed: boolean } {
  const raw = String(resposta ?? "");
  if (!raw.trim()) return { text: "", changed: false, fallbackUsed: false };
  const kept: string[] = [];
  let changed = false;
  for (const clause of splitClauses(raw)) {
    const k = classifySentence(clause);
    const dropPrice = k.price && !perms.mayMentionPrice && !perms.mustAnswerPriceNow;
    const dropMethod = k.methodQuestion && !perms.mayAskPaymentMethod;
    const dropDetails = k.paymentDetails && !perms.maySharePaymentDetails;
    const dropTotal = k.installmentTotal;
    if (dropPrice || dropMethod || dropDetails || dropTotal) {
      changed = true;
      continue;
    }
    kept.push(clause);
  }
  const text = kept.join(" ").replace(/\s{2,}/g, " ").trim();
  if (!text) return { text: COMMERCIAL_V2_FALLBACK, changed: true, fallbackUsed: true };
  return { text, changed, fallbackUsed: false };
}

export function buildCommercialV2Corrective(verdict: CommercialV2Verdict): string {
  const parts: string[] = ["CORREÇÃO OBRIGATÓRIA (condução comercial):"];
  if (verdict.reasons.includes("price_omitted_when_required")) {
    parts.push(
      "o lead perguntou valor/condições e você não respondeu. Informe o preço oficial do produto em foco AGORA, " +
        "no mesmo turno, em uma frase curta, sem iniciar pagamento, sem pedir dados e sem nova qualificação.",
    );
  }
  if (verdict.reasons.includes("price_without_context")) {
    parts.push("não cite valor neste turno: não há contexto comercial nem pergunta de preço. Responda de forma consultiva.");
  }
  if (verdict.reasons.includes("payment_method_without_intent")) {
    parts.push("não pergunte PIX ou cartão: o lead ainda não manifestou intenção real de fechar, pagar ou se inscrever.");
  }
  if (verdict.reasons.includes("payment_details_without_method")) {
    parts.push("não envie chave, link ou pedido de comprovante: a forma de pagamento ainda não foi escolhida.");
  }
  if (verdict.reasons.includes("installment_total_disclosed")) {
    parts.push("nunca cite, calcule ou revele o total acumulado do parcelamento; use somente o valor da parcela.");
  }
  parts.push("Mantenha 1 a 3 frases curtas, no máximo 350 caracteres, no máximo uma pergunta curta e apenas se ajudar a avançar. Não peça e-mail.");
  return parts.join(" ");
}

/** Bloco de prompt: estado + permissões deste turno. Sem PII. */
export function buildCommercialV2PromptBlock(
  state: CommercialStateV2,
  perms: CommercialPermissions,
  extracted: CommercialSignalsResult,
): string {
  const lines = [
    "\n=== CONDUÇÃO COMERCIAL (ESTADO E PERMISSÕES DESTE TURNO) ===",
    `Sinais detectados: ${[...extracted.signals].join(", ") || "(nenhum)"}`,
    `Produto em foco: ${state.product_focus ?? extracted.productMentioned ?? "(nenhum)"}`,
    `Preço já informado: ${state.price_informed ? `${state.price_informed.product} em ${state.price_informed.at}` : "não"}`,
    `Objeção de orçamento registrada: ${state.budget_objection ? "sim" : "não"}`,
    `Forma de pagamento escolhida: ${perms.chosenMethod ?? "nenhuma"}`,
    `Dados de pagamento já enviados: ${state.payment_details_sent_at ? "sim" : "não"}`,
    "",
    `PODE mencionar preço: ${perms.mayMentionPrice ? "SIM" : "NÃO"}`,
    `DEVE responder o preço neste turno: ${perms.mustAnswerPriceNow ? "SIM — responda o valor oficial agora, no mesmo turno, sem iniciar pagamento" : "NÃO — não force preço em conversa exploratória"}`,
    `PODE perguntar PIX ou cartão: ${perms.mayAskPaymentMethod ? "SIM" : "NÃO"}`,
    `PODE enviar chave/link de pagamento: ${perms.maySharePaymentDetails ? "SIM (forma escolhida)" : "NÃO"}`,
    "",
    "Informar preço NÃO é iniciar pagamento. Nunca cite total acumulado do parcelamento.",
    "Este estado é evidência auxiliar, não roteiro: siga natural, consultivo e humano.",
    "=== FIM DA CONDUÇÃO COMERCIAL ===\n",
  ];
  return lines.join("\n");
}

/**
 * Detecta, de forma determinística, se a RESPOSTA do agente realmente explicou a
 * oferta (duração, acompanhamento, nichos validados, estrutura, metodologia,
 * entregáveis, "como funciona"). Necessário porque o lead frequentemente pede
 * explicação com frases livres ("gostaria de entender melhor", "o que preciso
 * pra começar"), que não casam com os padrões de pergunta catalogados — e o
 * estado ficava com `product_explained=false` mesmo após vários turnos de
 * explicação real.
 */
const RE_REPLY_EXPLAINS_OFFER: RegExp[] = [
  /\b\d+\s*(?:meses|mes|semanas)\b[^.?!]{0,40}\bacompanhamento\b/,
  /\bacompanhamento\s+(?:direto|individual|semanal|proximo)\b/,
  /\bnichos?\s+(?:ja\s+)?validad\w+\b/,
  /\bestrutura\s+(?:de\s+validacao|completa|pronta|tecnica)\b/,
  /\bmetodologia\b/,
  /\b(?:a\s+)?mentoria\s+(?:funciona|inclui|tem|e|eh)\b/,
  /\b(?:funciona|inclui|contempla)\s+assim\b/,
  /\bmineracao\s+de\s+referencias\b/,
  /\broteiros?\s+de\s+alta\s+retencao\b/,
  /\btitulos\s+de\s+alto\s+clique\b/,
  /\banalise\s+de\s+metricas\b/,
  /\bgrupo\s+de\s+whatsapp\b/,
  /\bidiomas\s+de\s+atuacao\b/,
  /\beu\s+(?:te\s+)?(?:entrego|libero|forneco|passo)\b[^.?!]{0,40}\b(?:nichos|estrutura|referencias|roteiros|tudo)\b/,
];

export function replyExplainsOffer(resposta: string | null | undefined): boolean {
  const n = norm(resposta);
  if (!n) return false;
  return anyMatch(RE_REPLY_EXPLAINS_OFFER, n);
}

export interface UpdateCommercialStateOptions {
  /**
   * Quando true, `product_explained` também é marcado a partir da explicação
   * presente na própria resposta do agente. Default false preserva o
   * comportamento legado byte-for-byte.
   */
  detectExplanationInReply?: boolean;
}

/** Atualização idempotente do estado, a partir do turno concluído. */
export function updateCommercialState(
  state: CommercialStateV2,
  extracted: CommercialSignalsResult,
  respostaFinal: string,
  perms: CommercialPermissions,
  nowISO: string,
  opts?: UpdateCommercialStateOptions,
): CommercialStateV2 {
  const clauses = splitClauses(respostaFinal).map(classifySentence);
  const respondeuPreco = clauses.some((k) => k.priceAmount);
  const perguntouForma = clauses.some((k) => k.methodQuestion);
  const prometeuResponderPreco = !respondeuPreco && replyInvitesPriceAnswer(respostaFinal);
  const confirmouPedidoDePreco = state.awaiting_price_answer &&
    extracted.signals.has("price_answer_affirmative");
  const enviouDados = clauses.some((k) => k.paymentDetails) && perms.maySharePaymentDetails;
  const explicouNaResposta = opts?.detectExplanationInReply === true && replyExplainsOffer(respostaFinal);

  const product = extracted.productMentioned ?? state.product_focus ?? null;
  const priceAsked = extracted.signals.has("direct_price_question") || extracted.signals.has("payment_terms_question");

  return {
    product_focus: product,
    product_explained: state.product_explained || respondeuPreco || explicouNaResposta ||
      extracted.signals.has("informational_question"),
    price_informed: respondeuPreco
      ? { product: product ?? state.price_informed?.product ?? "mentoria", at: nowISO }
      : state.price_informed,
    budget_objection: state.budget_objection || extracted.signals.has("budget_objection"),
    closing_intent_at: perms.closingRecognized ? (state.closing_intent_at ?? nowISO) : state.closing_intent_at,
    payment_method: perms.chosenMethod ?? state.payment_method,
    payment_details_sent_at: enviouDados ? (state.payment_details_sent_at ?? nowISO) : state.payment_details_sent_at,
    awaiting_receipt: enviouDados ? true : state.awaiting_receipt,
    awaiting_payment_method: perguntouForma ? true : (perms.chosenMethod ? false : state.awaiting_payment_method),
    awaiting_price_answer: respondeuPreco
      ? false
      : (prometeuResponderPreco ? true : confirmouPedidoDePreco),
    unanswered_price_question: priceAsked ? !respondeuPreco : (state.unanswered_price_question && !respondeuPreco),
  };
}

/**
 * Autoriza o rótulo forte de venda apenas com evidência determinística.
 * Uma escolha isolada de PIX/cartão nunca pode criar handoff comercial se o
 * preço e a intenção de fechar não tiverem sido confirmados antes.
 */
export function isCommercialSaleHandoffAuthorized(
  extracted: CommercialSignalsResult,
  state: CommercialStateV2,
  perms: CommercialPermissions,
): boolean {
  if (perms.closingRecognized) return true;
  return extracted.signals.has("payment_method_choice") &&
    state.awaiting_payment_method &&
    !!state.closing_intent_at &&
    !!state.price_informed;
}
