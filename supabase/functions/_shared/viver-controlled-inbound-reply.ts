// Exceção determinística e tenant-scoped: resposta da IA a inbound real da rampa
// de reengajamento controlado da Viver Semijoias.
//
// Contexto: `evaluateAutomationCutoff` bloqueia prospects criados antes de
// `auto_reply_new_leads_from` e o agente marca a conversa como human_talk. Isso
// conflita com a rampa aprovada: a campanha sai, o lead responde e ninguém responde.
//
// Esta exceção ignora EXCLUSIVAMENTE o motivo temporal `automation_cutoff` e só
// quando TODAS as condições abaixo são verdadeiras:
//   • empresa_id == Viver Semijoias;
//   • existe OUT REAL de campanha da mesma conversa/prospect (source_type=campaign,
//     status=sent, provider_message_id não nulo, metadata.viver_controlled_reengagement=true)
//     enviada ANTES do inbound atual;
//   • a campanha vinculada está aprovada e pertence a um dos batches autorizados;
//   • não há humano/handoff/atendimento externo, opt-out, prospect deletado,
//     conversa arquivada/quarentenada/fechada, reunião futura, nem OUT/ai_reply
//     posterior ao inbound (idempotência por inbound_message_id).
//
// Fora desse cenário o corte continua bloqueando exatamente como hoje.

export const VIVER_CONTROLLED_INBOUND_EMPRESA_ID =
  "36f26579-66ad-4ef1-9788-141e4c727232";

export const VIVER_CONTROLLED_INBOUND_METADATA_KEY =
  "viver_controlled_reengagement";

/** Batches autorizados (rampa 5/8/10 e recuperação pontual D0). */
export const VIVER_CONTROLLED_INBOUND_BATCH_LABELS: readonly string[] = [
  "viver_fernanda_audio_ramp_5_8_10_2026-09-09",
  "viver_d0_recovery_2026-09-09_1827_sp",
];

export const TEMPORAL_CUTOFF_REASON = "automation_cutoff";

export interface ViverControlledInboundDecision {
  allowed: boolean;
  reason: string;
  campaign_id?: string | null;
  batch_label?: string | null;
}

export interface ViverControlledInboundFacts {
  empresa_id?: string | null;
  /** Motivo devolvido por evaluateAutomationCutoff. */
  cutoff_reason?: string | null;
  prospect?: {
    id?: string | null;
    empresa_id?: string | null;
    deleted_at?: string | null;
    optout_whatsapp?: boolean | null;
  } | null;
  conversa?: {
    id?: string | null;
    empresa_id?: string | null;
    human_user_id?: string | null;
    handoff_sent_at?: string | null;
    archived_at?: string | null;
    quarantine_reason?: string | null;
    status?: string | null;
  } | null;
  inbound?: {
    id?: string | null;
    empresa_id?: string | null;
    conversa_id?: string | null;
    direcao?: string | null;
    timestamp?: string | null;
  } | null;
  campaign_outbox?: {
    empresa_id?: string | null;
    conversa_id?: string | null;
    prospect_id?: string | null;
    campaign_id?: string | null;
    source_type?: string | null;
    status?: string | null;
    provider_message_id?: string | null;
    sent_at?: string | null;
    metadata?: Record<string, unknown> | null;
  } | null;
  campaign?: {
    id?: string | null;
    empresa_id?: string | null;
    aprovacao_status?: string | null;
    filtros_json?: Record<string, unknown> | null;
  } | null;
  /** OUT (qualquer) posterior ao inbound na mesma conversa. */
  later_out_count?: number;
  /** ai_reply em aberto/enviado para este inbound (idempotência). */
  existing_ai_reply_count?: number;
  /** Reunião futura não cancelada do prospect. */
  future_meeting_count?: number;
  /** Mensagem de atendente humano (Orbit ou celular) na conversa. */
  external_human_message_count?: number;
}

const CLOSED_STATUS = new Set([
  "fechada", "fechado", "closed", "encerrada", "encerrado", "arquivada", "archived",
]);

function block(reason: string): ViverControlledInboundDecision {
  return { allowed: false, reason };
}

