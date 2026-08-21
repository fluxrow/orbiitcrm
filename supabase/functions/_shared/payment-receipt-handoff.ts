/**
 * Handoff determinístico após comprovante de pagamento.
 *
 * Opt-in estrito por tenant em:
 *   orbit_ai_config.mixed_payment_handoff.receipt_handoff.enabled = true
 *
 * Um link de cobrança não é comprovante. A detecção só aceita evidência forte:
 * recibo InfinitePay, confirmação textual inequívoca ou imagem cujo texto
 * extraído descreva um comprovante/transação concluída.
 */

export interface PaymentReceiptHandoffConfig {
  enabled: boolean;
  target_stage_name: string;
}

export interface ReceiptCandidate {
  id?: string | null;
  mensagem?: string | null;
  media_extracted_text?: string | null;
  tipo_midia?: string | null;
}

export interface PaymentReceiptEvidence {
  detected: boolean;
  inbound_id: string | null;
  kind: "receipt_url" | "explicit_text" | "image_receipt" | null;
}

const RECEIPT_URL = /https?:\/\/recibo\.infinitepay\.io\/[a-z0-9-]+/i;
const EXPLICIT_RECEIPT = [
  /\b(?:segue|envio|enviei|mandei|est[aá]\s+a[ií])\b.{0,35}\b(?:comprovante|recibo)\b/i,
  /\bcomprovante\s+(?:de\s+pagamento|do\s+pix|no\s+valor)\b/i,
  /\bpagamento\s+(?:feito|realizado|conclu[ií]do|confirmado|aprovado)\b/i,
  /\bpix\s+(?:feito|realizado|conclu[ií]do|enviado|pago)\b/i,
];

const RECEIPT_DOCUMENT = /\b(?:comprovante|recibo)\b/i;
const PAYMENT_CONTEXT = /\b(?:pix|pagamento|transa[cç][aã]o|transfer[eê]ncia|valor)\b/i;
const COMPLETED_CONTEXT = /\b(?:aprovad[oa]|conclu[ií]d[oa]|realizad[oa]|efetivad[oa]|recebid[oa]|sucesso)\b/i;

export function readPaymentReceiptHandoffConfig(
  aiConfig: Record<string, unknown> | null | undefined,
): PaymentReceiptHandoffConfig | null {
  const raw = (aiConfig as any)?.mixed_payment_handoff?.receipt_handoff;
  if (!raw || raw.enabled !== true) return null;
  const stage = String(raw.target_stage_name || "Negociação").trim();
  return { enabled: true, target_stage_name: stage || "Negociação" };
}

export function detectPaymentReceipt(candidates: ReceiptCandidate[]): PaymentReceiptEvidence {
  for (let i = candidates.length - 1; i >= 0; i -= 1) {
    const candidate = candidates[i] || {};
    const text = String(candidate.mensagem || "").trim();
    const extracted = String(candidate.media_extracted_text || "").trim();

    if (RECEIPT_URL.test(text)) {
      return { detected: true, inbound_id: candidate.id || null, kind: "receipt_url" };
    }
    if (EXPLICIT_RECEIPT.some((pattern) => pattern.test(text))) {
      return { detected: true, inbound_id: candidate.id || null, kind: "explicit_text" };
    }

    const isImage = String(candidate.tipo_midia || "").toLowerCase() === "image";
    if (
      isImage && extracted && RECEIPT_DOCUMENT.test(extracted) &&
      PAYMENT_CONTEXT.test(extracted) &&
      (COMPLETED_CONTEXT.test(extracted) || /\bcomprovante\s+(?:pix|de\s+pagamento)\b/i.test(extracted))
    ) {
      return { detected: true, inbound_id: candidate.id || null, kind: "image_receipt" };
    }
  }
  return { detected: false, inbound_id: null, kind: null };
}

export function buildPaymentReceiptClaim(inboundId: string | null, kind: string | null) {
  return {
    version: 1,
    source: "payment_receipt_handoff",
    inbound_id: inboundId,
    evidence_kind: kind,
    claimed_at: new Date().toISOString(),
    deal_id: null,
    human_talk_set_at: null,
    notification_sent_at: null,
  };
}

export const PAYMENT_RECEIPT_NOTIFICATION_SUMMARY =
  "Comprovante de pagamento recebido. A conversa foi pausada para validação e continuidade humana.";
