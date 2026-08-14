/**
 * PAGAMENTO MISTO (PIX + CARTÃO) — handler determinístico tenant-scoped.
 *
 * Caso real (Bullink): o lead pediu "dar 1000 no PIX e parcelar o restante no
 * cartão" e o agente NEGOU a possibilidade, repetindo as condições fixas.
 * A regra comercial aprovada por Fernando é: SIM, é possível combinar uma parte
 * no PIX e o restante no cartão — mas quem define entrada, número de parcelas,
 * desconto ou link é o próprio Fernando, nunca o agente.
 *
 * Por isso o fluxo é 100% determinístico (sem LLM):
 *   1. detecta o pedido de pagamento dividido/misto;
 *   2. envia UMA única confirmação curta;
 *   3. encerra a atuação automática (human_talk = true, "aguardando Fernando");
 *   4. notifica Fernando pelo resolvedor tenant-scoped já existente.
 *
 * Tenant-scoped: só roda quando `orbit_ai_config.mixed_payment_handoff.enabled = true`.
 * Coluna NULL/false preserva os demais tenants byte-for-byte.
 */

export interface MixedPaymentHandoffConfig {
  enabled: boolean;
  /** Confirmação única enviada ao lead. Curta, sem condições inventadas. */
  confirmation_message: string;
}

export const MIXED_PAYMENT_DEFAULT_CONFIRMATION =
  "Sim, dá pra fazer assim: uma parte no PIX e o restante no cartão. " +
  "Te chamo aqui mesmo para combinarmos os detalhes.";

/** Lê a config tenant-scoped. Retorna null quando a feature não está ligada. */
export function readMixedPaymentHandoffConfig(
  aiConfig: Record<string, unknown> | null | undefined,
): MixedPaymentHandoffConfig | null {
  const raw = (aiConfig as any)?.mixed_payment_handoff;
  if (!raw || typeof raw !== "object") return null;
  if ((raw as any).enabled !== true) return null;
  const msg = String((raw as any).confirmation_message ?? "").trim();
  return {
    enabled: true,
    confirmation_message: msg || MIXED_PAYMENT_DEFAULT_CONFIRMATION,
  };
}

function normalize(text: string): string {
  return String(text ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

const RE_PIX = /\bpix\b/;
const RE_CARD = /\bcart(?:ao|oes)\b|\bcredito\b/;
const RE_INSTALLMENT = /\bparcel\w*|\bparcelad\w*|\b\d{1,2}\s*x\b|\bvezes\b/;

/** Sinais de divisão do valor entre dois meios de pagamento. */
const SPLIT_CUES: RegExp[] = [
  /\buma?\s+parte\b/,
  /\bparte\s+(?:no|em|via|pelo|de)\b/,
  /\bmetade\b/,
  /\bentrada\b/,
  /\bsinal\b/,
  /\bdividir\b|\bdividido\b|\bdivid\w*\s+(?:o\s+)?(?:valor|pagamento)\b/,
  /\brestante\b/,
  /\bo\s+resto\b/,
  /\bsaldo\b/,
  /\bmisto\b|\bmista\b/,
  /\bcombinar\s+(?:o\s+)?(?:pagamento|pix|cartao)\b/,
  /\bjuntar\s+(?:pix|cartao)\b/,
  /\bd(?:ar|ou)\s+\d[\d.,]*\s+(?:reais\s+)?(?:no|via|em|pelo)\s+pix\b/,
  /\b\d[\d.,]*\s+(?:no|via|em|pelo)\s+pix\b/,
];

/**
 * Pedido explícito ou inequívoco de pagamento dividido: parte no PIX + restante
 * no cartão / parcelado. Alternativa simples ("PIX ou cartão?") NÃO conta.
 */
export function detectMixedPaymentRequest(inbound: string | null | undefined): boolean {
  const t = normalize(inbound);
  if (!t.trim()) return false;
  if (!RE_PIX.test(t)) return false;
  const hasCardSide = RE_CARD.test(t) || RE_INSTALLMENT.test(t);
  if (!hasCardSide) return false;
  return SPLIT_CUES.some((re) => re.test(t));
}

export interface MixedPaymentState {
  handled: boolean;
  at: string | null;
}

/** Estado persistido em `orbit_conversas.ai_contexto.mixed_payment_handoff`. */
export function readMixedPaymentState(
  aiContexto: Record<string, unknown> | null | undefined,
): MixedPaymentState {
  const raw = (aiContexto as any)?.mixed_payment_handoff;
  if (!raw || typeof raw !== "object") return { handled: false, at: null };
  return {
    handled: (raw as any).handled === true,
    at: typeof (raw as any).at === "string" ? (raw as any).at : null,
  };
}

/** Marca o handoff de pagamento misto (idempotente por conversa). */
export function buildMixedPaymentState(now = new Date()): Record<string, unknown> {
  return { handled: true, at: now.toISOString(), notified: true, source: "mixed_payment_handoff" };
}

/** Resumo interno para Fernando: objetivo, sem condições nem dados extras. */
export const MIXED_PAYMENT_NOTIFICATION_SUMMARY =
  "Lead pediu pagamento misto: parte no PIX e restante no cartão. Aguardando você definir as condições.";
