/**
 * Confirmação inicial de inbound (somente Viver Semijoias, tenant-scoped).
 *
 * Incidente 23/09 16:41 SP: IN ~16:41:00 → claim +7s → outbox ai_reply +31s →
 * aceite do provedor +41s, mesmo com immediate_outbox_dispatch=true. A latência
 * vem da espera de agregação (10s) + geração do modelo, não do envio.
 *
 * Esta confirmação usa o MESMO outbox/worker (nenhum envio direto à Z-API):
 *   • source_type `ai_reply` (urgente, fora das cotas de prospecção e do
 *     max_per_minute=1 — que só vale para campaign/flow_*);
 *   • idempotência por conversa + âncora (última OUT real que não é confirmação):
 *     um burst de inbounds gera no máximo UMA confirmação (UNIQUE do outbox);
 *   • nunca conta como resposta: fora da reserva engajada, do espaçamento por
 *     conversa, da agregação do agente e do "resposta já enviada";
 *   • revalidação no worker imediatamente antes do envio (stale/resposta já
 *     enviada/reunião futura/erro de leitura => cancela, fail-closed).
 *
 * Latência de 10s NÃO é garantida: depende do tempo do webhook, do worker e do
 * provedor. A telemetria registra os tempos reais.
 */

import { VIVER_EMPRESA_ID } from "./tenant-scheduling-policy.ts";

export const VIVER_INBOUND_ACK_EMPRESA_ID = VIVER_EMPRESA_ID;
export const VIVER_INBOUND_ACK_TEXT = "Recebi sua mensagem. Já vou te responder por aqui.";
export const VIVER_INBOUND_ACK_METADATA_KEY = "viver_inbound_ack";
export const VIVER_INBOUND_ACK_SENDER_TYPE = "system";
export const VIVER_INBOUND_ACK_VERSION = "2026-09-23-ack-v1";
/** Confirmação que não saiu em até 45s perde o sentido: cancela, não envia tarde. */
export const VIVER_INBOUND_ACK_MAX_AGE_MS = 45_000;
export const VIVER_INBOUND_ACK_TARGET_MS = 10_000;

const CLOSED_STATUS = new Set([
  "fechada", "fechado", "closed", "encerrada", "encerrado", "arquivada", "archived",
]);

/** Kill switch tenant-scoped: ausente => ligado; `inbound_ack_enabled:false` desliga. */
export function readInboundAckEnabled(aiConfig: Record<string, unknown> | null | undefined): boolean {
  const raw = (aiConfig as any)?.ai_reply_debounce;
  if (raw && typeof raw === "object" && raw.inbound_ack_enabled === false) return false;
  return true;
}

/** Linha visual de orbit_mensagens que é a confirmação (nunca conta como resposta). */
export function isViverInboundAckRow(row: { sender_type?: unknown; mensagem?: unknown } | null | undefined): boolean {
  if (!row) return false;
  return row.sender_type === VIVER_INBOUND_ACK_SENDER_TYPE &&
    String(row.mensagem ?? "").trim() === VIVER_INBOUND_ACK_TEXT;
}

/** Item de outbox que é a confirmação. */
export function isViverInboundAckItem(item: any): boolean {
  return String(item?.empresa_id ?? "") === VIVER_INBOUND_ACK_EMPRESA_ID &&
    item?.source_type === "ai_reply" &&
    item?.metadata?.[VIVER_INBOUND_ACK_METADATA_KEY] === true;
}

/** Primeira OUT (ordem desc) que não é confirmação. */
export function pickLastNonAckOut<T extends { sender_type?: unknown; mensagem?: unknown }>(
  rows: T[] | null | undefined,
): T | null {
  for (const r of rows ?? []) if (!isViverInboundAckRow(r)) return r;
  return null;
}

export function buildAckIdempotencyScope(conversaId: string, anchorOutId: string | null | undefined): string {
  return `viver_inbound_ack:${conversaId}:${anchorOutId ?? "none"}`;
}

export interface InboundAckFacts {
  empresa_id?: string | null;
  ack_enabled?: boolean;
  modo_automatico?: boolean | null;
  immediate_dispatch?: boolean;
  from_me?: boolean | null;
  automation_allowed?: boolean | null;
  conversa_quarantined?: boolean | null;
  /** Inbound que não produzirá resposta (mídia sem processamento) nunca recebe confirmação. */
  reply_expected?: boolean | null;
  inbound_message_id?: string | null;
  prospect?: { id?: string | null; empresa_id?: string | null; deleted_at?: string | null; optout_whatsapp?: boolean | null } | null;
  conversa?: {
    id?: string | null; empresa_id?: string | null; human_talk?: boolean | null; human_user_id?: string | null;
    handoff_sent_at?: string | null; archived_at?: string | null; quarantine_reason?: string | null; status?: string | null;
  } | null;
  future_meeting_count?: number;
  /** OUT real (não-confirmação) posterior ao inbound. */
  reply_after_inbound_count?: number;
  /** Mensagem de humano (Orbit/celular) na conversa. */
  human_message_count?: number;
  query_error?: string | null;
}

