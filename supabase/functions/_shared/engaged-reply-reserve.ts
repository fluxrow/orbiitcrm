// Reserva diária de "resposta engajada" (engaged_reply_reserve).
//
// PROBLEMA: com warm-up ativo (D1=10), respostas conversacionais do agente a leads
// que ESCREVERAM ficam retidas por WARMUP_DAILY_LIMIT junto com prospecção.
//
// SOLUÇÃO ESTRITAMENTE LIMITADA: uma reserva SEPARADA (teto próprio global por dia,
// mais um teto por conversa por dia) aplicável APENAS a `source_type='ai_reply'` com
// inbound REAL comprovado nas últimas 24h, e apenas para tenants explicitamente
// listados abaixo. Não altera `daily_limit`, não amplia prospecção (campaign /
// flow_initial / flow_followup / notification NUNCA usam a reserva) e não relaxa
// nenhum outro gate (cutoff, human_talk, quarentena, kill switch, ritmo por minuto,
// idempotência).
//
// Quando a reserva do dia (ou da conversa) acaba, o item volta a ser retido até a
// virada do dia São Paulo, com reason específico.

import { saoPauloDayStartIso } from "./outbox-quota.ts";

export const ENGAGED_REPLY_RESERVE_REASON = "engaged_reply_reserve";

/** Retain reasons específicos da reserva. */
export const RETAIN_REASON_RESERVE_DAILY = "ENGAGED_RESERVE_DAILY_LIMIT";
export const RETAIN_REASON_RESERVE_CONVERSA = "ENGAGED_RESERVE_CONVERSA_LIMIT";

/** Tenants com reserva liberada e o teto diário global de cada um. */
export const ENGAGED_REPLY_RESERVE_TENANTS: Readonly<Record<string, number>> = {
  // Bullink
  "4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18": 100,
  // Viver Semijoias
  "36f26579-66ad-4ef1-9788-141e4c727232": 100,
};

/**
 * Tenants em que a resposta engajada NÃO tem teto diário global.
 *
 * Motivo: responder um lead que escreveu não é prospecção. Reter esse OUT até a
 * virada do dia gerava lead sem resposta por horas (P95 > 7h). Aqui o teto diário
 * global deixa de valer para `ai_reply` com inbound REAL validado; continuam
 * valendo, sem exceção: teto por conversa por dia, espaçamento mínimo por
 * conversa, cutoff, human_talk, quarentena, kill switch, idempotência por inbound
 * e todos os gates de prospecção (campaign/flow_* nunca entram aqui).
 */
export const ENGAGED_REPLY_UNCAPPED_TENANTS: ReadonlySet<string> = new Set([
  // Bullink
  "4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18",
  // Viver Semijoias
  "36f26579-66ad-4ef1-9788-141e4c727232",
]);

export function engagedReplyUncapped(empresaId: string | null | undefined): boolean {
  return !!empresaId && ENGAGED_REPLY_UNCAPPED_TENANTS.has(String(empresaId));
}

/** Teto adicional por conversa por dia (America/Sao_Paulo). */
export const ENGAGED_RESERVE_CONVERSA_LIMIT = 30;

/** Espaçamento mínimo entre duas respostas do agente na MESMA conversa. */
export const ENGAGED_CONVERSA_MIN_SPACING_MS = 8_000;

/** Retain reason do espaçamento por conversa (anti-lote por número). */
export const RETAIN_REASON_CONVERSA_SPACING = "ENGAGED_CONVERSA_SPACING";

/**
 * Quantos ms ainda faltam para respeitar o espaçamento mínimo por conversa.
 * `0` = pode enviar agora. Nunca depende de quota global.
 */
export function conversaSpacingWaitMs(
  lastSentAtIso: string | null | undefined,
  now: Date = new Date(),
  spacingMs: number = ENGAGED_CONVERSA_MIN_SPACING_MS,
): number {
  if (!lastSentAtIso) return 0;
  const last = Date.parse(String(lastSentAtIso));
  if (Number.isNaN(last)) return 0;
  const elapsed = now.getTime() - last;
  if (elapsed >= spacingMs) return 0;
  return spacingMs - elapsed;
}

/** Janela máxima entre a inbound do lead e a resposta do agente. */
export const ENGAGED_RESERVE_INBOUND_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Percentual de consumo que dispara auditoria/alerta estruturado. */
export const ENGAGED_RESERVE_ALERT_RATIO = 0.8;

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

