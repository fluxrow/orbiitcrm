/**
 * Reforço comercial/conversacional EXCLUSIVO do tenant Bullink.
 *
 * Não depende de configuração no banco e não altera o comportamento de nenhum
 * outro tenant: a ativação exige igualdade exata com BULLINK_EMPRESA_ID.
 */

export const BULLINK_EMPRESA_ID = "4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18";

export type BullinkGuardReason =
  | "persona_self_confirmation"
  | "mentorship_recorded_content_inclusion"
  | "explicit_recorded_course_unanswered"
  | "recorded_course_price_not_requested"
  | "budget_objection_without_downsell"
  | "course_purchase_confirmation_without_payment_details"
  | "mentorship_purchase_confirmation_without_payment_choice"
  | "mentorship_pix_choice_without_payment_details"
  | "mentorship_card_choice_without_payment_details"
  | "unsolicited_recorded_course_offer"
  | "lead_source_question_unanswered"
  | "results_timeline_question_unanswered"
  | "course_context_regressed_to_mentorship"
  | "course_context_price_unanswered"
  | "secondary_requested_before_budget_objection"
  | "repeated_mentorship_price"
  | "repeated_question";

export interface BullinkRecentMessage {
  direcao?: unknown;
  mensagem?: unknown;
  sender_type?: unknown;
}

export interface BullinkConversationGuardInput {
  empresaId: string | null | undefined;
  inbound: string | null | undefined;
  response: string | null | undefined;
  previousAgentQuestions?: string[] | null;
  recentMessages?: BullinkRecentMessage[] | null;
  commercialState?: {
    product_focus?: unknown;
    budget_objection?: unknown;
    price_informed?: { product?: unknown } | null;
    awaiting_offer_confirmation?: unknown;
    awaiting_payment_method?: unknown;
    closing_intent_at?: unknown;
  } | null;
  officialPixKey?: string | null;
  officialCardUrl?: string | null;
}

export interface BullinkConversationGuardResult {
  text: string;
  changed: boolean;
  reasons: BullinkGuardReason[];
}