export type InboundAckDecision = { send: true; reason: "eligible" } | { send: false; reason: string };

const no = (reason: string): InboundAckDecision => ({ send: false, reason });

/** Decisão pura e determinística (sem I/O). */
export function decideViverInboundAck(f: InboundAckFacts): InboundAckDecision {
  if (f.empresa_id !== VIVER_INBOUND_ACK_EMPRESA_ID) return no("not_viver_tenant");
  if (f.ack_enabled === false) return no("ack_disabled");
  if (f.modo_automatico !== true) return no("automatic_mode_off");
  if (f.immediate_dispatch !== true) return no("immediate_dispatch_off");
  if (f.from_me === true) return no("from_me");
  if (f.automation_allowed !== true) return no("automation_not_allowed");
  if (f.conversa_quarantined === true) return no("conversa_quarantined");
  if (f.reply_expected !== true) return no("no_reply_expected");
  if (!f.inbound_message_id) return no("inbound_missing");
  if (typeof f.query_error === "string" && f.query_error.trim()) return no("evidence_query_failed");
  const p = f.prospect;
  if (!p?.id) return no("prospect_missing");
  if (p.empresa_id && p.empresa_id !== f.empresa_id) return no("cross_tenant");
  if (p.deleted_at) return no("prospect_deleted");
  if (p.optout_whatsapp === true) return no("opt_out");
  const c = f.conversa;
  if (!c?.id) return no("conversa_missing");
  if (c.empresa_id && c.empresa_id !== f.empresa_id) return no("cross_tenant");
  if (c.human_talk === true) return no("human_talk");
  if (c.human_user_id) return no("human_owner");
  if (c.handoff_sent_at) return no("human_handoff");
  if (c.archived_at) return no("conversa_archived");
  if (c.quarantine_reason) return no("conversa_quarantined");
  if (c.status && CLOSED_STATUS.has(String(c.status).toLowerCase())) return no("conversa_closed");
  if ((f.human_message_count ?? 0) > 0) return no("human_attendance");
  if ((f.future_meeting_count ?? 0) > 0) return no("future_meeting");
  if ((f.reply_after_inbound_count ?? 0) > 0) return no("reply_already_sent");
  return { send: true, reason: "eligible" };
}

export interface AckSendFacts {
  item_created_at?: string | null;
  now_ms: number;
  reply_after_inbound_count?: number;
  full_reply_sent_count?: number;
  future_meeting_count?: number;
  query_error?: string | null;
}

/** Revalidação no worker, antes do envio. `null` => pode enviar. */
export function decideAckAtSend(f: AckSendFacts): string | null {
  if (typeof f.query_error === "string" && f.query_error.trim()) return "ack_evidence_query_failed";
  const created = Date.parse(String(f.item_created_at ?? ""));
  if (!Number.isFinite(created)) return "ack_without_timestamp";
  if (f.now_ms - created > VIVER_INBOUND_ACK_MAX_AGE_MS) return "ack_stale";
  if ((f.full_reply_sent_count ?? 0) > 0) return "ack_superseded_by_reply";
  if ((f.reply_after_inbound_count ?? 0) > 0) return "ack_reply_already_sent";
  if ((f.future_meeting_count ?? 0) > 0) return "ack_future_meeting";
  return null;
}

function errTag(label: string, error: unknown): string | null {
  if (!error) return null;
  return `${label}:${String((error as any)?.code ?? (error as any)?.message ?? "error")}`;
}

async function countNonAckOutAfter(
  supabase: any, empresaId: string, conversaId: string, afterIso: string,
): Promise<{ count: number; error: string | null }> {
  const { data, error } = await supabase
    .from("orbit_mensagens")
    .select("id, sender_type, mensagem")
    .eq("empresa_id", empresaId)
    .eq("conversa_id", conversaId)
    .eq("direcao", "OUT")
    .gt("timestamp", afterIso)
    .limit(10);
  return {
    count: ((data ?? []) as any[]).filter((r) => !isViverInboundAckRow(r)).length,
    error: errTag("reply_after", error),
  };
}

async function countFutureMeetings(
  supabase: any, empresaId: string, prospectId: string, nowIso: string,
): Promise<{ count: number; error: string | null }> {
  const { data, error } = await supabase
    .from("orbit_meetings")
    .select("id, status")
    .eq("empresa_id", empresaId)
    .eq("prospect_id", prospectId)
    .gte("scheduled_at", nowIso)
    .limit(10);
  return {
    count: ((data ?? []) as any[])
      .filter((m) => !["cancelled", "canceled", "cancelada"].includes(String(m?.status ?? "").toLowerCase())).length,
    error: errTag("meetings", error),
  };
}