export interface ConversaLike {
  id?: string;
  empresa_id?: string | null;
  human_talk?: boolean | null;
  archived_at?: string | null;
  quarantine_reason?: string | null;
  status?: string | null;
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
 * Validação pura da inbound (e do estado da conversa) que justifica a reserva.
 * Exige: mesma empresa, mesma conversa, direcao=IN, posterior ao cutoff (quando
 * houver), dentro da janela de 24h e anterior/igual à geração da resposta.
 * A conversa precisa estar ativa: não arquivada, não em quarentena e sem humano.
 */
export function validateEngagedInbound(input: {
  item: OutboxItemLike;
  inbound: InboundLike | null;
  cutoff?: string | null;
  conversa?: ConversaLike | null;
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
  if (itemAt - inboundAt > ENGAGED_RESERVE_INBOUND_WINDOW_MS) {
    return deny("inbound_outside_24h_window", inboundId);
  }

  // Estado da conversa: quando informado, precisa estar ativo e sob a IA.
  const conversa = input.conversa;
  if (conversa !== undefined) {
    if (!conversa) return deny("conversa_not_found", inboundId);
    if (String(conversa.empresa_id ?? "") !== String(item.empresa_id ?? "")) {
      return deny("conversa_cross_tenant", inboundId);
    }
    if (conversa.archived_at) return deny("conversa_archived", inboundId);
    if (conversa.quarantine_reason) return deny("conversa_quarantined", inboundId);
    if (conversa.human_talk === true) return deny("conversa_human_talk", inboundId);
  }

  return { eligible: true, reason: null, inbound_message_id: inboundId };
}

/** Consumo global da reserva no dia (America/Sao_Paulo). */
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

/** Consumo da reserva no dia por conversa (America/Sao_Paulo). */
export async function countEngagedReserveUsedTodayForConversa(
  supabase: any,
  empresaId: string,
  conversaId: string,
): Promise<number> {
  const { count } = await supabase
    .from("orbit_whatsapp_outbox")
    .select("id", { count: "exact", head: true })
    .eq("empresa_id", empresaId)
    .eq("conversa_id", conversaId)
    .eq("status", "sent")
    .gte("sent_at", saoPauloDayStartIso())
    .eq("metadata->>quota_reason", ENGAGED_REPLY_RESERVE_REASON);
  return Number(count ?? 0);
}

/**
 * Idempotência por inbound: já existe (outro) item enviado/simulado respondendo
 * a MESMA inbound? Nesse caso a reserva é negada e nada é reenviado.
 *
 * Exceção auditável: itens marcados com `metadata.recovery_superseded_by` não
 * contam como resposta real (ex.: fallback de fora do horário substituído por
 * uma recuperação oficial). A marcação é feita explicitamente por operação de
 * recuperação, nunca pelo caminho normal do agente.
 */
export async function inboundAlreadyAnswered(
  supabase: any,
  item: OutboxItemLike,
  inboundId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("orbit_whatsapp_outbox")
    .select("id, status, metadata")
    .eq("empresa_id", item.empresa_id)
    .eq("source_type", "ai_reply")
    .in("status", ["sent", "simulated"])
    .ilike("metadata->>inbound_message_id", `${inboundId}%`)
    .limit(10);
  return ((data ?? []) as any[]).some(
    (r) =>
      String(r.id) !== String(item.id ?? "") &&
      !(r.metadata ?? {})?.recovery_superseded_by,
  );
}


/** Avaliação completa (lê a inbound real, a conversa e o cutoff do tenant). */
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

  let conversa: ConversaLike | null = null;
  if (item.conversa_id) {
    const { data } = await supabase
      .from("orbit_conversas")
      .select("id, empresa_id, human_talk, archived_at, quarantine_reason, status")
      .eq("id", item.conversa_id)
      .maybeSingle();
    conversa = (data as ConversaLike) ?? null;
  }

  const decision = validateEngagedInbound({ item, inbound, cutoff, conversa });
  if (!decision.eligible) return decision;

  if (await inboundAlreadyAnswered(supabase, item, inboundId)) {
    return deny("inbound_already_answered", inboundId);
  }
  return decision;
}

/** Marca (idempotente) o item como consumidor da reserva antes do envio. */
export async function markEngagedReserveUse(
  supabase: any,
  item: OutboxItemLike,
  decision: ReserveDecision,
  counters?: { daily_used?: number; daily_limit?: number; conversa_used?: number; conversa_limit?: number },
): Promise<void> {
  const metadata = {
    ...(item.metadata ?? {}),
    quota_reason: ENGAGED_REPLY_RESERVE_REASON,
    engaged_reply_reserve: {
      at: new Date().toISOString(),
      inbound_message_id: decision.inbound_message_id,
      daily_used: counters?.daily_used ?? null,
      daily_limit: counters?.daily_limit ?? engagedReserveLimit(item.empresa_id),
      conversa_used: counters?.conversa_used ?? null,
      conversa_limit: counters?.conversa_limit ?? ENGAGED_RESERVE_CONVERSA_LIMIT,
    },
  };
  (item as any).metadata = metadata;
  await supabase.from("orbit_whatsapp_outbox").update({ metadata }).eq("id", item.id);
}

/** Auditoria/alerta estruturado ao cruzar 80% do teto global do dia. */
export async function auditEngagedReserveUsage(
  supabase: any,
  input: { empresa_id: string; used: number; limit: number; conversa_id?: string | null; outbox_id?: string | null },
): Promise<void> {
  const { empresa_id, used, limit } = input;
  if (limit <= 0) return;
  const threshold = Math.ceil(limit * ENGAGED_RESERVE_ALERT_RATIO);
  const exhausted = used >= limit;
  if (used < threshold) return;
  const detalhes = {
    used,
    limit,
    ratio: Number((used / limit).toFixed(2)),
    threshold,
    exhausted,
    conversa_id: input.conversa_id ?? null,
    outbox_id: input.outbox_id ?? null,
  };
  console.warn(
    JSON.stringify({ alert: "engaged_reply_reserve_usage", empresa_id, ...detalhes }),
  );
  try {
    await supabase.from("orbit_audit_log").insert({
      empresa_id,
      acao: exhausted ? "engaged_reserve_exhausted" : "engaged_reserve_threshold_80",
      entidade: "orbit_whatsapp_outbox",
      entidade_id: input.outbox_id ?? null,
      detalhes,
    });
  } catch (_e) {
    // auditoria é best-effort; nunca bloqueia o envio.
  }
}

/** Último OUT ai_reply realmente enviado nessa conversa (para o espaçamento). */
export async function lastEngagedReplySentAt(
  supabase: any,
  empresaId: string,
  conversaId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("orbit_whatsapp_outbox")
    .select("sent_at")
    .eq("empresa_id", empresaId)
    .eq("conversa_id", conversaId)
    .eq("source_type", "ai_reply")
    .in("status", ["sent", "simulated"])
    .not("sent_at", "is", null)
    .order("sent_at", { ascending: false })
    .limit(1);
  return ((data ?? [])[0] as any)?.sent_at ?? null;
}
