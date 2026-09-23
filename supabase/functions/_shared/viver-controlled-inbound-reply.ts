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
//   • existe OUT REAL em orbit_mensagens da mesma empresa/conversa, ANTERIOR ao
//     inbound, com campaign_id presente, status enviada/sent e provider_message_id;
//   • existe orbit_whatsapp_outbox da mesma empresa + prospect + campaign_id, com
//     source_type=campaign, status=sent, provider_message_id EXATAMENTE igual ao da
//     OUT e metadata.viver_controlled_reengagement=true (conversa_id do outbox pode
//     ser NULL; se existir, precisa coincidir);
//   • a campanha vinculada está aprovada e pertence a um dos batches autorizados;
//   • não há humano/handoff/atendimento externo, opt-out, prospect deletado,
//     conversa arquivada/quarentenada/fechada, reunião futura, nem OUT/ai_reply
//     posterior ao inbound (idempotência por inbound_message_id).
//
// Fora desse cenário o corte continua bloqueando exatamente como hoje.

import { isViverInboundAckRow } from "./viver-inbound-ack.ts";

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

const SENT_OUT_STATUS = new Set(["enviada", "enviado", "sent"]);

/**
 * Estados que só existem DEPOIS de um envio real, gravados por callback legítimo
 * do provedor (incidente real: a OUT da conversa af32fe70 estava `PLAYED`).
 * Nunca são aceitos sozinhos: a autorização exige, além disso, outbox `sent` com
 * `provider_message_id` coincidente, campanha aprovada e batch allowlisted.
 */
const DELIVERED_OUT_STATUS = new Set([
  "delivered", "entregue", "entregada",
  "read", "lida", "lido",
  "played", "ouvida", "ouvido",
]);

/** Estados que NUNCA comprovam entrega (fail-closed explícito). */
const NOT_SENT_OUT_STATUS = new Set([
  "error", "erro", "failed", "falha", "falhou",
  "canceled", "cancelled", "cancelada", "cancelado",
  "expired", "expirada", "rejected", "rejeitada",
  "pending", "pendente", "queued", "na_fila", "processing",
  "simulated", "simulado", "blocked", "bloqueada", "held", "retained",
]);

export type ControlledOutStatusClass = "sent" | "delivered_after_send" | "not_sent";