function deaccent(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function norm(value: string | null | undefined): string {
  return deaccent(String(value ?? ""))
    .toLowerCase()
    .replace(/[^a-z0-9?$]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isBullinkTenant(empresaId: string | null | undefined): boolean {
  return empresaId === BULLINK_EMPRESA_ID;
}

const EXPLICIT_COURSE_REQUEST = [
  /\b(?:como|qual|tem|possui|oferece|quero|gostaria|prefiro|explica|explique|saber)\b.{0,45}\bcurso\b/,
  /\bcurso\b.{0,45}\b(?:como|valor|preco|custa|funciona|inclui|conteudo|tem)\b/,
  /\bformato\s+gravad[oa]\b/,
  /\baulas?\s+gravad[ao]s?\b/,
  /\bconteudo\s+gravad[oa]\b/,
  /^(?:e\s+)?(?:o\s+)?gravad[oa]\??$/,
];

const EXPLICIT_COURSE_PRICE_REQUEST = [
  /\b(?:curso|gravado)\b.{0,120}\b(?:valor(?:es)?|preco(?:s)?|investimento(?:s)?|custo(?:s)?)(?:\s+de\s+cada)?\b/,
  /\b(?:qual|quanto|quanto\s+e|me\s+diz|informa|informar)\b.{0,45}\b(?:valor|preco|investimento)\b.{0,45}\b(?:curso|gravado)\b/,
  /\b(?:valor|preco|investimento)\b.{0,45}\b(?:curso|gravado)\b/,
  /\b(?:curso|gravado)\b.{0,45}\b(?:valor|preco|custa|custaria|investimento)\b/,
  /\bquanto\b.{0,25}\b(?:custa|fica|sai)\b.{0,35}\b(?:curso|gravado)?\b/,
  /\b(?:curso|versao|opcao|formato)\b.{0,40}\bmais\s+barat[oa]\b/,
  /\bmais\s+barat[oa]\b.{0,40}\b(?:curso|versao|opcao|formato|gravado)\b/,
];

const BUDGET_OBJECTION = [
  /\b(?:muito\s+)?(?:caro|alto)\b/,
  /\bfora\s+do\s+(?:meu\s+)?orcamento\b/,
  /\balem\s+(?:do\s+)?(?:meu\s+)?orcamento\b/,
  /\bfora\s+do\s+(?:meu\s+)?alcance(?:\s+financeiro)?\b/,
  /\bnao\s+(?:tenho|consigo|da)\b.{0,40}\b(?:dinheiro|grana|valor|investimento|pagar)\b/,
  /\b(?:valor|investimento)\b.{0,30}\b(?:pesa|pesou|pesado|impossivel)\b/,
  /\bsem\s+(?:dinheiro|grana|verba|orcamento)\b/,
  /\bnao\s+cabe\b.{0,20}\b(?:bolso|orcamento)\b/,
  /\b(?:um\s+)?pouco\s+acima\s+(?:do\s+valor\s+)?da\s+minha\s+expectativa\b/,
  /\b(?:fica|ficou|esta|ta)\s+acima\s+(?:do\s+valor\s+)?da\s+(?:minha\s+)?expectativa\b/,
  /\b(?:nesse|neste)\s+momento\b.{0,45}\bnao\s+(?:teria|tenho|consigo)\b.{0,30}\b(?:valor|investimento|condic\w*)\b/,
  /\bnao\s+(?:teria|tenho|consigo)\b.{0,35}\b(?:esse|o)?\s*(?:valor|investimento)\b/,
  /\b(?:esse|este|o)?\s*(?:valor|investimento)\b.{0,45}\b(?:alem|acima)\b.{0,25}\b(?:do\s+que\s+)?(?:eu\s+)?(?:posso|consigo|tenho\s+condic\w*)\b/,
  /\balem\s+do\s+que\s+(?:eu\s+)?(?:posso|consigo)\b/,
];

const COURSE_MENTION =
  /\bcurso\b|\b(?:formato|conteudo|aulas?)\b.{0,40}\bgravad[oa]s?\b/;
const COURSE_PRICE = /\b(?:r\$\s*)?997(?:[,.]00)?\b/;
const GENERIC_PRICE_REQUEST = [
  /\bquanto\s+(?:custa|fica|sai|e|eh|esta|ta)\b/,
  /\bqual\b.{0,20}\b(?:valor|preco|investimento|custo)\b/,
  /\b(?:preciso|queria|gostaria)\b.{0,45}\b(?:saber|entender)\b.{0,30}\b(?:valor|preco|investimento|custo)\b/,
  /\b(?:saber|entender)\b.{0,45}\b(?:valor|preco|investimento|custo)\b/,
  /^(?:e\s+)?(?:o\s+|os\s+)?(?:valor|valores|preco|precos|investimento|custo)\s*[?!.]*$/,
  /\b(?:valor|preco|investimento|custo)\s*\?/,
  /\b(?:pode|consegue|tem\s+como)\b.{0,30}\b(?:repetir|lembrar|informar)\b.{0,35}\b(?:valor|preco|investimento|condic\w*)\b/,
  /\b(?:quais?|como)\b.{0,30}\b(?:condic\w*|formas?)\b.{0,20}\bpagamento\b/,
];
const SHORT_AFFIRMATIVE =
  /^(?:sim|sim\s+por\s+favor|por\s+favor|por\s+gentileza|claro|pode|perfeito|combinado)[!.,\s]*$/;
const PIX_CHOICE =
  /^(?:pix|no\s+pix|a\s+vista|vista\s+no\s+pix|prefiro\s+(?:o\s+)?pix|pix\s+mesmo)[!.,\s]*$|\b(?:prefiro|vou|quero|melhor|fico|opto)\b.{0,25}\bpix\b/;
const CARD_CHOICE =
  /^(?:cartao|no\s+cartao|parcelado|cartao\s+de\s+credito|prefiro\s+(?:o\s+)?cartao)[!.,\s]*$|\b(?:prefiro|vou|quero|melhor|fico|opto)\b.{0,25}\b(?:cartao|parcelado)\b/;

const MENTORSHIP_RECORDED_CONTENT_INCLUSION = [
  /\bmentoria\b.{0,35}\b(?:tenho|terei|vou ter|da)\s+acesso\b.{0,40}\b(?:curso|conteudo|formato|aulas?|gravad[oa])\b/,
  /\bmentoria\b.{0,55}\b(?:inclui|inclus[oa]|vem|acompanha|da acesso|tem)\b.{0,45}\b(?:curso|conteudo|formato|aulas?|gravad[oa])\b/,
  /\b(?:curso|conteudo|formato|aulas?|gravad[oa])\b.{0,45}\b(?:inclui|inclus[oa]|vem|acompanha|faz parte|junto)\b.{0,35}\bmentoria\b/,
  /\b(?:junto|inclus[oa]|inclui|faz parte|vem com|acompanha)\b.{0,50}\b(?:curso|conteudo|formato|aulas?|gravad[oa])\b/,
  /\b(?:esse|este|o)\s+valor\b.{0,35}\b(?:inclui|vem com|da acesso)\b.{0,40}\b(?:curso|conteudo|formato|aulas?|gravad[oa])\b/,
  /\b(?:tenho|terei|vou ter|da)\s+acesso\b.{0,35}\b(?:curso|conteudo|formato|aulas?|gravad[oa])\b.{0,35}\b(?:na|com a|junto da)?\s*mentoria\b/,
];

const RECORDED_CONTENT_FORMAT_QUESTION = [
  /\btem\b.{0,30}\b(?:aulas?|conteudo|material)\s+gravad[oa]s?\b/,
  /\b(?:aulas?|conteudo|material)\s+gravad[oa]s?\b.{0,35}\b(?:ou|so|apenas|tambem|tem)\b/,
  /\b(?:ao\s+vivo|live)\b.{0,25}\b(?:ou|e)\b.{0,25}\bgravad[oa]s?\b/,
];

const LEAD_SOURCE_QUESTION = [
  /\bonde\b.{0,45}\b(?:viu|conseguiu|pegou|achou)\b.{0,45}\b(?:respostas?|dados?|contato|numero)\b/,
  /\b(?:de\s+onde|como)\b.{0,45}\b(?:vieram|conseguiu|pegou)\b.{0,35}\b(?:respostas?|dados?|contato|numero)\b/,
  /\bqual\b.{0,25}\bformulario\b/,
  /\bbullink\b.{0,15}\bo\s+que\s+(?:e|eh)\b/,
];

const RESULTS_TIMELINE_QUESTION = [
  /\b(?:em\s+)?quanto\s+tempo\b.{0,75}\b(?:resultado|retorno|payback|faturamento|monetiz|renda|10\s*mil)\b/,
  /\b(?:prazo|tempo)\s+medi[oa]\b.{0,75}\b(?:resultado|retorno|payback|faturamento|monetiz|renda|10\s*mil)\b/,
  /\b(?:resultado|retorno|payback|faturamento|monetiz|renda|10\s*mil)\b.{0,75}\b(?:prazo|tempo)\s+medi[oa]\b/,
  /\b(?:retorno|payback)\b.{0,75}\b(?:investimento|prazo|tempo|esperad[oa])\b/,
];

const MENTORSHIP_PRICE =
  /\b6\s*500(?:\s*00)?\b|\b12\s*x\b.{0,25}\b650(?:\s*00)?\b/;

const SELF_CONFIRMATION_PATTERNS: RegExp[] = [
  // "Sou eu mesmo, Fernando" / "sou eu, o Fernando"
  /\b(?:sou|e|é|eh)\s+eu\s+mesm[oa]\s*,?\s*(?:o\s+)?fernando(?:\s+albuquerque)?\b[^.!?;]*/gi,
  /\b(?:sou|e|é|eh)\s+eu\s*,?\s*(?:o\s+)?fernando(?:\s+albuquerque)?\b[^.!?;]*/gi,
  // "É o Fernando mesmo" / "aqui é o Fernando"
  /(?:^|\s)(?:e|é|eh)\s+(?:o\s+)?fernando(?:\s+albuquerque)?\s+mesm[oa]\b[^.!?;]*/gi,
  /\baqui\s+(?:e|é|eh)\s+(?:o\s+)?fernando(?:\s+albuquerque)?\b[^.!?;]*/gi,
  // "Eu sou o Fernando" / "sou Fernando"
  /\b(?:eu\s+)?sou\s+(?:o\s+)?fernando(?:\s+albuquerque)?\b[^.!?;]*/gi,
  // confirmações artificiais equivalentes
  /\bvoce\s+(?:esta|ta)\s+falando\s+(?:direto\s+)?comigo\s*,?\s*(?:o\s+)?fernando\b[^.!?;]*/gi,
];

function cleanup(value: string): string {
  return value
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.!?;])/g, "$1")
    .replace(/^[\s,;.!?-]+/, "")
    .trim();
}