/** Decisão pura e determinística (sem I/O), usada também pelos testes. */
export function decideViverControlledInboundReply(
  f: ViverControlledInboundFacts,
): ViverControlledInboundDecision {
  const empresaId = f.empresa_id ?? null;
  if (empresaId !== VIVER_CONTROLLED_INBOUND_EMPRESA_ID) {
    return block("not_viver_tenant");
  }
  if ((f.cutoff_reason ?? null) !== TEMPORAL_CUTOFF_REASON) {
    return block("cutoff_reason_not_temporal");
  }

  // ── Prospect
  const p = f.prospect ?? null;
  if (!p?.id) return block("prospect_missing");
  if (p.empresa_id && p.empresa_id !== empresaId) return block("cross_tenant");
  if (p.deleted_at) return block("prospect_deleted");
  if (p.optout_whatsapp === true) return block("opt_out");

  // ── Conversa
  const c = f.conversa ?? null;
  if (!c?.id) return block("conversa_missing");
  if (c.empresa_id && c.empresa_id !== empresaId) return block("cross_tenant");
  if (c.human_user_id) return block("human_owner");
  if (c.handoff_sent_at) return block("human_handoff");
  if (c.archived_at) return block("conversa_archived");
  if (c.quarantine_reason) return block("conversa_quarantined");
  if (c.status && CLOSED_STATUS.has(String(c.status).toLowerCase())) {
    return block("conversa_closed");
  }
  if ((f.external_human_message_count ?? 0) > 0) {
    return block("external_human_attendance");
  }
  if ((f.future_meeting_count ?? 0) > 0) return block("future_meeting");

  // ── Inbound atual
  const inb = f.inbound ?? null;
  if (!inb?.id) return block("inbound_missing");
  if (inb.empresa_id && inb.empresa_id !== empresaId) return block("cross_tenant");
  if (inb.conversa_id && c.id && inb.conversa_id !== c.id) return block("inbound_other_conversation");
  if (String(inb.direcao ?? "").toUpperCase() !== "IN") return block("inbound_not_inbound");
  const inboundMs = Date.parse(String(inb.timestamp ?? ""));
  if (Number.isNaN(inboundMs)) return block("inbound_timestamp_invalid");

  // ── OUT real de campanha controlada
  const out = f.campaign_outbox ?? null;
  if (!out) return block("controlled_campaign_out_missing");
  if (out.empresa_id && out.empresa_id !== empresaId) return block("cross_tenant");
  if (out.source_type !== "campaign") return block("out_not_campaign");
  if (out.status !== "sent") return block("out_not_sent");
  if (!out.provider_message_id) return block("out_without_provider_message_id");
  if (!out.campaign_id) return block("out_without_campaign");
  if (out.metadata?.[VIVER_CONTROLLED_INBOUND_METADATA_KEY] !== true) {
    return block("out_without_controlled_marker");
  }
  if (out.conversa_id && c.id && out.conversa_id !== c.id) return block("out_other_conversation");
  if (out.prospect_id && p.id && out.prospect_id !== p.id) return block("out_other_prospect");
  const sentMs = Date.parse(String(out.sent_at ?? ""));
  if (Number.isNaN(sentMs)) return block("out_sent_at_invalid");
  if (!(inboundMs >= sentMs)) return block("inbound_before_campaign_out");

  // ── Campanha aprovada e batch autorizado
  const camp = f.campaign ?? null;
  if (!camp?.id) return block("campaign_missing");
  if (camp.empresa_id && camp.empresa_id !== empresaId) return block("cross_tenant");
  if (camp.id !== out.campaign_id) return block("campaign_mismatch");
  if (String(camp.aprovacao_status ?? "") !== "aprovada") return block("campaign_not_approved");
  const batchLabel = camp.filtros_json?.batch_label;
  if (typeof batchLabel !== "string" || !VIVER_CONTROLLED_INBOUND_BATCH_LABELS.includes(batchLabel)) {
    return block("batch_not_authorized");
  }

  // ── Idempotência / resposta já existente
  if ((f.later_out_count ?? 0) > 0) return block("reply_already_sent");
  if ((f.existing_ai_reply_count ?? 0) > 0) return block("ai_reply_already_exists");

  return {
    allowed: true,
    reason: "viver_controlled_reengagement_reply",
    campaign_id: camp.id,
    batch_label: batchLabel,
  };
}

export interface ViverControlledInboundInput {
  empresa_id?: string | null;
  prospect_id?: string | null;
  conversa_id?: string | null;
  inbound_message_id?: string | null;
  cutoff_reason?: string | null;
  prospect?: ViverControlledInboundFacts["prospect"];
}

/**
 * Carrega os fatos tenant-scoped e decide. Fail-closed: qualquer erro de leitura
 * mantém o bloqueio do corte.
 */
