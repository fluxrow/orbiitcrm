/**
 * Instrumentação de latência da confirmação inicial (viver_inbound_ack).
 *
 * SOMENTE observabilidade: não altera decisão, gates, ordem, timing ou envio.
 * Relógio monotônico (performance.now) para durações; relógio de parede apenas
 * para a idade do item na fila (created_at vem do banco).
 *
 * Saída: 1 registro JSON compacto por ack por função, com allowlist fixa de
 * campos. IDs sempre truncados a 8 caracteres. Nunca telefone, nome, texto,
 * payload, URL, token, segredo ou ID completo.
 */

import { isViverInboundAckItem, VIVER_INBOUND_ACK_EMPRESA_ID } from "./viver-inbound-ack.ts";

export const ACK_LATENCY_VERSION = "2026-09-24-ack-lat-v1";

export type PerfClock = () => number;
export const defaultPerf: PerfClock = () => performance.now();

export function short8(id: unknown): string | null {
  if (id == null) return null;
  const s = String(id).replace(/[^A-Za-z0-9-]/g, "");
  return s ? s.slice(0, 8) : null;
}

function ms(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function reasonTag(v: unknown): string | null {
  if (v == null) return null;
  // Motivos são códigos internos; ainda assim limita charset e tamanho.
  return String(v).replace(/[^A-Za-z0-9_:.-]/g, "").slice(0, 48) || null;
}

/** Marcas do produtor (webhook), todas em performance.now(). */
export interface ProducerMarks {
  ack_start?: number;
  precheck_done?: number;
  decision_done?: number;
  enqueue_done?: number;
  kick_done?: number;
}

export interface ProducerLatencyInput {
  webhook_received_perf?: number | null;
  marks: ProducerMarks;
  decision: string;
  enqueued?: boolean;
  enqueue_reason?: string | null;
  outbox_id?: string | null;
  inbound_message_id?: string | null;
  kick_outcome?: unknown;
  kick_reason?: unknown;
  target_ms: number;
}

const d = (a?: number | null, b?: number | null) =>
  a != null && b != null ? ms(b - a) : null;

export function buildProducerLatencyLog(i: ProducerLatencyInput) {
  const m = i.marks;
  const base = i.webhook_received_perf ?? m.ack_start ?? null;
  const end = m.kick_done ?? m.enqueue_done ?? m.decision_done ?? m.precheck_done ?? null;
  const total = d(base, end);
  return {
    event: "viver_inbound_ack_latency",
    stage: "producer",
    v: ACK_LATENCY_VERSION,
    tenant: short8(VIVER_INBOUND_ACK_EMPRESA_ID),
    outbox: short8(i.outbox_id),
    inbound: short8(i.inbound_message_id),
    decision: reasonTag(i.decision),
    enqueued: i.enqueued === true,
    enqueue_reason: reasonTag(i.enqueue_reason),
    kick_outcome: reasonTag(i.kick_outcome),
    kick_reason: reasonTag(i.kick_reason),
    webhook_to_ack_start_ms: d(i.webhook_received_perf, m.ack_start),
    precheck_ms: d(m.ack_start, m.precheck_done),
    decision_ms: d(m.precheck_done, m.decision_done),
    enqueue_ms: d(m.decision_done, m.enqueue_done),
    kick_ms: d(m.enqueue_done, m.kick_done),
    total_ms: total,
    target_ms: i.target_ms,
    within_target: total != null ? total <= i.target_ms : null,
  };
}

/** Marcas do worker por item (WeakMap: não vaza, não muda o item). */
export interface WorkerMarks {
  request_start?: number;
  claim_done?: number;
  process_start?: number;
  provider_start?: number;
  provider_done?: number;
  process_done?: number;
}

const workerMarks = new WeakMap<object, WorkerMarks>();

/** Registra marca apenas para itens ack da Viver; noop para qualquer outro. */
export function markAck(item: any, key: keyof WorkerMarks, perf: PerfClock = defaultPerf): void {
  try {
    if (!item || typeof item !== "object" || !isViverInboundAckItem(item)) return;
    const cur = workerMarks.get(item) ?? {};
    cur[key] = perf();
    workerMarks.set(item, cur);
  } catch { /* observabilidade nunca interfere */ }
}

export function getAckMarks(item: any): WorkerMarks | undefined {
  return item && typeof item === "object" ? workerMarks.get(item) : undefined;
}

export function buildWorkerLatencyLog(args: {
  item: any;
  mode: "directed" | "batch";
  outcome: unknown;
  reason?: unknown;
  extra?: WorkerMarks;
  now_wall_ms?: number;
}) {
  const m = { ...(getAckMarks(args.item) ?? {}), ...(args.extra ?? {}) };
  const created = Date.parse(String(args.item?.created_at ?? ""));
  const now = args.now_wall_ms ?? Date.now();
  const begin = m.request_start ?? m.process_start ?? null;
  return {
    event: "viver_inbound_ack_latency",
    stage: "worker",
    v: ACK_LATENCY_VERSION,
    tenant: short8(args.item?.empresa_id),
    outbox: short8(args.item?.id),
    inbound: short8(args.item?.metadata?.inbound_message_id),
    mode: args.mode,
    outcome: reasonTag(args.outcome),
    reason: reasonTag(args.reason),
    outbox_age_at_done_ms: Number.isFinite(created) ? ms(now - created) : null,
    claim_ms: d(m.request_start, m.claim_done),
    gates_ms: d(m.process_start, m.provider_start),
    provider_ms: d(m.provider_start, m.provider_done),
    post_send_ms: d(m.provider_done, m.process_done),
    total_ms: d(begin, m.process_done),
  };
}

export function logAckLatency(record: Record<string, unknown>): void {
  try { console.log(JSON.stringify(record)); } catch { /* noop */ }
}