/** Classificação determinística do status da OUT (default = not_sent). */
export function classifyControlledOutStatus(raw: unknown): ControlledOutStatusClass {
  const s = String(raw ?? "").trim().toLowerCase();
  if (SENT_OUT_STATUS.has(s)) return "sent";
  if (DELIVERED_OUT_STATUS.has(s)) return "delivered_after_send";
  if (NOT_SENT_OUT_STATUS.has(s)) return "not_sent";
  return "not_sent";
}

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
  /** OUT REAL registrada em orbit_mensagens (fonte forte de correlação). */
  campaign_out_message?: {
    id?: string | null;
    empresa_id?: string | null;
    conversa_id?: string | null;
    campaign_id?: string | null;
    direcao?: string | null;
    status?: string | null;
    provider_message_id?: string | null;
    timestamp?: string | null;
  } | null;
  /** Outbox correlacionado por provider_message_id + campaign_id + prospect_id. */
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
  /**
   * Qualquer erro devolvido pelas consultas de evidência. Fail-closed real:
   * erro em humanos/reuniões/duplicidade não pode virar 0 e liberar o gate.
   */
  query_error?: string | null;
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
  // Consulta de evidência que falhou nunca pode virar "nenhum bloqueio".
  if (typeof f.query_error === "string" && f.query_error.trim() !== "") {
    return block("evidence_query_failed");
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

  // ── OUT REAL da campanha em orbit_mensagens (correlação forte)
  const outMsg = f.campaign_out_message ?? null;
  if (!outMsg) return block("controlled_campaign_out_missing");
  if (outMsg.empresa_id && outMsg.empresa_id !== empresaId) return block("cross_tenant");
  if (outMsg.conversa_id !== c.id) return block("out_other_conversation");
  if (String(outMsg.direcao ?? "OUT").toUpperCase() !== "OUT") return block("out_not_outbound");
  if (!outMsg.campaign_id) return block("out_without_campaign");
  // `sent` ou estado evoluído por callback do provedor (delivered/read/played).
  // Erro/falha/pendente/simulado seguem bloqueando.
  if (classifyControlledOutStatus(outMsg.status) === "not_sent") {
    return block("out_not_sent");
  }
  if (!outMsg.provider_message_id) return block("out_without_provider_message_id");
  const outMs = Date.parse(String(outMsg.timestamp ?? ""));
  if (Number.isNaN(outMs)) return block("out_sent_at_invalid");
  if (!(inboundMs >= outMs)) return block("inbound_before_campaign_out");

  // ── Outbox correlacionado (conversa_id pode ser NULL no caso real)
  const out = f.campaign_outbox ?? null;
  if (!out) return block("controlled_campaign_out_missing");
  if (out.empresa_id && out.empresa_id !== empresaId) return block("cross_tenant");
  if (out.source_type !== "campaign") return block("out_not_campaign");
  if (out.status !== "sent") return block("out_not_sent");
  if (!out.provider_message_id) return block("out_without_provider_message_id");
  if (out.provider_message_id !== outMsg.provider_message_id) {
    return block("out_provider_message_id_mismatch");
  }
  if (!out.campaign_id) return block("out_without_campaign");
  if (out.campaign_id !== outMsg.campaign_id) return block("campaign_mismatch");
  if (out.metadata?.[VIVER_CONTROLLED_INBOUND_METADATA_KEY] !== true) {
    return block("out_without_controlled_marker");
  }
  if (out.conversa_id && c.id && out.conversa_id !== c.id) return block("out_other_conversation");
  if (out.prospect_id !== p.id) return block("out_other_prospect");

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

// ── Gate do webhook (perda comprovada em 11/09) ─────────────────────────────────
// O corte temporal marcava a conversa como human_talk e o webhook nunca chamava o
// agente, então a exceção controlada que existe DENTRO do agente era inalcançável
// para inbound real. Esta decisão pura diz apenas se vale a pena AVALIAR a exceção
// (a autorização final continua em decideViverControlledInboundReply).
export interface ViverControlledOverrideGateInput {
  empresa_id?: string | null;
  from_me?: boolean | null;
  cutoff_allowed?: boolean | null;
  cutoff_reason?: string | null;
  conversa_quarantined?: boolean | null;
  conversa?: {
    id?: string | null;
    human_user_id?: string | null;
    handoff_sent_at?: string | null;
    archived_at?: string | null;
    quarantine_reason?: string | null;
  } | null;
  prospect_id?: string | null;
  inbound_message_id?: string | null;
}

export function shouldEvaluateViverControlledOverride(
  i: ViverControlledOverrideGateInput,
): boolean {
  if (i.empresa_id !== VIVER_CONTROLLED_INBOUND_EMPRESA_ID) return false;
  if (i.from_me === true) return false;
  if (i.cutoff_allowed === true) return false;
  if ((i.cutoff_reason ?? null) !== TEMPORAL_CUTOFF_REASON) return false;
  if (i.conversa_quarantined === true) return false;
  const c = i.conversa ?? null;
  if (!c?.id) return false;
  if (c.human_user_id) return false;
  if (c.handoff_sent_at) return false;
  if (c.archived_at) return false;
  if (c.quarantine_reason) return false;
  if (!i.prospect_id || !i.inbound_message_id) return false;
  return true;
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
    // Fail-closed real: qualquer consulta de evidência que erre invalida a decisão.
    const errors: string[] = [];
    const note = (label: string, error: unknown) => {
      if (error) errors.push(`${label}:${String((error as any)?.code ?? (error as any)?.message ?? "error")}`);
    };

    let prospect = input.prospect ?? null;
    if (!prospect) {
      const { data, error } = await supabase
        .from("orbit_prospects")
        .select("id, empresa_id, deleted_at, optout_whatsapp")
        .eq("id", input.prospect_id)
        .eq("empresa_id", empresaId)
        .maybeSingle();
      note("prospect", error);
      prospect = data ?? null;
    }

    const { data: conversa, error: conversaError } = await supabase
      .from("orbit_conversas")
      .select("id, empresa_id, human_user_id, handoff_sent_at, archived_at, quarantine_reason, status")
      .eq("id", input.conversa_id)
      .eq("empresa_id", empresaId)
      .maybeSingle();
    note("conversa", conversaError);

    const { data: inbound, error: inboundError } = await supabase
      .from("orbit_mensagens")
      .select("id, empresa_id, conversa_id, direcao, timestamp")
      .eq("id", input.inbound_message_id)
      .eq("empresa_id", empresaId)
      .maybeSingle();
    note("inbound", inboundError);


    const inboundTs = inbound?.timestamp ?? null;

    // 1) OUT REAL de campanha na conversa, anterior ao inbound.
    let outMessage: ViverControlledInboundFacts["campaign_out_message"] = null;
    {
      let q = supabase
        .from("orbit_mensagens")
        .select("id, empresa_id, conversa_id, campaign_id, direcao, status, provider_message_id, timestamp")
        .eq("empresa_id", empresaId)
        .eq("conversa_id", input.conversa_id)
        .eq("direcao", "OUT")
        .not("campaign_id", "is", null)
        .not("provider_message_id", "is", null)
        .order("timestamp", { ascending: false })
        .limit(20);
      if (inboundTs) q = q.lte("timestamp", inboundTs);
      const { data: rows, error } = await q;
      note("campaign_out", error);
      const list = (rows ?? []) as any[];
      // Preferência: `sent`; depois estado evoluído pelo provedor (delivered/read/played).
      outMessage = list.find((r) => classifyControlledOutStatus(r?.status) === "sent")
        ?? list.find((r) => classifyControlledOutStatus(r?.status) === "delivered_after_send")
        ?? list[0] ?? null;
    }

    // 2) Outbox correlacionado por provider_message_id + campaign_id + prospect_id.
    let outboxRow: ViverControlledInboundFacts["campaign_outbox"] = null;
    if (outMessage?.provider_message_id && outMessage?.campaign_id) {
      const { data, error } = await supabase
        .from("orbit_whatsapp_outbox")
        .select("empresa_id, conversa_id, prospect_id, campaign_id, source_type, status, provider_message_id, sent_at, metadata")
        .eq("empresa_id", empresaId)
        .eq("prospect_id", input.prospect_id)
        .eq("campaign_id", outMessage.campaign_id)
        .eq("source_type", "campaign")
        .eq("status", "sent")
        .eq("provider_message_id", outMessage.provider_message_id)
        .limit(5);
      note("campaign_outbox", error);
      outboxRow = ((data ?? []) as any[])[0] ?? null;
    }

    let campaign: ViverControlledInboundFacts["campaign"] = null;
    if (outboxRow?.campaign_id) {
      const { data, error } = await supabase
        .from("orbit_campaigns")
        .select("id, empresa_id, aprovacao_status, filtros_json")
        .eq("id", outboxRow.campaign_id)
        .eq("empresa_id", empresaId)
        .maybeSingle();
      note("campaign", error);
      campaign = data ?? null;
    }

    // OUT posterior ao inbound (qualquer canal/origem) → resposta já ocorreu.
    let laterOutCount = 0;
    if (inboundTs) {
      const { data: laterOut, error } = await supabase
        .from("orbit_mensagens")
        .select("id, sender_type, mensagem")
        .eq("empresa_id", empresaId)
        .eq("conversa_id", input.conversa_id)
        .eq("direcao", "OUT")
        .gt("timestamp", inboundTs)
        .limit(10);
      note("later_out", error);
      // Confirmação inicial não é resposta: não bloqueia a resposta completa.
      laterOutCount = ((laterOut ?? []) as any[]).filter((r) => !isViverInboundAckRow(r)).length;
    }

    // ai_reply já enfileirado/enviado para este inbound → idempotência.
    const { data: aiReplies, error: aiRepliesError } = await supabase
      .from("orbit_whatsapp_outbox")
      .select("id, status")
      .eq("empresa_id", empresaId)
      .eq("conversa_id", input.conversa_id)
      .eq("source_type", "ai_reply")
      .like("idempotency_key", `%${input.inbound_message_id}%`)
      .limit(5);
    note("ai_reply", aiRepliesError);
    const existingAiReplyCount = ((aiReplies ?? []) as any[])
      .filter((r) => !["canceled", "cancelled", "failed"].includes(String(r?.status ?? ""))).length;

    // Atendimento humano externo (celular) ou humano pelo Orbit.
    const { data: humanMsgs, error: humanError } = await supabase
      .from("orbit_mensagens")
      .select("id")
      .eq("empresa_id", empresaId)
      .eq("conversa_id", input.conversa_id)
      .in("sender_type", ["human_phone", "human_orbit"])
      .limit(1);
    note("human_messages", humanError);
    const externalHumanCount = (humanMsgs ?? []).length;

    // Reunião futura não cancelada.
    const { data: meetings, error: meetingsError } = await supabase
      .from("orbit_meetings")
      .select("id, status, scheduled_at")
      .eq("empresa_id", empresaId)
      .eq("prospect_id", input.prospect_id)
      .gte("scheduled_at", new Date().toISOString())
      .limit(10);
    note("meetings", meetingsError);
    const futureMeetingCount = ((meetings ?? []) as any[])
      .filter((m) => !["cancelled", "canceled", "cancelada"].includes(String(m?.status ?? "").toLowerCase())).length;

    return decideViverControlledInboundReply({
      query_error: errors.length ? errors.join(",") : null,
      empresa_id: empresaId,
      cutoff_reason: input.cutoff_reason ?? null,
      prospect,
      conversa: conversa ?? null,
      inbound: inbound ?? null,
      campaign_out_message: outMessage,
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

// ── Integração com o gate de elegibilidade do outbox ────────────────────────────
// Duas exceções distintas, ambas ignorando EXCLUSIVAMENTE o motivo temporal
// `automation_cutoff`, ambas restritas ao tenant Viver:
//   • `ai_reply`  → marcador tipado propagado pelo guard inbound (acima);
//   • `campaign`  → ondas controladas 5/8/10, marcador na metadata da campanha
//     validado no produtor (campanha aprovada + batch allowlisted).
// Nenhum outro tenant, origem ou motivo de bloqueio é afetado.

export interface ControlledInboundOutboxContext {
  empresa_id?: string | null;
  source_type?: string | null;
  controlled_reengagement?: boolean | null;
  metadata?: Record<string, unknown> | null;
}

export function isViverControlledInboundReply(
  ctx: ControlledInboundOutboxContext,
): boolean {
  return ctx.empresa_id === VIVER_CONTROLLED_INBOUND_EMPRESA_ID &&
    ctx.source_type === "ai_reply" &&
    ctx.controlled_reengagement === true;
}

/** Envio de campanha controlada (ondas 5/8/10) do tenant Viver. */
export function isViverControlledCampaignSend(
  ctx: ControlledInboundOutboxContext,
): boolean {
  if (ctx.empresa_id !== VIVER_CONTROLLED_INBOUND_EMPRESA_ID) return false;
  if (ctx.source_type !== "campaign") return false;
  return ctx.controlled_reengagement === true ||
    controlledReengagementFromMetadata(ctx.metadata);
}

/** Qualquer uma das duas exceções tenant-scoped do corte temporal. */
export function isViverControlledCutoffExempt(
  ctx: ControlledInboundOutboxContext,
): boolean {
  return isViverControlledInboundReply(ctx) || isViverControlledCampaignSend(ctx);
}

/**
 * Produtor de campanha: só autoriza propagar o marcador controlado quando a
 * campanha é do tenant Viver, está aprovada, tem batch_label allowlisted e traz o
 * bloco `controlled_reengagement` esperado (Typebot + revisão de fechamento).
 */
export function isAuthorizedViverControlledCampaign(campaign: {
  empresa_id?: string | null;
  aprovacao_status?: string | null;
  filtros_json?: Record<string, any> | null;
} | null | undefined): boolean {
  if (!campaign) return false;
  if (campaign.empresa_id !== VIVER_CONTROLLED_INBOUND_EMPRESA_ID) return false;
  if (String(campaign.aprovacao_status ?? "") !== "aprovada") return false;
  const batchLabel = campaign.filtros_json?.batch_label;
  if (typeof batchLabel !== "string" ||
    !VIVER_CONTROLLED_INBOUND_BATCH_LABELS.includes(batchLabel)) return false;
  const cr = campaign.filtros_json?.controlled_reengagement;
  return cr?.source_form === "typebot" && cr?.requires_day_close_review === true;
}

/** Lê o marcador persistido na metadata (re-check do worker). */
export function controlledReengagementFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  return metadata?.[VIVER_CONTROLLED_INBOUND_METADATA_KEY] === true;
}