export function isExplicitRecordedCourseRequest(
  inbound: string | null | undefined,
): boolean {
  const n = norm(inbound);
  const rejectionVerb =
    "(?:quero|tenho\\s+interesse|prefiro|gosto|gostei|curti|funciona|funcionou|serve)";
  const rejectsCourse = new RegExp(
    `\\b(?:nao|nunca)\\s+${rejectionVerb}\\b.{0,35}\\b(?:curso|conteudo|formato|aulas?|gravad[oa])\\b`,
  ).test(n) ||
    new RegExp(
      `\\b(?:curso|conteudo|formato|aulas?|gravad[oa])\\b.{0,35}\\b(?:nao|nunca)\\s+${rejectionVerb}\\b`,
    ).test(n);
  if (!n || rejectsCourse || isMentorshipRecordedContentInclusionQuestion(n)) {
    return false;
  }
  return EXPLICIT_COURSE_REQUEST.some((pattern) => pattern.test(n));
}

export function isExplicitRecordedCoursePriceRequest(
  inbound: string | null | undefined,
): boolean {
  const n = norm(inbound);
  if (!n || isMentorshipRecordedContentInclusionQuestion(n)) return false;
  return EXPLICIT_COURSE_PRICE_REQUEST.some((pattern) => pattern.test(n));
}

