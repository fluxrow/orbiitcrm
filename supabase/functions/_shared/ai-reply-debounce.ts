/**
 * Debounce de resposta ativa + SLA de entrega (tenant-scoped, puro).
 *
 * Problema real: o lead escreve 2 a 4 mensagens curtas em sequência e o agente
 * responde a cada uma, quebrando o ritmo e gastando turnos. A solução é esperar
 * um intervalo curto após a ÚLTIMA inbound e gerar UMA resposta com todo o lote.
 *
 * Ativado SOMENTE quando `orbit_ai_config.ai_reply_debounce.enabled = true`.
 * Sem a flag, o caminho legado (chamada imediata do agente) permanece
 * byte-for-behavior idêntico.
 *
 * Este módulo é puro: nenhuma I/O, nenhuma PII. Toda a decisão de disparo,
 * invalidação de job stale e verdito de SLA é testável isoladamente.
 */

export const DEFAULT_DEBOUNCE_WAIT_MS = 20_000;
export const DEFAULT_REPLY_SLA_MS = 60_000;
/** Margem para o tick de recuperação assumir jobs que o runtime perdeu. */
export const DEBOUNCE_RECOVERY_GRACE_MS = 15_000;

export interface DebounceConfig {
  enabled: boolean;
  waitMs: number;
  slaMs: number;
}

export function readDebounceConfig(
  aiConfig: Record<string, unknown> | null | undefined,
): DebounceConfig | null {
  const raw = (aiConfig as any)?.ai_reply_debounce;
  if (!raw || typeof raw !== "object" || raw.enabled !== true) return null;
  const num = (v: unknown, fallback: number, min: number, max: number): number => {
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
  };
  return {
    enabled: true,
    waitMs: num(raw.wait_ms, DEFAULT_DEBOUNCE_WAIT_MS, 1_000, 120_000),
    slaMs: num(raw.sla_ms, DEFAULT_REPLY_SLA_MS, 5_000, 600_000),
  };
}

/** Instante em que o lote pode ser gerado (janela reinicia a cada inbound). */
export function computeFireAfter(lastInboundAt: string | Date, waitMs: number): string {
  const base = lastInboundAt instanceof Date ? lastInboundAt.getTime() : Date.parse(String(lastInboundAt));
  const at = Number.isNaN(base) ? Date.now() : base;
  return new Date(at + waitMs).toISOString();
}

export function msUntil(fireAfter: string | Date, now: Date = new Date()): number {
  const at = fireAfter instanceof Date ? fireAfter.getTime() : Date.parse(String(fireAfter));
  if (Number.isNaN(at)) return 0;
  return Math.max(0, at - now.getTime());
}

export interface DebounceRow {
  /** Token do job mais recente. Só ele tem direito de gerar a resposta. */
  claim_token: string;
  fire_after: string;
  status: "pending" | "generating" | "done" | "canceled";
}

export type DebounceDecision =
  | { action: "fire" }
  | { action: "wait"; waitMs: number }
  | { action: "abort"; reason: "stale_job" | "already_generating" | "already_done" | "canceled" | "missing_row" };

/**
 * Decide, de forma determinística, o que um job de debounce deve fazer ao
 * acordar. Garante no máximo uma resposta por lote: qualquer job cujo token não
 * é o token corrente da conversa é descartado (a inbound mais nova é dona).
 */
export function decideDebounce(
  row: DebounceRow | null | undefined,
  myToken: string,
  now: Date = new Date(),
): DebounceDecision {
  if (!row) return { action: "abort", reason: "missing_row" };
  if (row.claim_token !== myToken) return { action: "abort", reason: "stale_job" };
  if (row.status === "canceled") return { action: "abort", reason: "canceled" };
  if (row.status === "generating") return { action: "abort", reason: "already_generating" };
  if (row.status === "done") return { action: "abort", reason: "already_done" };
  const remaining = msUntil(row.fire_after, now);
  if (remaining > 0) return { action: "wait", waitMs: remaining };
  return { action: "fire" };
}

/** Elegibilidade do tick de recuperação (runtime que morreu antes de disparar). */
export function isRecoverable(
  row: Pick<DebounceRow, "status" | "fire_after">,
  now: Date = new Date(),
  graceMs: number = DEBOUNCE_RECOVERY_GRACE_MS,
): boolean {
  if (row.status !== "pending") return false;
  const at = Date.parse(String(row.fire_after));
  if (Number.isNaN(at)) return false;
  return now.getTime() - at >= graceMs;
}

// ── SLA ──

export interface SlaStamps {
  received_at: string | null;
  ai_generated_at?: string | null;
  queued_at?: string | null;
  sent_at?: string | null;
}

export type SlaBreachReason =
  | "debounce_window"
  | "generation_slow"
  | "queue_wait"
  | "provider_send"
  | "not_sent";

export interface SlaVerdict {
  totalMs: number | null;
  withinSla: boolean;
  breachReason: SlaBreachReason | null;
  legs: { debounceMs: number | null; generationMs: number | null; queueMs: number | null; sendMs: number | null };
}

function delta(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null;
  const x = Date.parse(a), y = Date.parse(b);
  if (Number.isNaN(x) || Number.isNaN(y)) return null;
  return y - x;
}

/**
 * Mede received_at → ai_generated_at → queued_at → sent_at e aponta a etapa que
 * estourou o SLA. `waitMs` é a janela de debounce esperada (não conta como culpa
 * da geração).
 */
export function evaluateReplySla(
  stamps: SlaStamps,
  slaMs: number = DEFAULT_REPLY_SLA_MS,
  waitMs: number = DEFAULT_DEBOUNCE_WAIT_MS,
): SlaVerdict {
  const debounceMs = delta(stamps.received_at, stamps.ai_generated_at);
  const generationMs = debounceMs === null ? null : Math.max(0, debounceMs - waitMs);
  const queueMs = delta(stamps.ai_generated_at, stamps.queued_at);
  const sendMs = delta(stamps.queued_at, stamps.sent_at);
  const totalMs = delta(stamps.received_at, stamps.sent_at);
  const legs = { debounceMs, generationMs, queueMs, sendMs };

  if (totalMs === null) {
    return { totalMs: null, withinSla: false, breachReason: "not_sent", legs };
  }
  if (totalMs <= slaMs) return { totalMs, withinSla: true, breachReason: null, legs };

  const candidates: Array<[SlaBreachReason, number]> = [
    ["provider_send", sendMs ?? 0],
    ["queue_wait", queueMs ?? 0],
    ["generation_slow", generationMs ?? 0],
    ["debounce_window", waitMs],
  ];
  candidates.sort((a, b) => b[1] - a[1]);
  return { totalMs, withinSla: false, breachReason: candidates[0][0], legs };
}
