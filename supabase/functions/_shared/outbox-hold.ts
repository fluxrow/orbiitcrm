// Hold explícito de envio + espaçamento por recovery na fila global de WhatSApp.
//
// Contrato (determinístico, puro, testável):
//  - `metadata.outbox_hold_until` (ISO) é AUTORIDADE sobre `scheduled_for`.
//  - Timestamp FUTURO  → item nunca sai; permanece pending, sem incrementar
//    attempts e sem qualquer chamada externa.
//  - Timestamp EXATAMENTE igual a agora (ou passado) → libera.
//  - Valor ausente/inválido → comportamento LEGADO (sem gate de hold).
//  - `metadata.recovery_tag` + espaçamento mínimo: o próximo item de uma mesma
//    recovery só sai quando `now >= max(hold_until, último sent_at + spacing)`.
//
// Nenhuma regra aqui altera warmup/daily_limit nem afeta itens sem hold/recovery.

export const OUTBOX_HOLD_REASON = "outbox_hold_active";
export const RECOVERY_SPACING_REASON = "recovery_spacing_active";
export const DEFAULT_RECOVERY_SPACING_SECONDS = 180;

/** Lê metadata.outbox_hold_until. Retorna ms epoch ou null quando ausente/inválido. */
export function parseHoldUntilMs(metadata: unknown): number | null {
  const raw = (metadata as any)?.outbox_hold_until;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const ms = Date.parse(trimmed);
  return Number.isFinite(ms) ? ms : null;
}

/** Tag de recovery normalizada (ou null). */
export function recoveryTagOf(metadata: unknown): string | null {
  const raw = (metadata as any)?.recovery_tag;
  if (typeof raw !== "string") return null;
  const t = raw.trim();
  return /^[a-z0-9][a-z0-9_-]{2,63}$/i.test(t) ? t : null;
}

export interface HoldGateInput {
  metadata: unknown;
  nowMs: number;
  /** sent_at (ms) do último item JÁ ENVIADO desta recovery no tenant, se houver. */
  lastRecoverySentAtMs?: number | null;
  spacingSeconds?: number;
}

export interface HoldGateVerdict {
  allowed: boolean;
  reason: string | null;
  /** Quando bloqueado: instante em que o item pode ser reavaliado (ISO). */
  retryAtIso: string | null;
  holdUntilMs: number | null;
  recoveryTag: string | null;
}

/**
 * Gate único usado antes do claim e revalidado depois do claim.
 * Bloqueia sem efeito colateral: quem chama devolve o item a pending.
 */
export function evaluateHoldGate(input: HoldGateInput): HoldGateVerdict {
  const holdUntilMs = parseHoldUntilMs(input.metadata);
  const recoveryTag = recoveryTagOf(input.metadata);
  const spacingMs = Math.max(0, Number(input.spacingSeconds ?? DEFAULT_RECOVERY_SPACING_SECONDS)) * 1000;

  // 1) Hold explícito: futuro estrito bloqueia; igual/passado libera.
  if (holdUntilMs !== null && holdUntilMs > input.nowMs) {
    return {
      allowed: false,
      reason: OUTBOX_HOLD_REASON,
      retryAtIso: new Date(holdUntilMs).toISOString(),
      holdUntilMs,
      recoveryTag,
    };
  }

  // 2) Espaçamento absoluto por tenant/recovery (só quando há tag e envio anterior).
  const last = Number(input.lastRecoverySentAtMs ?? NaN);
  if (recoveryTag && Number.isFinite(last) && spacingMs > 0) {
    const earliest = last + spacingMs;
    if (input.nowMs < earliest) {
      return {
        allowed: false,
        reason: RECOVERY_SPACING_REASON,
        retryAtIso: new Date(earliest).toISOString(),
        holdUntilMs,
        recoveryTag,
      };
    }
  }

  return { allowed: true, reason: null, retryAtIso: null, holdUntilMs, recoveryTag };
}

/** OUT que nunca saiu de verdade não conta como resposta entregue. */
export const NON_DELIVERED_OUT_STATUSES = new Set([
  "queued",
  "cancelada",
  "canceled",
  "falhou",
  "failed",
  "pendente",
  "processing",
]);

export function isDeliveredOutStatus(status: unknown): boolean {
  return !NON_DELIVERED_OUT_STATUSES.has(String(status ?? "").toLowerCase());
}

/** sent_at (ms) do último item enviado da recovery no tenant. */
export async function lastRecoverySentAtMs(
  supabase: any,
  empresa_id: string,
  recoveryTag: string,
): Promise<number | null> {
  const { data } = await supabase
    .from("orbit_whatsapp_outbox")
    .select("sent_at")
    .eq("empresa_id", empresa_id)
    .eq("metadata->>recovery_tag", recoveryTag)
    .eq("status", "sent")
    .not("sent_at", "is", null)
    .order("sent_at", { ascending: false })
    .limit(1);
  const iso = (data ?? [])[0]?.sent_at;
  if (!iso) return null;
  const ms = Date.parse(String(iso));
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Revalida o alvo de uma recovery imediatamente antes do envio:
 * o inbound precisa continuar sendo a última IN da conversa e não pode existir
 * OUT REALMENTE entregue depois dele.
 */
export async function revalidateRecoveryTarget(
  supabase: any,
  item: { conversa_id?: string | null; metadata?: any },
): Promise<{ valid: boolean; reason: string | null }> {
  const tag = recoveryTagOf(item.metadata);
  if (!tag) return { valid: true, reason: null };
  const conversaId = item.conversa_id;
  // inbound_message_id pode vir sufixado pelo produtor (ex: "<uuid>:text").
  const rawInbound = item.metadata?.inbound_message_id ?? null;
  const inboundId = typeof rawInbound === "string" ? rawInbound.split(":")[0].trim() || null : null;
  if (!conversaId || !inboundId) return { valid: false, reason: "recovery_target_missing" };

  const { data: inbound } = await supabase
    .from("orbit_mensagens")
    .select("id, timestamp")
    .eq("id", inboundId)
    .eq("conversa_id", conversaId)
    .maybeSingle();
  if (!inbound?.timestamp) return { valid: false, reason: "recovery_inbound_not_found" };

  const { data: after } = await supabase
    .from("orbit_mensagens")
    .select("id, direcao, status")
    .eq("conversa_id", conversaId)
    .gt("timestamp", inbound.timestamp);

  const rows = (after ?? []) as any[];
  if (rows.some((r) => r.direcao === "IN")) {
    return { valid: false, reason: "recovery_newer_inbound" };
  }
  if (rows.some((r) => r.direcao === "OUT" && isDeliveredOutStatus(r.status))) {
    return { valid: false, reason: "recovery_already_answered" };
  }
  return { valid: true, reason: null };
}