export function isMentorshipRecordedContentInclusionQuestion(
  inbound: string | null | undefined,
): boolean {
  const n = norm(inbound);
  return !!n &&
    MENTORSHIP_RECORDED_CONTENT_INCLUSION.some((pattern) => pattern.test(n));
}

export function isBudgetObjection(inbound: string | null | undefined): boolean {
  const n = norm(inbound);
  return !!n && BUDGET_OBJECTION.some((pattern) => pattern.test(n));
}

export function mentionsRecordedCourseWithPrice(
  response: string | null | undefined,
): boolean {
  const n = norm(response);
  return COURSE_MENTION.test(n) && COURSE_PRICE.test(n);
}

export function containsPersonaSelfConfirmation(
  response: string | null | undefined,
): boolean {
  const raw = String(response ?? "");
  return SELF_CONFIRMATION_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(raw);
  });
}

export function stripPersonaSelfConfirmation(
  response: string | null | undefined,
): string {
  let out = String(response ?? "");
  for (const pattern of SELF_CONFIRMATION_PATTERNS) {
    pattern.lastIndex = 0;
    out = out.replace(pattern, "");
  }
  return cleanup(out);
}

function extractQuestions(text: string | null | undefined): string[] {
  return String(text ?? "")
    .split(/(?<=[?!.])\s+|\n+/)
    .map((part) => part.trim())
    .filter((part) => part.includes("?"));
}

function questionKey(text: string): string {
  return norm(text).replace(/\?/g, "").trim();
}

function repeatedQuestions(response: string, previous: string[]): string[] {
  const prior = new Set(previous.map(questionKey).filter(Boolean));
  return extractQuestions(response).filter((question) =>
    prior.has(questionKey(question))
  );
}

function removeRepeatedQuestions(response: string, repeated: string[]): string {
  let out = response;
  for (const question of repeated) out = out.replace(question, "");
  return cleanup(out);
}

export const BULLINK_RECORDED_COURSE_REPLY =
  "Sim. Tenho o Curso Gravado por R$ 997 à vista no PIX, com o mesmo método da Mentoria, mas sem acompanhamento individual. Quer que eu te explique como funciona?";

export const BULLINK_RECORDED_COURSE_PRICE_REPLY =
  "O Curso Gravado fica em R$ 997 à vista no PIX, com o mesmo método da Mentoria e sem acompanhamento individual. Quer que eu te explique o próximo passo?";

export const BULLINK_RECORDED_COURSE_DETAILS_REPLY =
  "O Curso Gravado apresenta o método em módulos práticos: nichos validados, idiomas de atuação, validação, mineração de referências, títulos de alto clique, roteiros de alta retenção, leitura de métricas e monetização. Você segue no seu ritmo e pode rever as aulas; a diferença é que ele não inclui o acompanhamento individual da Mentoria. Qual parte você quer entender melhor?";

export const BULLINK_MENTORSHIP_INCLUDES_RECORDED_REPLY =
  "Sim. A Mentoria inclui acesso ao conteúdo gravado e também os 3 meses de acompanhamento individual comigo. Quer que eu te explique o próximo passo para entrar?";

export const BULLINK_PRIMARY_OFFER_LOCK_REPLY =
  "A Mentoria inclui o conteúdo gravado e 3 meses de acompanhamento individual comigo. O investimento é R$ 6.500 à vista no PIX ou 12x de R$ 650 no cartão. Faz sentido para você?";

export const BULLINK_MENTORSHIP_PAYMENT_METHOD_REPLY =
  "Perfeito. Você prefere pagar à vista no PIX ou parcelar em 12x no cartão?";

export const BULLINK_BUDGET_DOWNSELL_REPLY =
  "Entendo, cara. Pra você não ficar sem um caminho, tenho o Curso Gravado por R$ 997 à vista no PIX, com o mesmo método, só sem meu acompanhamento individual. Faz mais sentido pra você?";

export const BULLINK_REPETITION_FALLBACK =
  "Entendi. Me diz qual ponto você quer esclarecer agora que eu respondo direto.";

export const BULLINK_LEAD_SOURCE_REPLY =
  "A Bullink é a empresa deste atendimento. Suas informações chegaram pelo formulário de interesse que você preencheu antes do contato; por isso eu recebi suas respostas para dar continuidade por aqui.";

export const BULLINK_RESULTS_TIMELINE_REPLY =
  "Não existe um prazo médio que eu possa prometer para chegar a R$ 10 mil por mês. Isso varia conforme nicho, execução e desempenho do canal; os 3 meses são o período de acompanhamento, não uma garantia de faturamento.";

export const BULLINK_COURSE_CONTINUITY_REPLY =
  "Perfeito. O Curso Gravado segue com o mesmo método em aulas no seu ritmo, sem acompanhamento individual. Qual dúvida você quer esclarecer antes de decidir?";