export interface MaybeSendAckInput {
  empresa_id: string;
  conversa: any;
  prospect: any;
  inbound_message_id: string;
  inbound_at: string;
  telefone: string | null;
  from_me: boolean;
  automation_allowed: boolean;
  conversa_quarantined: boolean;
  reply_expected: boolean;
  controlled_reengagement: boolean;
  received_at_ms: number;
}

export interface MaybeSendAckDeps {
  enqueue: (input: any) => Promise<{ enqueued: boolean; outbox_id?: string; reason?: string; status?: string }>;
  kick: (args: { outboxId: string; empresaId: string }) => Promise<Record<string, unknown>>;
  now?: () => number;
}

export interface AckTelemetry {
  event: "viver_inbound_ack";
  version: string;
  empresa_id: string;
  conversa_id: string | null;
  decision: string;
  enqueued?: boolean;
  enqueue_reason?: string | null;
  outbox_id?: string | null;
  enqueue_ms?: number;
  kick_ms?: number;
  kick?: Record<string, unknown> | null;
  target_ms: number;
  within_target_at_kick_return?: boolean | null;
}

/**
 * Produtor da confirmação. Nunca lança: qualquer falha vira telemetria e o
 * fluxo normal da resposta completa segue intacto.
 */
export async function maybeSendViverInboundAck(
  supabase: any,
  input: MaybeSendAckInput,
  deps: MaybeSendAckDeps,
): Promise<AckTelemetry> {
  const now = deps.now ?? Date.now;
  const tel: AckTelemetry = {
    event: "viver_inbound_ack",
    version: VIVER_INBOUND_ACK_VERSION,
    empresa_id: input.empresa_id,
    conversa_id: input.conversa?.id ?? null,
    decision: "not_evaluated",
    target_ms: VIVER_INBOUND_ACK_TARGET_MS,
  };
  if (input.empresa_id !== VIVER_INBOUND_ACK_EMPRESA_ID) {
    tel.decision = "not_viver_tenant";
    return tel;
  }
  try {
    const errors: string[] = [];
    const note = (e: string | null) => { if (e) errors.push(e); };

    const { data: aiConfig, error: cfgErr } = await supabase
      .from("orbit_ai_config")
      .select("modo_automatico, ai_reply_debounce")
      .eq("empresa_id", input.empresa_id)
      .maybeSingle();
    note(errTag("ai_config", cfgErr));

    const conversaId = String(input.conversa?.id ?? "");
    const prospectId = String(input.prospect?.id ?? "");
    const nowIso = new Date(now()).toISOString();

    let conversa: any = null;
    let replyAfter = 0;
    let futureMeetings = 0;
    let humanMsgs = 0;
    let anchor: string | null = null;
    if (conversaId && prospectId) {
      const { data: c, error: cErr } = await supabase
        .from("orbit_conversas")
        .select("id, empresa_id, human_talk, human_user_id, handoff_sent_at, archived_at, quarantine_reason, status")
        .eq("id", conversaId)
        .eq("empresa_id", input.empresa_id)
        .maybeSingle();
      note(errTag("conversa", cErr));
      conversa = c ?? null;

      const ra = await countNonAckOutAfter(supabase, input.empresa_id, conversaId, input.inbound_at);
      note(ra.error);
      replyAfter = ra.count;

      const fm = await countFutureMeetings(supabase, input.empresa_id, prospectId, nowIso);
      note(fm.error);
      futureMeetings = fm.count;

      const { data: hm, error: hmErr } = await supabase
        .from("orbit_mensagens")
        .select("id")
        .eq("empresa_id", input.empresa_id)
        .eq("conversa_id", conversaId)
        .in("sender_type", ["human_phone", "human_orbit"])
        .limit(1);
      note(errTag("human_messages", hmErr));
      humanMsgs = (hm ?? []).length;

      // Âncora do burst: última OUT real (não-confirmação) da conversa.
      const { data: outs, error: oErr } = await supabase
        .from("orbit_mensagens")
        .select("id, sender_type, mensagem")
        .eq("empresa_id", input.empresa_id)
        .eq("conversa_id", conversaId)
        .eq("direcao", "OUT")
        .order("timestamp", { ascending: false })
        .limit(10);
      note(errTag("anchor", oErr));
      anchor = (pickLastNonAckOut(outs as any[]) as any)?.id ?? null;
    }

    const decision = decideViverInboundAck({
      empresa_id: input.empresa_id,
      ack_enabled: readInboundAckEnabled(aiConfig as any),
      modo_automatico: (aiConfig as any)?.modo_automatico ?? null,
      immediate_dispatch: (aiConfig as any)?.ai_reply_debounce?.immediate_outbox_dispatch === true,
      from_me: input.from_me,
      automation_allowed: input.automation_allowed,
      conversa_quarantined: input.conversa_quarantined,
      reply_expected: input.reply_expected,
      inbound_message_id: input.inbound_message_id,
      prospect: input.prospect,
      conversa,
      future_meeting_count: futureMeetings,
      reply_after_inbound_count: replyAfter,
      human_message_count: humanMsgs,
      query_error: errors.length ? errors.join(",") : null,
    });
    tel.decision = decision.reason;
    if (!decision.send) return tel;

    const routed = await deps.enqueue({
      empresa_id: input.empresa_id,
      conversa_id: conversaId,
      prospect_id: prospectId,
      source_type: "ai_reply",
      // Sem inbound_message_id no contexto: a chave fica por burst (conversa+âncora)
      // e nunca colide com a chave/lookup da resposta completa daquele inbound.
      source_id: "inbound_ack",
      idempotency_scope: buildAckIdempotencyScope(conversaId, anchor),
      controlled_reengagement: input.controlled_reengagement === true,
      payload_type: "text",
      payload: { mensagem: VIVER_INBOUND_ACK_TEXT, telefone: input.telefone ?? undefined },
      metadata: {
        [VIVER_INBOUND_ACK_METADATA_KEY]: true,
        inbound_message_id: input.inbound_message_id,
        inbound_at: input.inbound_at,
        visual_sender_type: VIVER_INBOUND_ACK_SENDER_TYPE,
        ack_version: VIVER_INBOUND_ACK_VERSION,
      },
    });
    tel.enqueued = routed.enqueued === true;
    tel.enqueue_reason = routed.reason ?? null;
    tel.outbox_id = routed.outbox_id ?? null;
    tel.enqueue_ms = now() - input.received_at_ms;
    if (!routed.enqueued || !routed.outbox_id) return tel;

    const kick = await deps.kick({ outboxId: routed.outbox_id, empresaId: input.empresa_id });
    tel.kick = kick ?? null;
    tel.kick_ms = now() - input.received_at_ms;
    const sentOutcome = (kick as any)?.outcome === "sent";
    tel.within_target_at_kick_return = sentOutcome ? tel.kick_ms <= VIVER_INBOUND_ACK_TARGET_MS : false;
    return tel;
  } catch (e) {
    tel.decision = `ack_failed:${String((e as any)?.message ?? e).slice(0, 80)}`;
    return tel;
  }
}

