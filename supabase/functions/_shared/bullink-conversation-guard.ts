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
  | "repeated_question";

export interface BullinkConversationGuardInput {
  empresaId: string | null | undefined;
  inbound: string | null | undefined;
  response: string | null | undefined;
  previousAgentQuestions?: string[] | null;
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
  /\bnao\s+(?:tenho|consigo|da)\b.{0,40}\b(?:dinheiro|grana|valor|investimento|pagar)\b/,
  /\b(?:valor|investimento)\b.{0,30}\b(?:pesa|pesou|pesado|impossivel)\b/,
  /\bsem\s+(?:dinheiro|grana|verba|orcamento)\b/,
  /\bnao\s+cabe\b.{0,20}\b(?:bolso|orcamento)\b/,
];

const COURSE_MENTION = /\b(?:curso|formato|conteudo|aulas?)\b.{0,40}\bgravad[oa]s?\b|\bcurso\s+gravad[oa]\b/;
const COURSE_PRICE = /\b(?:r\$\s*)?997(?:[,.]00)?\b/;

const MENTORSHIP_RECORDED_CONTENT_INCLUSION = [
  /\bmentoria\b.{0,35}\b(?:tenho|terei|vou ter|da)\s+acesso\b.{0,40}\b(?:curso|conteudo|formato|aulas?|gravad[oa])\b/,
  /\bmentoria\b.{0,55}\b(?:inclui|inclus[oa]|vem|acompanha|da acesso|tem)\b.{0,45}\b(?:curso|conteudo|formato|aulas?|gravad[oa])\b/,
  /\b(?:curso|conteudo|formato|aulas?|gravad[oa])\b.{0,45}\b(?:inclui|inclus[oa]|vem|acompanha|faz parte|junto)\b.{0,35}\bmentoria\b/,
  /\b(?:junto|inclus[oa]|inclui|faz parte|vem com|acompanha)\b.{0,50}\b(?:curso|conteudo|formato|aulas?|gravad[oa])\b/,
  /\b(?:esse|este|o)\s+valor\b.{0,35}\b(?:inclui|vem com|da acesso)\b.{0,40}\b(?:curso|conteudo|formato|aulas?|gravad[oa])\b/,
  /\b(?:tenho|terei|vou ter|da)\s+acesso\b.{0,35}\b(?:curso|conteudo|formato|aulas?|gravad[oa])\b.{0,35}\b(?:na|com a|junto da)?\s*mentoria\b/,
];

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

export function isExplicitRecordedCourseRequest(inbound: string | null | undefined): boolean {
  const n = norm(inbound);
  const rejectionVerb = "(?:quero|tenho\\s+interesse|prefiro|gosto|gostei|curti|funciona|funcionou|serve)";
  const rejectsCourse = new RegExp(
    `\\b(?:nao|nunca)\\s+${rejectionVerb}\\b.{0,35}\\b(?:curso|conteudo|formato|aulas?|gravad[oa])\\b`,
  ).test(n)
    || new RegExp(
      `\\b(?:curso|conteudo|formato|aulas?|gravad[oa])\\b.{0,35}\\b(?:nao|nunca)\\s+${rejectionVerb}\\b`,
    ).test(n);
  if (!n || rejectsCourse || isMentorshipRecordedContentInclusionQuestion(n)) return false;
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
  return !!n && MENTORSHIP_RECORDED_CONTENT_INCLUSION.some((pattern) => pattern.test(n));
}

export function isBudgetObjection(inbound: string | null | undefined): boolean {
  const n = norm(inbound);
  return !!n && BUDGET_OBJECTION.some((pattern) => pattern.test(n));
}

export function mentionsRecordedCourseWithPrice(response: string | null | undefined): boolean {
  const n = norm(response);
  return COURSE_MENTION.test(n) && COURSE_PRICE.test(n);
}

export function containsPersonaSelfConfirmation(response: string | null | undefined): boolean {
  const raw = String(response ?? "");
  return SELF_CONFIRMATION_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(raw);
  });
}

export function stripPersonaSelfConfirmation(response: string | null | undefined): string {
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
  return extractQuestions(response).filter((question) => prior.has(questionKey(question)));
}

function removeRepeatedQuestions(response: string, repeated: string[]): string {
  let out = response;
  for (const question of repeated) out = out.replace(question, "");
  return cleanup(out);
}

export const BULLINK_RECORDED_COURSE_REPLY =
  "Sim. Tenho o Curso Gravado por R$ 997 à vista no PIX, com o mesmo método da Mentoria, mas sem acompanhamento individual. Quer que eu te explique como funciona?";