export function readBullinkOfficialPixKey(
  aiConfig: Record<string, unknown> | null | undefined,
): string | null {
  const source = [aiConfig?.prompt_regras, aiConfig?.prompt_roteiro]
    .filter((value): value is string => typeof value === "string")
    .join("\n");
  const match = source.match(
    /(?:use\s+exclusivamente\s+a\s+chave|chave\s+aleatoria)\s+([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i,
  );
  return match?.[1] ?? null;
}

export function readBullinkOfficialCardUrl(
  aiConfig: Record<string, unknown> | null | undefined,
): string | null {
  const source = [aiConfig?.prompt_regras, aiConfig?.prompt_roteiro]
    .filter((value): value is string => typeof value === "string")
    .join("\n");
  const match = source.match(/https:\/\/link\.infinitepay\.io\/[^\s<>"']+/i);
  return match?.[0]?.replace(/[),.;]+$/, "") ?? null;
}

function recentOutboundTexts(input: BullinkConversationGuardInput): string[] {
  return (input.recentMessages ?? [])
    .filter((message) => String(message?.direcao ?? "").toUpperCase() === "OUT")
    .map((message) => norm(String(message?.mensagem ?? "")))
    .filter(Boolean);
}

function mentorshipPriceAlreadySent(
  input: BullinkConversationGuardInput,
): boolean {
  return recentOutboundTexts(input).some((text) => MENTORSHIP_PRICE.test(text));
}

function explicitlyRequestsMentorshipPriceOrTerms(
  input: BullinkConversationGuardInput,
): boolean {
  const inbound = norm(input.inbound);
  return isGenericPriceRequest(input.inbound) ||
    PIX_CHOICE.test(inbound) ||
    CARD_CHOICE.test(inbound) ||
    /\b(?:pix|cartao|parcelas?|parcelamento)\b.{0,35}\?/.test(inbound);
}

function stripRepeatedMentorshipPrice(response: string): string {
  const kept = response
    .split(/(?<=[.!?])\s+|\n+/)
    .filter((part) => !MENTORSHIP_PRICE.test(norm(part)))
    .join(" ");
  return cleanup(kept) || BULLINK_REPETITION_FALLBACK;
}

function recentMentorshipOfferAwaitingConfirmation(
  input: BullinkConversationGuardInput,
): boolean {
  return recentOutboundTexts(input).some((text) =>
    /\bmentoria\b/.test(text) &&
    /\b6\s*500(?:\s*00)?\b/.test(text) &&
    /\b(?:faz\s+sentido|quer\s+seguir|podemos\s+(?:seguir|avancar|fechar))\b.{0,40}\?/
      .test(text)
  );
}

function recentMentorshipPaymentMethodQuestion(
  input: BullinkConversationGuardInput,
): boolean {
  const out = recentOutboundTexts(input);
  const askedMethod = out.some((text) =>
    /\bpix\b.{0,70}\b(?:cartao|parcelado)\b.{0,40}\?|\b(?:cartao|parcelado)\b.{0,70}\bpix\b.{0,40}\?/
      .test(text)
  );
  const pricedMentorship = out.some((text) =>
    /\bmentoria\b/.test(text) && /\b6\s*500(?:\s*00)?\b/.test(text)
  );
  return askedMethod && pricedMentorship;
}

function isConfirmedMentorshipPurchase(
  input: BullinkConversationGuardInput,
): boolean {
  if (!SHORT_AFFIRMATIVE.test(norm(input.inbound))) return false;
  const stateConfirms = input.commercialState?.product_focus === "mentoria" &&
    input.commercialState?.price_informed?.product === "mentoria" &&
    input.commercialState?.awaiting_offer_confirmation === "mentoria";
  return stateConfirms || recentMentorshipOfferAwaitingConfirmation(input);
}

function hasMentorshipPaymentChoiceContext(
  input: BullinkConversationGuardInput,
): boolean {
  const stateConfirms = input.commercialState?.product_focus === "mentoria" &&
    input.commercialState?.price_informed?.product === "mentoria" &&
    input.commercialState?.awaiting_payment_method === true &&
    typeof input.commercialState?.closing_intent_at === "string";
  return stateConfirms || recentMentorshipPaymentMethodQuestion(input);
}

function canonicalMentorshipPixReply(key: string): string {
  return `Perfeito. A chave PIX oficial é ${key}. Depois do pagamento, me envie o comprovante por aqui.`;
}

function canonicalMentorshipCardReply(url: string): string {
  return `Perfeito. O pagamento em 12x de R$ 650 no cartão é feito por este link oficial: ${url}. Depois de concluir, me avise por aqui.`;
}

export function shouldDeferBullinkSaleHandoff(input: {
  empresaId: string | null | undefined;
  intent: string | null | undefined;
  officialPixKey?: string | null;
  officialCardUrl?: string | null;
}): boolean {
  return isBullinkTenant(input.empresaId) &&
    input.intent === "venda_fechada" &&
    Boolean(input.officialPixKey) &&
    Boolean(input.officialCardUrl);
}

function isConfirmedCoursePurchase(
  input: BullinkConversationGuardInput,
): boolean {
  const st = input.commercialState;
  return norm(input.inbound).match(SHORT_AFFIRMATIVE) !== null &&
    st?.budget_objection === true &&
    st?.product_focus === "curso" &&
    st?.price_informed?.product === "curso" &&
    st?.awaiting_offer_confirmation === "curso";
}

function canonicalCoursePixReply(key: string): string {
  return `Perfeito. O Curso Gravado fica em R$ 997 à vista no PIX. A chave PIX é ${key}. Depois do pagamento, me envie o comprovante por aqui.`;
}

function isGenericPriceRequest(inbound: string | null | undefined): boolean {
  const n = norm(inbound);
  return !!n && GENERIC_PRICE_REQUEST.some((pattern) => pattern.test(n));
}

function rejectsRecordedCourse(text: string): boolean {
  return /\b(?:nao|nunca)\b.{0,25}\b(?:quero|tenho\s+interesse|prefiro|gosto|funciona|serve)\b.{0,35}\b(?:curso|gravado)\b/
    .test(text) ||
    /\b(?:curso|gravado)\b.{0,35}\b(?:nao|nunca)\b.{0,25}\b(?:quero|tenho\s+interesse|prefiro|gosto|funciona|serve)\b/
      .test(text);
}

/**
 * Reconstrói o produto ativo pelo diálogo recente quando o estado persistido
 * ficou atrasado. Isso cobre deploys antigos e turns em que o downsell foi dito
 * pelo agente, mas `commercial_v2.product_focus` permaneceu em `mentoria`.
 */
export function inferBullinkConversationProductFocus(input: {
  empresaId: string | null | undefined;
  recentMessages?: BullinkRecentMessage[] | null;
  stateFocus?: unknown;
  stateBudgetObjection?: unknown;
}): "mentoria" | "curso" | null {
  const stateFocus =
    input.stateFocus === "mentoria" || input.stateFocus === "curso"
      ? input.stateFocus
      : null;
  if (!isBullinkTenant(input.empresaId)) return stateFocus;

  let budgetUnlocked = input.stateBudgetObjection === true;
  let focus: "mentoria" | "curso" | null = budgetUnlocked
    ? stateFocus
    : "mentoria";
  for (const message of input.recentMessages ?? []) {
    const text = norm(String(message?.mensagem ?? ""));
    if (!text) continue;
    const direction = String(message?.direcao ?? "").toUpperCase();

    if (direction === "OUT") {
      const hasCourse = COURSE_MENTION.test(text);
      const hasMentorship = /\bmentoria\b/.test(text);
      const saysIncluded =
        /\b(?:inclui|inclus[oa]|vem\s+com|junto|faz\s+parte|acesso)\b/.test(
          text,
        );
      if (hasCourse && hasMentorship && saysIncluded) {
        focus = "mentoria";
      } else if (hasCourse && budgetUnlocked) {
        focus = "curso";
      } else if (hasMentorship) {
        focus = "mentoria";
      }
      continue;
    }

    if (direction === "IN") {
      if (isBudgetObjection(text)) budgetUnlocked = true;
      if (
        rejectsRecordedCourse(text) ||
        /\b(?:quero|prefiro|vou\s+seguir\s+com)\b.{0,30}\bmentoria\b/.test(text)
      ) {
        focus = "mentoria";
      } else if (
        budgetUnlocked &&
        (isExplicitRecordedCourseRequest(text) ||
          /\b(?:quero|prefiro|tenho\s+interesse)\b.{0,30}\b(?:curso|gravado)\b/
            .test(text))
      ) {
        focus = "curso";
      }
    }
  }
  return focus;
}

/**
 * Barreira final determinística. Para qualquer outro tenant, devolve exatamente
 * o texto recebido, sem normalização ou efeitos colaterais.
 */
export function enforceBullinkConversationGuard(
  input: BullinkConversationGuardInput,
): BullinkConversationGuardResult {
  const original = String(input.response ?? "");
  if (!isBullinkTenant(input.empresaId)) {
    return { text: original, changed: false, reasons: [] };
  }

  let text = original;
  const reasons: BullinkGuardReason[] = [];
  const normalizedInbound = norm(input.inbound);
  const recordedFormatQuestion = RECORDED_CONTENT_FORMAT_QUESTION.some((
    pattern,
  ) => pattern.test(normalizedInbound));
  const asksMentorshipInclusion =
    isMentorshipRecordedContentInclusionQuestion(input.inbound) ||
    (input.commercialState?.product_focus === "mentoria" &&
      recordedFormatQuestion);
  const explicitCourse = !asksMentorshipInclusion &&
    isExplicitRecordedCourseRequest(input.inbound);
  const explicitCoursePrice = isExplicitRecordedCoursePriceRequest(
    input.inbound,
  );
  const budgetObjection = isBudgetObjection(input.inbound);
  const historicalBudgetObjection =
    input.commercialState?.budget_objection === true ||
    (input.recentMessages ?? []).some((message) =>
      String(message?.direcao ?? "").toUpperCase() === "IN" &&
      isBudgetObjection(String(message?.mensagem ?? ""))
    );
  const secondaryUnlocked = budgetObjection || historicalBudgetObjection;
  const inferredProductFocus = inferBullinkConversationProductFocus({
    empresaId: input.empresaId,
    recentMessages: input.recentMessages,
    stateFocus: input.commercialState?.product_focus,
    stateBudgetObjection: input.commercialState?.budget_objection,
  });
  const courseAlreadyEstablished = secondaryUnlocked &&
    inferredProductFocus === "curso";
  const genericCoursePrice = courseAlreadyEstablished &&
    isGenericPriceRequest(input.inbound);
  const asksLeadSource = LEAD_SOURCE_QUESTION.some((pattern) =>
    pattern.test(normalizedInbound)
  );
  const asksResultsTimeline = RESULTS_TIMELINE_QUESTION.some((pattern) =>
    pattern.test(normalizedInbound)
  );
  const responseRegressesToMentorship = courseAlreadyEstablished &&
    !/\bmentoria\b/.test(normalizedInbound) &&
    /\b(?:seguir|voltar|ficar|prefere|continuar)\b.{0,45}\bmentoria\b|\bmentoria\s+completa\b/
      .test(norm(text));

  if (containsPersonaSelfConfirmation(text)) {
    reasons.push("persona_self_confirmation");
    text = stripPersonaSelfConfirmation(text);
  }

  if (asksLeadSource && text !== BULLINK_LEAD_SOURCE_REPLY) {
    reasons.push("lead_source_question_unanswered");
    text = BULLINK_LEAD_SOURCE_REPLY;
  } else if (asksResultsTimeline && text !== BULLINK_RESULTS_TIMELINE_REPLY) {
    reasons.push("results_timeline_question_unanswered");
    text = BULLINK_RESULTS_TIMELINE_REPLY;
  } else if (!secondaryUnlocked && explicitCoursePrice) {
    reasons.push("secondary_requested_before_budget_objection");
    text = BULLINK_PRIMARY_OFFER_LOCK_REPLY;
  } else if (
    asksMentorshipInclusion &&
    text !== BULLINK_MENTORSHIP_INCLUDES_RECORDED_REPLY
  ) {
    reasons.push("mentorship_recorded_content_inclusion");
    text = BULLINK_MENTORSHIP_INCLUDES_RECORDED_REPLY;
  } else if (budgetObjection && !mentionsRecordedCourseWithPrice(text)) {
    reasons.push("budget_objection_without_downsell");
    text = BULLINK_BUDGET_DOWNSELL_REPLY;
  } else if (!secondaryUnlocked && explicitCourse) {
    reasons.push("secondary_requested_before_budget_objection");
    text = BULLINK_MENTORSHIP_INCLUDES_RECORDED_REPLY;
  } else if (explicitCoursePrice && !mentionsRecordedCourseWithPrice(text)) {
    reasons.push("explicit_recorded_course_unanswered");
    text = BULLINK_RECORDED_COURSE_REPLY;
  } else if (genericCoursePrice && !mentionsRecordedCourseWithPrice(text)) {
    reasons.push("course_context_price_unanswered");
    text = BULLINK_RECORDED_COURSE_PRICE_REPLY;
  } else if (explicitCourse && !explicitCoursePrice) {
    const normalizedResponse = norm(text);
    const answeredCourse = COURSE_MENTION.test(normalizedResponse);
    const volunteeredPrice = COURSE_PRICE.test(normalizedResponse);
    if (!answeredCourse || volunteeredPrice) {
      reasons.push(
        volunteeredPrice
          ? "recorded_course_price_not_requested"
          : "explicit_recorded_course_unanswered",
      );
      text = BULLINK_RECORDED_COURSE_DETAILS_REPLY;
    }
  } else if (responseRegressesToMentorship) {
    reasons.push("course_context_regressed_to_mentorship");
    text = BULLINK_COURSE_CONTINUITY_REPLY;
  } else if (!secondaryUnlocked && COURSE_MENTION.test(norm(text))) {
    reasons.push("unsolicited_recorded_course_offer");
    const withoutCourse = String(text)
      .split(/(?<=[.!?])\s+|\n+/)
      .filter((part) => !COURSE_MENTION.test(norm(part)))
      .join(" ")
      .trim();
    text = withoutCourse || BULLINK_REPETITION_FALLBACK;
  }

  if (
    MENTORSHIP_PRICE.test(norm(text)) &&
    mentorshipPriceAlreadySent(input) &&
    !explicitlyRequestsMentorshipPriceOrTerms(input)
  ) {
    reasons.push("repeated_mentorship_price");
    text = stripRepeatedMentorshipPrice(text);
  }

  if (
    isConfirmedCoursePurchase(input) && input.officialPixKey &&
    !text.includes(input.officialPixKey)
  ) {
    reasons.push("course_purchase_confirmation_without_payment_details");
    text = canonicalCoursePixReply(input.officialPixKey);
  }

  if (
    isConfirmedMentorshipPurchase(input) &&
    text !== BULLINK_MENTORSHIP_PAYMENT_METHOD_REPLY
  ) {
    reasons.push("mentorship_purchase_confirmation_without_payment_choice");
    text = BULLINK_MENTORSHIP_PAYMENT_METHOD_REPLY;
  } else if (
    hasMentorshipPaymentChoiceContext(input) &&
    PIX_CHOICE.test(normalizedInbound) && input.officialPixKey
  ) {
    const expected = canonicalMentorshipPixReply(input.officialPixKey);
    if (text !== expected) {
      reasons.push("mentorship_pix_choice_without_payment_details");
      text = expected;
    }
  } else if (
    hasMentorshipPaymentChoiceContext(input) &&
    CARD_CHOICE.test(normalizedInbound) && input.officialCardUrl
  ) {
    const expected = canonicalMentorshipCardReply(input.officialCardUrl);
    if (text !== expected) {
      reasons.push("mentorship_card_choice_without_payment_details");
      text = expected;
    }
  }

  const repeated = repeatedQuestions(text, input.previousAgentQuestions ?? []);
  if (repeated.length > 0) {
    reasons.push("repeated_question");
    text = removeRepeatedQuestions(text, repeated);
    if (!text) text = BULLINK_REPETITION_FALLBACK;
  }

  return { text, changed: text !== original, reasons };
}

export function buildBullinkConversationPromptBlock(
  empresaId: string | null | undefined,
): string {
  if (!isBullinkTenant(empresaId)) return "";
  return [
    "\n=== REFORÇO CONVERSACIONAL BULLINK (INVIOLÁVEL) ===",
    '- Nunca confirme sua identidade com frases como "sou eu mesmo, Fernando", "é o Fernando mesmo", "aqui é o Fernando" ou equivalentes.',
    "- A Mentoria INCLUI acesso ao conteúdo gravado e 3 meses de acompanhamento individual. Se o lead perguntar se o curso/conteúdo gravado vem junto, está incluso ou faz parte da Mentoria, responda isso diretamente e mantenha a Mentoria como oferta ativa.",
    '- Se a Mentoria estiver em foco e o lead perguntar "tem aula gravada ou só ao vivo?", trate como dúvida sobre o que a Mentoria inclui; não mude para o Curso avulso.',
    "- Antes de uma objeção financeira explícita à Mentoria, pedido, interesse, menção ou pergunta sobre Curso/gravado NÃO libera a oferta secundária: mantenha somente a Mentoria e explique que ela inclui conteúdo gravado.",
    "- Só depois de o lead dizer explicitamente que não consegue pagar, que está caro ou fora do orçamento, apresente o Curso Gravado e informe R$ 997. Perguntar diretamente pelo Curso ou pelo preço dele, sem objeção financeira anterior, NÃO libera essa alternativa.",
    "- Se houver objeção financeira, apresente imediatamente e com respeito o Curso Gravado por R$ 997; não repita o preço da Mentoria antes da alternativa.",
    "- Nunca repita a mesma pergunta sem acrescentar informação útil. Responda primeiro a dúvida específica do lead.",
    '- Nunca descarte uma dúvida com "voltando ao que importa" ou equivalente. Perguntas sobre origem do contato, prazo e resultados devem ser respondidas de forma direta e honesta.',
    "- Quando o Curso Gravado já for o produto em foco, não volte a oferecer a Mentoria por conta própria. Continue no Curso até o lead pedir explicitamente a Mentoria.",
    "- Depois que o preço da Mentoria for informado e o lead aceitar, pergunte somente se prefere PIX ou cartão. Não peça horário e não prometa enviar dados depois.",
    "- Depois que o lead escolher PIX ou cartão, envie os dados oficiais correspondentes e aguarde confirmação/comprovante. Não transfira a conversa antes disso.",
    "- Nunca prometa prazo ou faturamento. Os 3 meses são acompanhamento, não garantia de resultado.",
    "=== FIM DO REFORÇO CONVERSACIONAL BULLINK ===\n",
  ].join("\n");
}
