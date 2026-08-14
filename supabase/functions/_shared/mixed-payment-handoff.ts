/**
 * PAGAMENTO MISTO (PIX + CARTÃO) — handler determinístico tenant-scoped.
 *
 * Caso real (Bullink): o lead pediu "dar 1000 no PIX e parcelar o restante no
 * cartão" e o agente NEGOU a possibilidade, repetindo as condições fixas.
 * A regra comercial aprovada por Fernando é: SIM, é possível combinar uma parte
 * no PIX e o restante no cartão — mas quem define entrada, número de parcelas,
 * desconto ou link é o próprio Fernando, nunca o agente.
 *
 * Fluxo 100% determinístico (sem LLM), agora POR ETAPAS e recuperável:
 *   1. claim   -> claimed_at (idempotente por conversa/inbound)
 *   2. enqueue -> confirmation_outbox_id / confirmation_enqueued_at
 *   3. posse   -> human_talk_set_at (somente APÓS a confirmação durável)
 *   4. aviso   -> notification_sent_at (nunca marcado antes do sucesso)
 *
 * Nenhuma etapa marca sucesso antecipadamente: em retry, o próximo passo é
 * derivado do estado persistido, sem duplicar confirmação nem notificação.
 *
 * Tenant-scoped: só roda quando `orbit_ai_config.mixed_payment_handoff.enabled = true`.
 * Coluna NULL/false preserva os demais tenants byte-for-byte.
 */

export interface MixedPaymentHandoffConfig {
  enabled: boolean;
  /** Confirmação única enviada ao lead. Curta, sem condições inventadas. */
  confirmation_message: string;
}

/** Origem dedicada no outbox: autorizada a concluir mesmo com human_talk=true. */
export const MIXED_PAYMENT_CONFIRMATION_SOURCE = "mixed_payment_confirmation" as const;

export const MIXED_PAYMENT_DEFAULT_CONFIRMATION =
  "Sim, dá pra fazer assim: uma parte no PIX e o restante no cartão. " +
  "Vou organizar os detalhes e sigo com você por aqui.";

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

function normalize(text: string | null | undefined): string {
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
  /** Existe algum claim persistido (v1 legado ou v2 por etapas). */
  claimed: boolean;
  claimed_at: string | null;
  inbound_id: string | null;
  confirmation_outbox_id: string | null;
  confirmation_enqueued_at: string | null;
  human_talk_set_at: string | null;
  notification_sent_at: string | null;
  /** Ciclo completo: confirmação durável + posse humana + aviso enviado. */
  handled: boolean;
  /** Compat: primeiro instante conhecido do handoff. */
  at: string | null;
}

const EMPTY_STATE: MixedPaymentState = {
  claimed: false,
  claimed_at: null,
  inbound_id: null,
  confirmation_outbox_id: null,
  confirmation_enqueued_at: null,
  human_talk_set_at: null,
  notification_sent_at: null,
  handled: false,
  at: null,
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

/** Estado persistido em `orbit_conversas.ai_contexto.mixed_payment_handoff`. */
export function readMixedPaymentState(
  aiContexto: Record<string, unknown> | null | undefined,
): MixedPaymentState {
  const raw = (aiContexto as any)?.mixed_payment_handoff;
  if (!raw || typeof raw !== "object") return { ...EMPTY_STATE };

  // v1 legado: { handled: true, notified: true, at } — ciclo já encerrado.
  const legacyHandled = (raw as any).handled === true && (raw as any).version === undefined;
  const at = str((raw as any).at);
  const claimed_at = str((raw as any).claimed_at) ?? at;
  const confirmation_enqueued_at = str((raw as any).confirmation_enqueued_at) ?? (legacyHandled ? at : null);
  const human_talk_set_at = str((raw as any).human_talk_set_at) ?? (legacyHandled ? at : null);
  const notification_sent_at =
    str((raw as any).notification_sent_at) ?? (legacyHandled && (raw as any).notified === true ? at : null);

  return {
    claimed: true,
    claimed_at,
    inbound_id: str((raw as any).inbound_id),
    confirmation_outbox_id: str((raw as any).confirmation_outbox_id),
    confirmation_enqueued_at,
    human_talk_set_at,
    notification_sent_at,
    handled: !!(confirmation_enqueued_at && human_talk_set_at && notification_sent_at),
    at,
  };
}

/** Claim inicial: SÓ marca o início. Nada de confirmação/posse/aviso aqui. */
export function buildMixedPaymentClaim(
  inboundId: string | null | undefined,
  now = new Date(),
): Record<string, unknown> {
  return {
    version: 2,
    source: "mixed_payment_handoff",
    inbound_id: str(inboundId),
    claimed_at: now.toISOString(),
    at: now.toISOString(),
    confirmation_outbox_id: null,
    confirmation_enqueued_at: null,
    human_talk_set_at: null,
    notification_sent_at: null,
  };
}

/** Merge incremental do estado persistido (nunca apaga etapa já concluída). */
export function mergeMixedPaymentState(
  aiContexto: Record<string, unknown> | null | undefined,
  patch: Record<string, string | null | undefined>,

): Record<string, unknown> {
  const prev = (aiContexto as any)?.mixed_payment_handoff;
  const base: Record<string, unknown> =
    prev && typeof prev === "object" ? { ...(prev as Record<string, unknown>) } : buildMixedPaymentClaim(null);
  base.version = 2;
  base.source = "mixed_payment_handoff";
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined) continue;
    if (base[k]) continue; // etapa já concluída: idempotente
    base[k] = v;
  }
  return base;
}

export type MixedPaymentNextStep =
  | "enqueue_confirmation"
  | "set_human_talk"
  | "notify"
  | "done";

/**
 * Próximo passo determinístico a partir do estado persistido.
 * Ordem: confirmação durável -> posse humana -> notificação interna.
 */
export function decideMixedPaymentNextStep(state: MixedPaymentState): MixedPaymentNextStep {
  if (!state.confirmation_enqueued_at) return "enqueue_confirmation";
  if (!state.human_talk_set_at) return "set_human_talk";
  if (!state.notification_sent_at) return "notify";
  return "done";
}

/**
 * Identidade da ÚNICA confirmação no outbox.
 * Formato: mixed_payment_confirmation|<empresa>|<conversa>|<inbound>
 * (mesma chave gerada por stableKey() em orbit-whatsapp-outbox.ts).
 */
export function mixedPaymentIdempotencyKey(
  empresaId: string,
  conversaId: string,
  inboundId: string | null | undefined,
): string {
  return [MIXED_PAYMENT_CONFIRMATION_SOURCE, empresaId, conversaId, str(inboundId) ?? "-"].join("|");
}

/** Resumo interno para Fernando: objetivo, sem condições nem dados extras. */
export const MIXED_PAYMENT_NOTIFICATION_SUMMARY =
  "Lead pediu pagamento misto: parte no PIX e restante no cartão. Aguardando você definir as condições.";