export const BULLINK_RECORDED_COURSE_DETAILS_REPLY =
  "O Curso Gravado apresenta o método em módulos práticos: nichos validados, idiomas de atuação, validação, mineração de referências, títulos de alto clique, roteiros de alta retenção, leitura de métricas e monetização. Você segue no seu ritmo e pode rever as aulas; a diferença é que ele não inclui o acompanhamento individual da Mentoria. Qual parte você quer entender melhor?";

export const BULLINK_MENTORSHIP_INCLUDES_RECORDED_REPLY =
  "Sim. A Mentoria inclui acesso ao conteúdo gravado e também os 3 meses de acompanhamento individual comigo. Quer que eu te explique o próximo passo para entrar?";

export const BULLINK_BUDGET_DOWNSELL_REPLY =
  "Entendo, cara. Pra você não ficar sem um caminho, tenho o Curso Gravado por R$ 997 à vista no PIX, com o mesmo método, só sem meu acompanhamento individual. Faz mais sentido pra você?";

export const BULLINK_REPETITION_FALLBACK =
  "Entendi. Me diz qual ponto você quer esclarecer agora que eu respondo direto.";

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
  const asksMentorshipInclusion = isMentorshipRecordedContentInclusionQuestion(input.inbound);
  const explicitCourse = isExplicitRecordedCourseRequest(input.inbound);
  const explicitCoursePrice = isExplicitRecordedCoursePriceRequest(input.inbound);
  const budgetObjection = isBudgetObjection(input.inbound);

  if (containsPersonaSelfConfirmation(text)) {
    reasons.push("persona_self_confirmation");
    text = stripPersonaSelfConfirmation(text);
  }

  if (asksMentorshipInclusion && text !== BULLINK_MENTORSHIP_INCLUDES_RECORDED_REPLY) {
    reasons.push("mentorship_recorded_content_inclusion");
    text = BULLINK_MENTORSHIP_INCLUDES_RECORDED_REPLY;
  } else if (budgetObjection && !mentionsRecordedCourseWithPrice(text)) {
    reasons.push("budget_objection_without_downsell");
    text = BULLINK_BUDGET_DOWNSELL_REPLY;
  } else if (explicitCoursePrice && !mentionsRecordedCourseWithPrice(text)) {
    reasons.push("explicit_recorded_course_unanswered");
    text = BULLINK_RECORDED_COURSE_REPLY;
  } else if (explicitCourse && !explicitCoursePrice) {
    const normalizedResponse = norm(text);
    const answeredCourse = COURSE_MENTION.test(normalizedResponse);
    const volunteeredPrice = COURSE_PRICE.test(normalizedResponse);
    if (!answeredCourse || volunteeredPrice) {
      reasons.push(volunteeredPrice
        ? "recorded_course_price_not_requested"
        : "explicit_recorded_course_unanswered");
      text = BULLINK_RECORDED_COURSE_DETAILS_REPLY;
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

export function buildBullinkConversationPromptBlock(empresaId: string | null | undefined): string {
  if (!isBullinkTenant(empresaId)) return "";
  return [
    "\n=== REFORÇO CONVERSACIONAL BULLINK (INVIOLÁVEL) ===",
    '- Nunca confirme sua identidade com frases como "sou eu mesmo, Fernando", "é o Fernando mesmo", "aqui é o Fernando" ou equivalentes.',
    '- A Mentoria INCLUI acesso ao conteúdo gravado e 3 meses de acompanhamento individual. Se o lead perguntar se o curso/conteúdo gravado vem junto, está incluso ou faz parte da Mentoria, responda isso diretamente e mantenha a Mentoria como oferta ativa.',
    '- Se o lead demonstrar interesse, pedir para conhecer ou perguntar como funciona o Curso Gravado, explique primeiro conteúdo, módulos, formato e diferença para a Mentoria. NÃO informe preço nesse momento.',
    '- Só informe R$ 997 quando o lead perguntar explicitamente por preço, valor, custo ou investimento do Curso Gravado, ou quando apresentar objeção financeira à Mentoria. A simples menção a "curso", "gravado" ou "conteúdo gravado" não autoriza revelar o preço.',
    "- Se houver objeção financeira, apresente imediatamente e com respeito o Curso Gravado por R$ 997; não repita o preço da Mentoria antes da alternativa.",
    "- Nunca repita a mesma pergunta sem acrescentar informação útil. Responda primeiro a dúvida específica do lead.",
    "=== FIM DO REFORÇO CONVERSACIONAL BULLINK ===\n",
  ].join("\n");
}
