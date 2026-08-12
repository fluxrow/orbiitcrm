/**
 * Guard determinístico de estágio comercial.
 *
 * Objetivo: impedir avanço para preço/pagamento/fechamento sem que a mensagem
 * ATUAL do lead autorize esse avanço. Dados cadastrais isolados (e-mail,
 * telefone, nome) nunca são sinal comercial.
 *
 * Tenant-scoped: aplicado apenas quando
 * `orbit_ai_config.strict_commercial_stage_guard = true`.
 * Nunca aplicado a notificações internas.
 */

function deaccent(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function norm(s: string | null | undefined): string {
  return deaccent(String(s ?? "")).toLowerCase();
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

/** Saudações/polidez curtas admitidas junto com o dado cadastral. */
const COURTESY_RE = new RegExp(
  "\\b(?:" +
    "bom\\s+dia|boa\\s+tarde|boa\\s+noite|oi|ola|opa|eae|e\\s+ai|blz|beleza|" +
    "obrigado|obrigada|obg|vlw|valeu|por\\s+favor|pfv|pf|desculpa|desculpe|" +
    "meu|o|a|e|eh|esse|este|segue|ai|aqui|esta|ta|to|tou|estou|" +
    "email|e-?mail|endereco|eletronico|contato|nome|telefone|whats|whatsapp|zap|numero" +
    ")\\b",
  "g",
);

/** Telefone brasileiro simples (com ou sem máscara). */
const PHONE_RE = /(?:\+?55\s*)?(?:\(?\d{2}\)?[\s.-]*)?9?\d{4}[\s.-]?\d{4}/g;

/**
 * A mensagem do lead é composta APENAS por dado de contato
 * (e-mail e/ou telefone), admitindo saudação/polidez curta e pontuação.
 */
export function isInboundOnlyContactData(text: string | null | undefined): boolean {
  const raw = String(text ?? "").trim();
  if (!raw) return false;
  let n = norm(raw);
  const hasEmail = EMAIL_RE.test(raw);
  EMAIL_RE.lastIndex = 0;
  const hasPhone = PHONE_RE.test(raw);
  PHONE_RE.lastIndex = 0;
  if (!hasEmail && !hasPhone) return false;
  n = n.replace(EMAIL_RE, " ").replace(PHONE_RE, " ").replace(COURTESY_RE, " ");
  // Sobra apenas pontuação/espaços/dígitos residuais => é só dado de contato.
  const residual = n.replace(/[^a-z]/g, "").trim();
  return residual.length === 0;
}

/** O lead perguntou diretamente sobre preço/valor/condições. */
export function hasExplicitPricingIntent(text: string | null | undefined): boolean {
  const n = norm(text);
  if (!n) return false;
  const patterns: RegExp[] = [
    /\bquanto\s+(?:custa|fica|sai|e|eh|seria|ta|esta)\b/,
    /\bqual\s+(?:o\s+|e\s+o\s+|eh\s+o\s+)?(?:valor|preco|investimento|custo|ticket)\b/,
    /\b(?:valor|preco|precos|investimento|custo)\b/,
    /\bcondic(?:ao|oes)\b/,
    /\bparcel(?:a|as|ado|amento|ar)\b/,
    /\bdesconto\b/,
    /\bcabe\s+no\s+bolso\b/,
    /\be\s+caro\b|\beh\s+caro\b/,
    /\bquantas\s+vezes\b/,
    /\bno\s+cart(?:ao|ão)\b/,
    /\bpix\b/,
  ];
  return patterns.some((re) => re.test(n));
}

/** O lead manifestou intenção clara de fechar/comprar/se inscrever. */
export function hasExplicitClosingIntent(text: string | null | undefined): boolean {
  const n = norm(text);
  if (!n) return false;
  const patterns: RegExp[] = [
    /\bquero\s+(?:fechar|comprar|entrar|participar|assinar|come[cç]ar|garantir|me\s+inscrever)\b/,
    /\bvamos\s+fechar\b/,
    /\bfechado\b/,
    /\bbora\b.{0,15}\b(?:fechar|come[cç]ar)\b/,
    /\bpode\s+(?:gerar|mandar|enviar)\s+(?:o\s+)?(?:pedido|link|pagamento)\b/,
    /\bcomo\s+(?:eu\s+)?(?:fa[cç]o\s+para\s+)?(?:pagar|pago|pagamento)\b/,
    /\bcomo\s+(?:eu\s+)?(?:fa[cç]o\s+para\s+)?(?:me\s+)?inscrev\w*\b/,
    /\bcomo\s+(?:eu\s+)?entro\b/,
    /\bquero\s+contratar\b/,
    /\bme\s+manda\s+o\s+link\b/,
    /\bmanda\s+(?:a\s+)?(?:chave|link)\b/,
    /\bonde\s+(?:eu\s+)?pago\b/,
  ];
  return patterns.some((re) => re.test(n));
}

/** A resposta do agente avança para preço/pagamento/fechamento. */
const COMMERCIAL_SENTENCE_PATTERNS: RegExp[] = [
  /r\$\s*\d/,
  /\bcusta\b|\bcustam\b/,
  /\bpre[cç]o\b|\bvalor(?:es)?\b/,
  /\binvestimento\b/,
  /\bpix\b/,
  /\bcart(?:ao|ão)\b/,
  /\bparcel\w+\b/,
  /\b\d{1,2}\s*x\s*(?:de\s*)?r?\$?\s*\d/,
  /\bhttps?:\/\/\S*(?:pay|payment|checkout)\S*/,
  /\binscri[cç]\w+\b/,
  /\bfechar\b|\bfechamento\b/,
  /\ba\s+vista\b|\bà\s+vista\b/,
  /\bchave\s+pix\b/,
];

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function isCommercialSentence(sentence: string): boolean {
  const n = norm(sentence);
  return COMMERCIAL_SENTENCE_PATTERNS.some((re) => re.test(n));
}

export function hasCommercialAdvance(text: string | null | undefined): boolean {
  const raw = String(text ?? "");
  if (!raw.trim()) return false;
  return splitSentences(raw).some(isCommercialSentence);
}

export interface CommercialStageVerdict {
  violates: boolean;
  reason: "inbound_only_contact_data" | "no_commercial_intent" | null;
  inboundOnlyContactData: boolean;
  pricingIntent: boolean;
  closingIntent: boolean;
}

/**
 * Avalia a resposta do agente contra a mensagem ATUAL do lead.
 * Histórico e dados cadastrais nunca autorizam o avanço.
 */
export function evaluateCommercialStage(
  inbound: string | null | undefined,
  resposta: string | null | undefined,
): CommercialStageVerdict {
  const onlyContact = isInboundOnlyContactData(inbound);
  const pricing = onlyContact ? false : hasExplicitPricingIntent(inbound);
  const closing = onlyContact ? false : hasExplicitClosingIntent(inbound);
  const advances = hasCommercialAdvance(resposta);

  let reason: CommercialStageVerdict["reason"] = null;
  if (advances && onlyContact) reason = "inbound_only_contact_data";
  else if (advances && !pricing && !closing) reason = "no_commercial_intent";

  return {
    violates: reason !== null,
    reason,
    inboundOnlyContactData: onlyContact,
    pricingIntent: pricing,
    closingIntent: closing,
  };
}

/** Remove SOMENTE as sentenças comerciais, preservando o resto. */
export function sanitizeCommercialAdvance(text: string | null | undefined): string {
  const raw = String(text ?? "");
  if (!raw.trim()) return "";
  return splitSentences(raw)
    .filter((s) => !isCommercialSentence(s))
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export const COMMERCIAL_GUARD_FALLBACK =
  "Perfeito. Seguimos por aqui mesmo no WhatsApp. Qual é a principal dúvida que você quer resolver agora?";

export const COMMERCIAL_GUARD_CORRECTIVE_CONTACT_ONLY =
  "VIOLAÇÃO: a última mensagem do lead contém apenas um dado de contato (e-mail/telefone) e não é sinal comercial, " +
  "aceite, intenção de compra ou pedido de preço. É proibido citar valor, preço, investimento, PIX, cartão, " +
  "parcelamento, link de pagamento, inscrição ou fechamento nesta resposta. Reconheça sem repetir o endereço " +
  "(\"Perfeito. Seguimos por aqui mesmo no WhatsApp.\") e retome a conversa de forma consultiva com uma pergunta " +
  "neutra e contextual. Máximo de 3 frases curtas e uma única pergunta.";

export const COMMERCIAL_GUARD_CORRECTIVE_NO_INTENT =
  "VIOLAÇÃO: o lead não perguntou preço/valor/condições nem manifestou intenção clara de fechar, comprar ou se " +
  "inscrever nesta mensagem. É proibido citar valor, preço, investimento, PIX, cartão, parcelamento, link de " +
  "pagamento, inscrição ou fechamento. Responda exatamente o que ele perguntou, de forma consultiva, em 1 a 3 " +
  "frases curtas, com no máximo uma pergunta curta.";

export function buildCommercialCorrective(verdict: CommercialStageVerdict): string {
  return verdict.reason === "inbound_only_contact_data"
    ? COMMERCIAL_GUARD_CORRECTIVE_CONTACT_ONLY
    : COMMERCIAL_GUARD_CORRECTIVE_NO_INTENT;
}

/** Aplica a trava de forma determinística. `applyGuard=false` => texto intacto. */
export function enforceCommercialStage(
  inbound: string | null | undefined,
  resposta: string,
  applyGuard: boolean,
): { text: string; changed: boolean; fallbackUsed: boolean; verdict: CommercialStageVerdict } {
  const verdict = evaluateCommercialStage(inbound, resposta);
  if (!applyGuard || !verdict.violates) {
    return { text: resposta, changed: false, fallbackUsed: false, verdict };
  }
  const sanitized = sanitizeCommercialAdvance(resposta);
  if (!sanitized) {
    return { text: COMMERCIAL_GUARD_FALLBACK, changed: true, fallbackUsed: true, verdict };
  }
  return { text: sanitized, changed: true, fallbackUsed: false, verdict };
}
