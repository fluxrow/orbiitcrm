// Reconciliação de FALSO POSITIVO de entrega assíncrona da Z-API.
//
// Cenário comprovado: o sender síncrono recebe HTTP 2xx + messageId e marca
// outbox/mensagem/campanha como enviados. Segundos depois chega um callback
// `event=on-send`, `type=MessageStatusCallback`, com `payload.error` contendo
// "Phone number does not exist". Sem este tratamento o registro permanece
// "sent" para sempre — falso positivo silencioso.
//
// Regras invioláveis desta reconciliação:
//   • Estritamente tenant-scoped: o empresa_id vem SOMENTE do instanceId.
//   • Zero reenvio: não cria outbox, não faz retry, backfill ou reprocessamento.
//   • Transição única: só `sent` → `failed` (idempotente por status).
//   • `provider_message_id` é PRESERVADO como evidência.
//   • Cota diária NÃO é decrementada aqui — decrementar poderia reabrir espaço
//     na janela de warmup e liberar backlog automaticamente. A tentativa real
//     ocorreu no provedor e deve continuar contabilizada. Decisão deliberada.

/** Teto de IDs processados por callback — protege contra payload abusivo. */
export const MAX_PROVIDER_IDS = 25;

export const ASYNC_ERROR_PREFIX = "provider_async_error";

/** Erros assíncronos conhecidos → código canônico sanitizado (sem PII). */
const KNOWN_ASYNC_ERRORS: Array<{ re: RegExp; code: string }> = [
  { re: /phone\s*number\s*does\s*not\s*exist/i, code: "phone_number_does_not_exist" },
  { re: /number\s*does\s*not\s*exist/i, code: "phone_number_does_not_exist" },
  { re: /invalid\s*phone/i, code: "phone_number_does_not_exist" },
];

/** Códigos que invalidam o número do prospect. */
const INVALID_PHONE_CODES = new Set(["phone_number_does_not_exist"]);

/**
 * Extrai IDs do provedor de um callback Z-API a partir de `messageId`, `zaapId`
 * e `ids[]`. Normaliza (trim), remove vazios/não-string, deduplica preservando
 * ordem e limita a quantidade.
 */
export function extractProviderMessageIds(payload: unknown): string[] {
  const p = (payload ?? {}) as Record<string, unknown>;
  const raw: unknown[] = [p.messageId, p.zaapId, p.id];
  const ids = p.ids;
  if (Array.isArray(ids)) raw.push(...ids);

  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string" && typeof item !== "number") continue;
    const v = String(item).trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
    if (out.length >= MAX_PROVIDER_IDS) break;
  }
  return out;
}

export interface AsyncSendErrorClassification {
  /** Código canônico sem PII. */
  code: string;
  /** Valor pronto para `last_error` / `erro`. */
  sanitized: string;
  /** Se o número do prospect deve ser marcado inválido. */
  invalidPhone: boolean;
}

/** Extrai a string de erro do callback, tolerando formatos variados. */
function rawErrorText(payload: unknown): string {
  const p = (payload ?? {}) as Record<string, any>;
  const candidates = [p.error, p.message, p.errorMessage, p.statusReason, p.status];
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c;
    if (c && typeof c === "object") {
      const nested = c.message ?? c.error ?? c.description;
      if (typeof nested === "string" && nested.trim()) return nested;
    }
  }
  return "";
}

/**
 * Classifica o callback como erro assíncrono conhecido. Retorna `null` para
 * qualquer coisa que não seja um erro conhecido — nesse caso o fluxo legado
 * (early-return de status callback) permanece exatamente como hoje.
 */
export function classifyAsyncSendError(
  payload: unknown,
): AsyncSendErrorClassification | null {
  const text = rawErrorText(payload);
  if (!text) return null;
  for (const { re, code } of KNOWN_ASYNC_ERRORS) {
    if (re.test(text)) {
      return {
        code,
        sanitized: `${ASYNC_ERROR_PREFIX}: ${code}`,
        invalidPhone: INVALID_PHONE_CODES.has(code),
      };
    }
  }
  return null;
}

