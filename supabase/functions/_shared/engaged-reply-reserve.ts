// Reserva diária de "resposta engajada" (engaged_reply_reserve).
//
// PROBLEMA: com warm-up ativo (D1=10), respostas conversacionais do agente a leads
// que ESCREVERAM ficam retidas por WARMUP_DAILY_LIMIT junto com prospecção.
//
// SOLUÇÃO ESTRITAMENTE LIMITADA: uma reserva SEPARADA (teto próprio, default 5/dia)
// aplicável APENAS a `source_type='ai_reply'` com inbound REAL comprovado, e apenas
// para tenants explicitamente listados abaixo. Não altera `daily_limit`, não amplia
// prospecção (campaign / flow_initial / flow_followup / notification NUNCA usam a
// reserva) e não relaxa nenhum outro gate (cutoff, human_talk, quarentena,
// kill switch, ritmo por minuto, idempotência).
//
// Quando a reserva do dia acaba, o item volta a ser retido até a virada do dia,
// exatamente como hoje.

import { saoPauloDayStartIso } from "./outbox-quota.ts";

export const ENGAGED_REPLY_RESERVE_REASON = "engaged_reply_reserve";

/** Tenants com reserva liberada e o teto diário de cada um. */
export const ENGAGED_REPLY_RESERVE_TENANTS: Readonly<Record<string, number>> = {
  // Bullink
  "4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18": 5,
};

/** Fontes elegíveis à reserva. Somente resposta conversacional do agente. */
export const ENGAGED_RESERVE_SOURCES = new Set(["ai_reply"]);

export function engagedReserveLimit(empresaId: string | null | undefined): number {
  if (!empresaId) return 0;
  const v = ENGAGED_REPLY_RESERVE_TENANTS[empresaId];
  return Number.isFinite(v) && v! > 0 ? Number(v) : 0;
}

export interface OutboxItemLike {
  id?: string;
  empresa_id?: string | null;
  conversa_id?: string | null;
  prospect_id?: string | null;
  source_type?: string | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface InboundLike {
  id?: string;
  empresa_id?: string | null;
  conversa_id?: string | null;
  direcao?: string | null;
  created_at?: string | null;
}

export interface ReserveDecision {
  eligible: boolean;
  reason: string | null;
  inbound_message_id: string | null;
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * Extrai o UUID da inbound de forma tolerante: alguns registros legados gravaram
 * o valor com sufixo de cast (ex.: "<uuid>:text"). Sem UUID válido -> null.
 */
export function readInboundMessageId(item: OutboxItemLike): string | null {
  const raw = (item.metadata as any)?.inbound_message_id;
  if (typeof raw !== "string") return null;
  const m = raw.match(UUID_RE);
  return m ? m[0].toLowerCase() : null;
}

function deny(reason: string, inboundId: string | null = null): ReserveDecision {
  return { eligible: false, reason, inbound_message_id: inboundId };
}

/** Candidato estrutural: tenant habilitado + ai_reply + inbound_message_id presente. */
export function isEngagedReserveCandidate(item: OutboxItemLike): boolean {
  if (engagedReserveLimit(item.empresa_id) <= 0) return false;
  if (!ENGAGED_RESERVE_SOURCES.has(String(item.source_type ?? ""))) return false;
  return readInboundMessageId(item) !== null;
}

/**
 * Validação pura da inbound que justifica a reserva.
 * Exige: mesma empresa, mesma conversa, direcao=IN, posterior ao cutoff (quando
 * houver) e anterior/igual à geração da resposta.
 */
export function validateEngagedInbound(input: {
  item: OutboxItemLike;
  inbound: InboundLike | null;
  cutoff?: string | null;
}): ReserveDecision {
  const { item, inbound } = input;
  if (!isEngagedReserveCandidate(item)) return deny("not_engaged_reply");

  const inboundId = readInboundMessageId(item)!;
  if (!inbound) return deny("inbound_not_found", inboundId);
  if (inbound.id && String(inbound.id).toLowerCase() !== inboundId) return deny("inbound_mismatch", inboundId);
  if (String(inbound.empresa_id ?? "") !== String(item.empresa_id ?? "")) {
    return deny("inbound_cross_tenant", inboundId);
  }
  if (!item.conversa_id || String(inbound.conversa_id ?? "") !== String(item.conversa_id)) {
    return deny("inbound_other_conversa", inboundId);
  }
  if (String(inbound.direcao ?? "").toUpperCase() !== "IN") return deny("inbound_not_in", inboundId);

  const inboundAt = Date.parse(String(inbound.created_at ?? ""));
  if (Number.isNaN(inboundAt)) return deny("inbound_without_timestamp", inboundId);

  const cutoff = input.cutoff ? Date.parse(String(input.cutoff)) : NaN;
  if (!Number.isNaN(cutoff) && inboundAt < cutoff) return deny("inbound_before_cutoff", inboundId);

  const itemAt = Date.parse(String(item.created_at ?? ""));
  if (Number.isNaN(itemAt)) return deny("item_without_timestamp", inboundId);
  if (inboundAt > itemAt) return deny("inbound_after_reply", inboundId);

  return { eligible: true, reason: null, inbound_message_id: inboundId };
}

/** Consumo da reserva no dia (America/Sao_Paulo). Conta itens já enviados com a marca. */
export async function countEngagedReserveUsedToday(
  supabase: any,
  empresaId: string,
): Promise<number> {
  const { count } = await supabase
    .from("orbit_whatsapp_outbox")
    .select("id", { count: "exact", head: true })
    .eq("empresa_id", empresaId)
    .eq("status", "sent")
    .gte("sent_at", saoPauloDayStartIso())
    .eq("metadata->>quota_reason", ENGAGED_REPLY_RESERVE_REASON);
  return Number(count ?? 0);
}

/** Avaliação completa (lê a inbound real e o cutoff do tenant). */
export async function evaluateEngagedReserve(
  supabase: any,
  item: OutboxItemLike,
  opts?: { cutoff?: string | null },
): Promise<ReserveDecision> {
  if (!isEngagedReserveCandidate(item)) return deny("not_engaged_reply");
  const inboundId = readInboundMessageId(item)!;

  // orbit_mensagens usa a coluna `timestamp` como instante da mensagem.
  const { data: inboundRow } = await supabase
    .from("orbit_mensagens")
    .select("id, empresa_id, conversa_id, direcao, timestamp")
    .eq("id", inboundId)
    .maybeSingle();
  const inbound: InboundLike | null = inboundRow
    ? { ...inboundRow, created_at: (inboundRow as any).timestamp ?? null }
    : null;

  let cutoff = opts?.cutoff ?? null;
  if (opts?.cutoff === undefined) {
    const { data } = await supabase
      .from("orbit_ai_config")
      .select("auto_reply_new_leads_from")
      .eq("empresa_id", item.empresa_id)
      .maybeSingle();
    cutoff = data?.auto_reply_new_leads_from ?? null;
  }

  return validateEngagedInbound({ item, inbound, cutoff });
}

/** Marca (idempotente) o item como consumidor da reserva antes do envio. */
export async function markEngagedReserveUse(
  supabase: any,
  item: OutboxItemLike,
  decision: ReserveDecision,
): Promise<void> {
  const metadata = {
    ...(item.metadata ?? {}),
    quota_reason: ENGAGED_REPLY_RESERVE_REASON,
    engaged_reply_reserve: {
      at: new Date().toISOString(),
      inbound_message_id: decision.inbound_message_id,
    },
  };
  (item as any).metadata = metadata;
  await supabase.from("orbit_whatsapp_outbox").update({ metadata }).eq("id", item.id);
}
