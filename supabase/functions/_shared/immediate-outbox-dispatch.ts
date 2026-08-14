/**
 * Kick imediato do worker do outbox (tenant-scoped, default OFF).
 *
 * Problema real: após o debounce de 20s o `orbit-ai-agent` enfileira a resposta
 * corretamente, mas quem envia é o cron por minuto do
 * `orbit-whatsapp-outbox-tick` — o que empurra a latência para 65–91s e estoura
 * o SLA de 60s.
 *
 * Solução: quando `orbit_ai_config.ai_reply_debounce.immediate_outbox_dispatch`
 * é `true`, o produtor invoca o PRÓPRIO worker no modo dirigido
 * (`{ outbox_id, empresa_id }`) logo após o enqueue. Nenhum caminho alternativo
 * de envio é criado: todos os gates (eligibility, human_talk, idempotência,
 * max_per_minute, engaged reserve, warm-up/cotas, prioridade, kill switch,
 * auditoria, mídia) continuam sendo aplicados pelo worker.
 *
 * Sem a flag, nada muda: o item fica `pending` e o cron normal assume.
 * Este módulo é puro (a decisão) + um único helper de I/O (o kick), ambos
 * testáveis com stubs e sem nenhuma chamada Z-API.
 */

export const IMMEDIATE_DISPATCH_SOURCES = new Set(["ai_reply"]);
export const IMMEDIATE_DISPATCH_PAYLOAD_TYPES = new Set(["text"]);

/** Lê a flag tenant-scoped. Ausente/inválida => false (legado). */
export function readImmediateOutboxDispatchFlag(
  aiConfig: Record<string, unknown> | null | undefined,
): boolean {
  const raw = (aiConfig as any)?.ai_reply_debounce;
  if (!raw || typeof raw !== "object") return false;
  return raw.immediate_outbox_dispatch === true;
}

export type KickSkipReason =
  | "flag_off"
  | "source_not_eligible"
  | "payload_not_eligible"
  | "not_enqueued"
  | "missing_outbox_id"
  | "hold_until_future"
  | "scheduled_for_future";

export type KickDecision =
  | { kick: true; outboxId: string }
  | { kick: false; reason: KickSkipReason };

export interface KickDecisionInput {
  flagEnabled: boolean;
  sourceType: string | null | undefined;
  payloadType: string | null | undefined;
  /** Resultado do enqueueOutbox. */
  routed: { enqueued?: boolean; outbox_id?: string | null; reason?: string | null } | null | undefined;
  holdUntil?: string | null;
  scheduledFor?: string | null;
  nowMs?: number;
}

function isFuture(value: string | null | undefined, nowMs: number): boolean {
  if (typeof value !== "string" || !value.trim()) return false;
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return false;
  return ms > nowMs;
}

/** Decide de forma determinística se o kick dirigido deve acontecer. */
export function decideImmediateKick(input: KickDecisionInput): KickDecision {
  const nowMs = input.nowMs ?? Date.now();
  if (!input.flagEnabled) return { kick: false, reason: "flag_off" };
  if (!IMMEDIATE_DISPATCH_SOURCES.has(String(input.sourceType ?? ""))) {
    return { kick: false, reason: "source_not_eligible" };
  }
  if (!IMMEDIATE_DISPATCH_PAYLOAD_TYPES.has(String(input.payloadType ?? ""))) {
    return { kick: false, reason: "payload_not_eligible" };
  }
  if (input.routed?.enqueued !== true) return { kick: false, reason: "not_enqueued" };
  const outboxId = input.routed?.outbox_id;
  if (typeof outboxId !== "string" || outboxId.length < 8) {
    return { kick: false, reason: "missing_outbox_id" };
  }
  if (isFuture(input.holdUntil, nowMs)) return { kick: false, reason: "hold_until_future" };
  if (isFuture(input.scheduledFor, nowMs)) return { kick: false, reason: "scheduled_for_future" };
  return { kick: true, outboxId };
}

export interface KickResult {
  attempted: boolean;
  ok: boolean;
  status?: number;
  error?: string;
}

export interface KickDeps {
  functionsBase: string;
  cronToken: string | null | undefined;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Invoca o worker no modo dirigido. Fail-safe: qualquer erro/timeout apenas
 * retorna ok=false — o item permanece `pending` para o cron normal, sem
 * duplicar envio e sem marcar `sent`.
 */
export async function kickOutboxDispatch(
  args: { outboxId: string; empresaId: string },
  deps: KickDeps,
): Promise<KickResult> {
  if (!deps.cronToken) return { attempted: false, ok: false, error: "missing_cron_token" };
  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? 8_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetchImpl(`${deps.functionsBase}/orbit-whatsapp-outbox-tick`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${deps.cronToken}`,
      },
      body: JSON.stringify({ outbox_id: args.outboxId, empresa_id: args.empresaId }),
      signal: controller.signal,
    });
    return { attempted: true, ok: resp.ok, status: resp.status };
  } catch (e) {
    return { attempted: true, ok: false, error: String((e as any)?.message ?? e) };
  } finally {
    clearTimeout(timer);
  }
}