/**
 * Gate do worker para a confirmação (chamado só quando o item É confirmação).
 * `null` => enviar; string => cancelar com esse motivo.
 */
export async function viverInboundAckSendBlockReason(
  supabase: any,
  item: any,
  nowMs: number = Date.now(),
): Promise<string | null> {
  if (!isViverInboundAckItem(item)) return null;
  try {
    const errors: string[] = [];
    const note = (e: string | null) => { if (e) errors.push(e); };
    const inboundId = String(item?.metadata?.inbound_message_id ?? "");
    const inboundAt = String(item?.metadata?.inbound_at ?? item?.created_at ?? "");
    let replyAfter = 0;
    let fullSent = 0;
    let meetings = 0;
    if (item.conversa_id && inboundAt) {
      const ra = await countNonAckOutAfter(supabase, item.empresa_id, item.conversa_id, inboundAt);
      note(ra.error);
      replyAfter = ra.count;
    }
    if (item.conversa_id && inboundId) {
      const { data, error } = await supabase
        .from("orbit_whatsapp_outbox")
        .select("id, status, metadata")
        .eq("empresa_id", item.empresa_id)
        .eq("conversa_id", item.conversa_id)
        .eq("source_type", "ai_reply")
        .in("status", ["sent", "processing", "simulated"])
        .gte("created_at", String(item.created_at ?? inboundAt))
        .limit(10);
      note(errTag("full_reply", error));
      fullSent = ((data ?? []) as any[]).filter((r) =>
        String(r.id) !== String(item.id) && r?.metadata?.[VIVER_INBOUND_ACK_METADATA_KEY] !== true
      ).length;
    }
    if (item.prospect_id) {
      const fm = await countFutureMeetings(supabase, item.empresa_id, item.prospect_id, new Date(nowMs).toISOString());
      note(fm.error);
      meetings = fm.count;
    }
    return decideAckAtSend({
      item_created_at: item.created_at ?? null,
      now_ms: nowMs,
      reply_after_inbound_count: replyAfter,
      full_reply_sent_count: fullSent,
      future_meeting_count: meetings,
      query_error: errors.length ? errors.join(",") : null,
    });
  } catch (_e) {
    return "ack_evidence_query_failed";
  }
}
