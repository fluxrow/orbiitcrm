// SLO operacional da RESPOSTA ATIVA (lead escreveu -> agente responde).
//
// SLO: início do processamento <= 30s após a persistência do IN;
//      OUT ai_reply entregue à Z-API com P95 <= 120s, salvo indisponibilidade externa.
//
// Este módulo é SOMENTE telemetria/alerta: nunca envia, nunca enfileira, nunca
// altera itens da fila. Ele detecta IN elegível sem OUT após o limiar e registra
// auditoria estruturada (tenant-scoped).

export const ENGAGED_SLA_START_SECONDS = 30;
export const ENGAGED_SLA_DELIVER_P95_SECONDS = 120;
/** Limiar do alerta "IN elegível sem OUT". */
export const ENGAGED_SLA_BREACH_MS = 2 * 60 * 1000;
/** Janela de varredura (evita reprocessar histórico antigo). */
export const ENGAGED_SLA_SCAN_WINDOW_MS = 30 * 60 * 1000;

export interface SlaInbound {
  id: string;
  conversa_id: string | null;
  timestamp: string | null;
}

export interface SlaBreach {
  inbound_id: string;
  conversa_id: string | null;
  age_seconds: number;
}

/** Decide, de forma pura, quais IN violaram o SLO (sem OUT e sem item na fila). */
export function selectSlaBreaches(input: {
  inbounds: SlaInbound[];
  /** conversa_id -> instante do último OUT (mensagem visual) */
  lastOutByConversa: Record<string, string | null>;
  /** inbound_id que já possuem item na fila (pending/processing/sent/simulated) */
  queuedInboundIds: Set<string>;
  now?: Date;
  breachMs?: number;
}): SlaBreach[] {
  const now = (input.now ?? new Date()).getTime();
  const breachMs = input.breachMs ?? ENGAGED_SLA_BREACH_MS;
  const out: SlaBreach[] = [];

  for (const inb of input.inbounds) {
    const at = Date.parse(String(inb.timestamp ?? ""));
    if (Number.isNaN(at)) continue;
    const age = now - at;
    if (age < breachMs) continue;
    if (input.queuedInboundIds.has(String(inb.id).toLowerCase())) continue;
    const lastOut = inb.conversa_id ? input.lastOutByConversa[inb.conversa_id] : null;
    if (lastOut && Date.parse(String(lastOut)) >= at) continue;
    out.push({
      inbound_id: String(inb.id),
      conversa_id: inb.conversa_id ?? null,
      age_seconds: Math.round(age / 1000),
    });
  }
  return out;
}

/**
 * Varre o tenant e audita violações. Best-effort: qualquer erro é engolido para
 * nunca impactar o worker de envio.
 */
export async function auditEngagedReplySla(
  supabase: any,
  empresaId: string,
  now: Date = new Date(),
): Promise<SlaBreach[]> {
  try {
    const since = new Date(now.getTime() - ENGAGED_SLA_SCAN_WINDOW_MS).toISOString();

    const { data: inRows } = await supabase
      .from("orbit_mensagens")
      .select("id, conversa_id, timestamp")
      .eq("empresa_id", empresaId)
      .eq("direcao", "IN")
      .gte("timestamp", since)
      .order("timestamp", { ascending: false })
      .limit(200);
    const inbounds: SlaInbound[] = (inRows ?? []) as SlaInbound[];
    if (inbounds.length === 0) return [];

    const conversaIds = Array.from(
      new Set(inbounds.map((i) => i.conversa_id).filter((c): c is string => !!c)),
    );

    const lastOutByConversa: Record<string, string | null> = {};
    if (conversaIds.length > 0) {
      const { data: outRows } = await supabase
        .from("orbit_mensagens")
        .select("conversa_id, timestamp")
        .eq("empresa_id", empresaId)
        .eq("direcao", "OUT")
        .in("conversa_id", conversaIds)
        .gte("timestamp", since)
        .order("timestamp", { ascending: false })
        .limit(500);
      for (const r of (outRows ?? []) as any[]) {
        const key = String(r.conversa_id);
        const prev = lastOutByConversa[key];
        if (!prev || Date.parse(String(r.timestamp)) > Date.parse(String(prev))) {
          lastOutByConversa[key] = r.timestamp;
        }
      }
    }

    const { data: queueRows } = await supabase
      .from("orbit_whatsapp_outbox")
      .select("metadata, status")
      .eq("empresa_id", empresaId)
      .eq("source_type", "ai_reply")
      .in("status", ["pending", "processing", "sent", "simulated"])
      .gte("created_at", since)
      .limit(500);
    const queuedInboundIds = new Set<string>();
    for (const r of (queueRows ?? []) as any[]) {
      const raw = (r.metadata ?? {})?.inbound_message_id;
      if (typeof raw === "string") {
        const m = raw.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
        if (m) queuedInboundIds.add(m[0].toLowerCase());
      }
    }

    const breaches = selectSlaBreaches({ inbounds, lastOutByConversa, queuedInboundIds, now });
    if (breaches.length === 0) return [];

    const detalhes = {
      slo_start_seconds: ENGAGED_SLA_START_SECONDS,
      slo_deliver_p95_seconds: ENGAGED_SLA_DELIVER_P95_SECONDS,
      breach_threshold_seconds: Math.round(ENGAGED_SLA_BREACH_MS / 1000),
      count: breaches.length,
      worst_age_seconds: Math.max(...breaches.map((b) => b.age_seconds)),
      // Sem PII: apenas ids técnicos.
      samples: breaches.slice(0, 10),
    };
    console.warn(JSON.stringify({ alert: "engaged_reply_sla_breach", empresa_id: empresaId, ...detalhes }));
    await supabase.from("orbit_audit_log").insert({
      empresa_id: empresaId,
      acao: "engaged_reply_sla_breach",
      entidade: "orbit_mensagens",
      entidade_id: null,
      detalhes,
    });
    return breaches;
  } catch (_e) {
    return [];
  }
}