/** Decide se este callback deve acionar a reconciliação assíncrona. */
export function shouldReconcileAsyncError(args: {
  eventType: string;
  payload: unknown;
}): { reconcile: boolean; classification: AsyncSendErrorClassification | null; ids: string[] } {
  const classification = classifyAsyncSendError(args.payload);
  const ids = extractProviderMessageIds(args.payload);
  const isSendLike = args.eventType === "on-send" || args.eventType === "message-status";
  return {
    reconcile: isSendLike && !!classification && ids.length > 0,
    classification,
    ids,
  };
}

export interface AsyncReconcileResult {
  outbox_failed: number;
  mensagens_failed: number;
  recipients_failed: number;
  prospects_invalidated: number;
  campaigns_reconciled: number;
  already_reconciled: boolean;
}

/**
 * Aplica a reconciliação tenant-scoped. Nunca envia nada e nunca cria outbox.
 * Idempotente: a transição só ocorre quando a outbox ainda está `sent`.
 */
export async function reconcileAsyncSendError(
  supabase: any,
  args: {
    empresa_id: string;
    provider_message_ids: string[];
    classification: AsyncSendErrorClassification;
  },
): Promise<AsyncReconcileResult> {
  const result: AsyncReconcileResult = {
    outbox_failed: 0,
    mensagens_failed: 0,
    recipients_failed: 0,
    prospects_invalidated: 0,
    campaigns_reconciled: 0,
    already_reconciled: false,
  };
  const ids = args.provider_message_ids.slice(0, MAX_PROVIDER_IDS);
  if (!args.empresa_id || ids.length === 0) return result;

  const sanitized = args.classification.sanitized;
  const nowIso = new Date().toISOString();

  // 1) Outbox: transição única sent → failed, preservando provider_message_id.
  const { data: failedRows } = await supabase
    .from("orbit_whatsapp_outbox")
    .update({
      status: "failed",
      last_error: sanitized,
      sent_at: null,
      locked_at: null,
      locked_by: null,
      next_attempt_at: null,
      updated_at: nowIso,
    })
    .eq("empresa_id", args.empresa_id)
    .in("provider_message_id", ids)
    .eq("status", "sent")
    .select("id, source_type, campaign_id, prospect_id, conversa_id, provider_message_id");

  const rows = (failedRows ?? []) as any[];
  result.outbox_failed = rows.length;
  if (rows.length === 0) {
    // Callback duplicado (ou outro tenant): nada a fazer, sem efeito colateral.
    result.already_reconciled = true;
    return result;
  }

  // 2) Mensagem visual OUT correspondente.
  const { data: msgRows } = await supabase
    .from("orbit_mensagens")
    .update({ status: "falhou", erro: sanitized })
    .eq("empresa_id", args.empresa_id)
    .in("provider_message_id", ids)
    .eq("direcao", "OUT")
    .select("id");
  result.mensagens_failed = (msgRows ?? []).length;

  // 3) Campanha: exatamente o recipient campaign_id + prospect_id.
  const campaignIds = new Set<string>();
  for (const row of rows) {
    if (row.source_type === "campaign" && row.campaign_id && row.prospect_id) {
      const { data: recRows } = await supabase
        .from("orbit_campaign_recipients")
        .update({ status: "falhou", erro: sanitized })
        .eq("campaign_id", row.campaign_id)
        .eq("prospect_id", row.prospect_id)
        .neq("status", "falhou")
        .select("id");
      result.recipients_failed += (recRows ?? []).length;
      campaignIds.add(row.campaign_id);
    }
  }
  for (const campaignId of campaignIds) {
    try {
      await supabase.rpc("reconcile_campaign_counters", { _campaign_id: campaignId });
      result.campaigns_reconciled += 1;
    } catch (_e) {
      // Reconciliação de contadores é best-effort; nunca bloqueia o webhook.
    }
  }

  // 4) Prospect identificado: número inválido (sem alterar consentimento).
  if (args.classification.invalidPhone) {
    const prospectIds = Array.from(
      new Set(rows.map((r) => r.prospect_id).filter(Boolean)),
    ) as string[];
    if (prospectIds.length > 0) {
      const { data: prospRows } = await supabase
        .from("orbit_prospects")
        .update({ whatsapp_status: "invalido", whatsapp_last_check_at: nowIso })
        .eq("empresa_id", args.empresa_id)
        .in("id", prospectIds)
        .select("id");
      result.prospects_invalidated = (prospRows ?? []).length;
    }
  }

  return result;
}