export async function evaluateViverControlledInboundReply(
  supabase: any,
  input: ViverControlledInboundInput,
): Promise<ViverControlledInboundDecision> {
  const empresaId = input.empresa_id ?? null;
  if (empresaId !== VIVER_CONTROLLED_INBOUND_EMPRESA_ID) return block("not_viver_tenant");
  if ((input.cutoff_reason ?? null) !== TEMPORAL_CUTOFF_REASON) {
    return block("cutoff_reason_not_temporal");
  }
  if (!input.conversa_id || !input.prospect_id || !input.inbound_message_id) {
    return block("context_incomplete");
  }

  try {
    let prospect = input.prospect ?? null;
    if (!prospect) {
      const { data } = await supabase
        .from("orbit_prospects")
        .select("id, empresa_id, deleted_at, optout_whatsapp")
        .eq("id", input.prospect_id)
        .eq("empresa_id", empresaId)
        .maybeSingle();
      prospect = data ?? null;
    }

    const { data: conversa } = await supabase
      .from("orbit_conversas")
      .select("id, empresa_id, human_user_id, handoff_sent_at, archived_at, quarantine_reason, status")
      .eq("id", input.conversa_id)
      .eq("empresa_id", empresaId)
      .maybeSingle();

    const { data: inbound } = await supabase
      .from("orbit_mensagens")
      .select("id, empresa_id, conversa_id, direcao, timestamp")
      .eq("id", input.inbound_message_id)
      .eq("empresa_id", empresaId)
      .maybeSingle();

    const inboundTs = inbound?.timestamp ?? null;

    // Última OUT real de campanha controlada anterior ao inbound.
    let outboxRow: ViverControlledInboundFacts["campaign_outbox"] = null;
    {
      let q = supabase
        .from("orbit_whatsapp_outbox")
        .select("empresa_id, conversa_id, prospect_id, campaign_id, source_type, status, provider_message_id, sent_at, metadata")
        .eq("empresa_id", empresaId)
        .eq("conversa_id", input.conversa_id)
        .eq("source_type", "campaign")
        .eq("status", "sent")
        .not("provider_message_id", "is", null)
        .order("sent_at", { ascending: false })
        .limit(20);
      if (inboundTs) q = q.lte("sent_at", inboundTs);
      const { data: rows } = await q;
      const list = (rows ?? []) as any[];
      outboxRow = list.find((r) =>
        r?.metadata?.[VIVER_CONTROLLED_INBOUND_METADATA_KEY] === true && !!r?.campaign_id
      ) ?? list[0] ?? null;
    }

    let campaign: ViverControlledInboundFacts["campaign"] = null;
    if (outboxRow?.campaign_id) {
      const { data } = await supabase
        .from("orbit_campaigns")
        .select("id, empresa_id, aprovacao_status, filtros_json")
        .eq("id", outboxRow.campaign_id)
        .eq("empresa_id", empresaId)
        .maybeSingle();
      campaign = data ?? null;
    }

    // OUT posterior ao inbound (qualquer canal/origem) → resposta já ocorreu.
    let laterOutCount = 0;
    if (inboundTs) {
      const { data: laterOut } = await supabase
        .from("orbit_mensagens")
        .select("id")
        .eq("empresa_id", empresaId)
        .eq("conversa_id", input.conversa_id)
        .eq("direcao", "OUT")
        .gt("timestamp", inboundTs)
        .limit(1);
      laterOutCount = (laterOut ?? []).length;
    }

    // ai_reply já enfileirado/enviado para este inbound → idempotência.
    const { data: aiReplies } = await supabase
      .from("orbit_whatsapp_outbox")
      .select("id, status")
      .eq("empresa_id", empresaId)
      .eq("conversa_id", input.conversa_id)
      .eq("source_type", "ai_reply")
      .like("idempotency_key", `%${input.inbound_message_id}%`)
      .limit(5);
    const existingAiReplyCount = ((aiReplies ?? []) as any[])
      .filter((r) => !["canceled", "cancelled", "failed"].includes(String(r?.status ?? ""))).length;

    // Atendimento humano externo (celular) ou humano pelo Orbit.
    const { data: humanMsgs } = await supabase
      .from("orbit_mensagens")
      .select("id")
      .eq("empresa_id", empresaId)
      .eq("conversa_id", input.conversa_id)
      .in("sender_type", ["human_phone", "human_orbit"])
      .limit(1);
    const externalHumanCount = (humanMsgs ?? []).length;

    // Reunião futura não cancelada.
    const { data: meetings } = await supabase
      .from("orbit_meetings")
      .select("id, status, scheduled_at")
      .eq("empresa_id", empresaId)
      .eq("prospect_id", input.prospect_id)
      .gte("scheduled_at", new Date().toISOString())
      .limit(10);
    const futureMeetingCount = ((meetings ?? []) as any[])
      .filter((m) => !["cancelled", "canceled", "cancelada"].includes(String(m?.status ?? "").toLowerCase())).length;

    return decideViverControlledInboundReply({
      empresa_id: empresaId,
      cutoff_reason: input.cutoff_reason ?? null,
      prospect,
      conversa: conversa ?? null,
      inbound: inbound ?? null,
      campaign_outbox: outboxRow,
      campaign,
      later_out_count: laterOutCount,
      existing_ai_reply_count: existingAiReplyCount,
      future_meeting_count: futureMeetingCount,
      external_human_message_count: externalHumanCount,
    });
  } catch (_e) {
    return block("controlled_inbound_check_failed");
  }
}
