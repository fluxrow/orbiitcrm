// Helper compartilhado: fila global de WhatsApp por tenant (outbox).
// Centraliza elegibilidade, idempotência e enfileiramento. NUNCA chama Z-API
// diretamente — apenas insere na tabela orbit_whatsapp_outbox.
// O worker orbit-whatsapp-outbox-tick consome, respeita ritmo/quota/kill switch
// e faz o envio real ou simulado.
//
// Regras de elegibilidade (obrigatórias e ordenadas):
//   - flow_initial exige payload.created === true
//   - qualquer OUT real (não simulated) para o prospect => already_contacted (flow_initial)
//   - qualquer IN posterior ao enrollment => lead_replied (initial e followup)
//   - conversa em handoff (human_talk=true / human_user_id) => human_handoff
//   - meeting ativa/futura (status scheduled|rescheduled) => meeting_scheduled
//   - deal terminal (won/lost/deleted) ou prospect deleted => terminal_deal
//   - opt-out (optout_whatsapp=true) => opt_out
//
// Prioridades:
//   ai_reply=100  meeting_confirmation=90  manual=80  flow_initial=70
//   flow_followup=40  campaign=20

export type OutboxSourceType =
  | "ai_reply"
  | "meeting_confirmation"
  | "manual"
  | "flow_initial"
  | "flow_followup"
  | "flow_stage"
  | "campaign";

export type OutboxPayloadType = "text" | "image" | "audio" | "document" | "video";

// Prioridade global determinística. flow_stage entra entre meeting_confirmation
// e flow_initial: transições de etapa são intencionais (Agendado/No-show/Ganho/
// Perdido/Negociação) e devem sair na frente de qualquer follow-up de prospecção,
// mas não podem furar respostas de IA nem confirmações de reunião.
export const OUTBOX_PRIORITY: Record<OutboxSourceType, number> = {
  ai_reply: 100,
  meeting_confirmation: 90,
  flow_stage: 75,
  manual: 80,
  flow_initial: 70,
  flow_followup: 40,
  campaign: 20,
};

export interface OutboxContext {
  empresa_id: string;
  prospect_id?: string | null;
  conversa_id?: string | null;
  deal_id?: string | null;
  campaign_id?: string | null;
  flow_run_id?: string | null;
  scheduled_action_id?: string | null;
  source_type: OutboxSourceType;
  source_id?: string | null;
  // event.created para flow_initial (Typebot merge=false)
  event_created?: boolean | null;
  // inbound_message_id para dedupe de ai_reply
  inbound_message_id?: string | null;
  // meeting_id para dedupe de meeting_confirmation
  meeting_id?: string | null;
  // flow_stage: transição de etapa (id da etapa alvo no instante do enqueue)
  target_stage_id?: string | null;
  // flow_stage: permite mensagem em etapa terminal (won/lost) somente quando true
  allow_terminal_stage_message?: boolean | null;
  // flow_stage / auditoria: id do orbit_flow_events que originou o run
  event_id?: string | null;
  // flow_stage / dedupe: id da action ou template (semântica da mensagem)
  action_id?: string | null;
  // Se true, testes/rotinas usam prefixo idempotente próprio
  idempotency_scope?: string | null;
}

export interface EligibilityResult {
  eligible: boolean;
  reasons: string[];
  idempotency_key: string;
}

export interface EnqueueInput extends OutboxContext {
  payload_type: OutboxPayloadType;
  payload: Record<string, unknown>;
  scheduled_for?: string; // ISO
  priority_override?: number;
  metadata?: Record<string, unknown>;
}

export interface EnqueueResult {
  enqueued: boolean;
  outbox_id?: string;
  idempotency_key: string;
  reason?: string;
  reasons?: string[];
  status?: string;
}

function stableKey(ctx: OutboxContext): string {
  const scope = ctx.idempotency_scope ? `${ctx.idempotency_scope}:` : "";
  const parts: string[] = [scope, ctx.source_type];
  switch (ctx.source_type) {
    case "ai_reply":
      parts.push(ctx.empresa_id, ctx.prospect_id ?? "-", ctx.inbound_message_id ?? ctx.source_id ?? "-");
      break;
    case "meeting_confirmation":
      parts.push(ctx.empresa_id, ctx.prospect_id ?? "-", ctx.meeting_id ?? ctx.source_id ?? "-");
      break;
    case "manual":
      parts.push(ctx.empresa_id, ctx.conversa_id ?? "-", ctx.source_id ?? Date.now().toString());
      break;
    case "flow_initial":
      parts.push(ctx.empresa_id, ctx.prospect_id ?? "-", ctx.flow_run_id ?? ctx.source_id ?? "-", "initial");
      break;
    case "flow_followup":
      parts.push(
        ctx.empresa_id,
        ctx.prospect_id ?? "-",
        ctx.scheduled_action_id ?? `${ctx.flow_run_id ?? "-"}:${ctx.source_id ?? "-"}`,
      );
      break;
    case "flow_stage":
      // Transição de etapa: identidade determinística por (empresa, deal, target_stage,
      // event_id ou action_id). Sem timestamps — dedupe é responsabilidade do trigger
      // (bucket de 60s) e do dispatcher (janela curta). Duas emissões da MESMA transição
      // convergem para a mesma chave e o segundo insert cai em duplicate.
      parts.push(
        ctx.empresa_id,
        ctx.deal_id ?? "-",
        ctx.target_stage_id ?? "-",
        ctx.event_id ?? ctx.action_id ?? ctx.source_id ?? ctx.flow_run_id ?? "-",
      );
      break;
    case "campaign":
      // Dedupe por campaign_id + recipient (source_id). Só cai para prospect_id se
      // por algum motivo o produtor não informar recipient — nunca deve acontecer no path real.
      parts.push(ctx.empresa_id, ctx.campaign_id ?? "-", ctx.source_id ?? ctx.prospect_id ?? "-");
      break;
  }
  return parts.join("|");
}

export async function checkEligibility(supabase: any, ctx: OutboxContext): Promise<EligibilityResult> {
  const reasons: string[] = [];
  const idempotency_key = stableKey(ctx);
  const isManual = ctx.source_type === "manual";

  // Regra flow_initial: created deve ser true
  if (ctx.source_type === "flow_initial" && ctx.event_created !== true) {
    reasons.push("lead_not_new");
  }

  // Prospect precisa existir, ser do mesmo tenant e não estar deletado. Vale para todos
  // os source_type — inclusive manual, que é humano após handoff mas ainda respeita
  // opt-out/deleted/cross-tenant.
  if (ctx.prospect_id) {
    const { data: p } = await supabase
      .from("orbit_prospects")
      .select("id, empresa_id, optout_whatsapp, deleted_at")
      .eq("id", ctx.prospect_id)
      .maybeSingle();
    if (!p) reasons.push("prospect_missing");
    else if (p.deleted_at) reasons.push("prospect_deleted");
    else if (p.empresa_id && p.empresa_id !== ctx.empresa_id) reasons.push("cross_tenant");
    else if (p.optout_whatsapp === true) reasons.push("opt_out");
  }

  // Conversa: sempre confirma isolamento por tenant. Handoff só bloqueia automações;
  // manual é justamente o humano assumindo o atendimento.
  if (ctx.conversa_id) {
    const { data: c } = await supabase
      .from("orbit_conversas")
      .select("id, empresa_id, human_talk, human_user_id, handoff_sent_at")
      .eq("id", ctx.conversa_id)
      .maybeSingle();
    if (!c) reasons.push("conversa_missing");
    else if (c.empresa_id && c.empresa_id !== ctx.empresa_id) reasons.push("cross_tenant");
    else if (!isManual && (c.human_talk === true || c.human_user_id)) reasons.push("human_handoff");
  }

  // ── flow_stage: elegibilidade dedicada de transição de etapa.
  //   • Sempre exige deal existente no mesmo tenant/prospect e não deletado.
  //   • Não bloqueia por contato/resposta histórica (histórico é esperado).
  //   • Etapa atual do deal deve == metadata.target_stage_id; senão stale_stage_transition.
  //   • Terminal (is_won/is_lost) só passa se allow_terminal_stage_message=true E
  //     a etapa atual É a terminal alvo. Nunca envia em deal deletado.
  const isFlowStage = ctx.source_type === "flow_stage";
  if (isFlowStage) {
    let dealRow: any = null;
    if (ctx.deal_id) {
      const { data: d } = await supabase
        .from("orbit_deals")
        .select("id, empresa_id, prospect_id, status, deleted_at, etapa_id")
        .eq("id", ctx.deal_id)
        .maybeSingle();
      dealRow = d ?? null;
    }
    if (!dealRow) reasons.push("deal_missing");
    else if (dealRow.empresa_id !== ctx.empresa_id) reasons.push("cross_tenant");
    else if (dealRow.deleted_at) reasons.push("terminal_deal");
    else {
      // Etapa atual deve bater com a etapa alvo do enqueue.
      if (ctx.target_stage_id && dealRow.etapa_id !== ctx.target_stage_id) {
        reasons.push("stale_stage_transition");
      }
      // Verifica se a etapa atual é terminal (won/lost) e aplica gate.
      if (dealRow.etapa_id) {
        const { data: stg } = await supabase
          .from("orbit_pipeline_stages")
          .select("id, is_won, is_lost")
          .eq("id", dealRow.etapa_id)
          .maybeSingle();
        const isTerminalStage = stg?.is_won === true || stg?.is_lost === true;
        if (isTerminalStage && ctx.allow_terminal_stage_message !== true) {
          reasons.push("terminal_deal");
        }
      }
      // status textual won/lost com flag off também bloqueia.
      const s = String(dealRow.status ?? "").toLowerCase();
      if (["won","lost","ganho","perdido","deleted"].includes(s) && ctx.allow_terminal_stage_message !== true) {
        if (!reasons.includes("terminal_deal")) reasons.push("terminal_deal");
      }
    }
  } else {
    // ── Terminal deal — bloqueia demais source_types (inclusive manual até decisão futura).
    // Detecta por: (a) deal_id explícito; (b) qualquer deal do prospect no mesmo tenant com
    // deleted_at, status textual won/lost ou etapa vinculada com is_won/is_lost=true.
    if (ctx.deal_id) {
      const { data: d } = await supabase
        .from("orbit_deals")
        .select("id, status, deleted_at, etapa_id")
        .eq("id", ctx.deal_id)
        .maybeSingle();
      if (d?.deleted_at) reasons.push("terminal_deal");
      else if (d?.status && ["won","lost","ganho","perdido","deleted"].includes(String(d.status).toLowerCase())) {
        reasons.push("terminal_deal");
      }
    }
    if (!reasons.includes("terminal_deal") && ctx.prospect_id) {
      const { data: deals } = await supabase
        .from("orbit_deals")
        .select("id, status, deleted_at, etapa_id")
        .eq("empresa_id", ctx.empresa_id)
        .eq("prospect_id", ctx.prospect_id);
      const list = (deals ?? []) as any[];
      let terminal = false;
      const stageIds: string[] = [];
      for (const d of list) {
        if (d.deleted_at) { terminal = true; break; }
        const s = String(d.status ?? "").toLowerCase();
        if (["won","lost","ganho","perdido","deleted"].includes(s)) { terminal = true; break; }
        if (d.etapa_id) stageIds.push(d.etapa_id);
      }
      if (!terminal && stageIds.length > 0) {
        const { data: stages } = await supabase
          .from("orbit_pipeline_stages")
          .select("id, is_won, is_lost")
          .in("id", stageIds);
        if ((stages ?? []).some((s: any) => s.is_won === true || s.is_lost === true)) terminal = true;
      }
      if (terminal) reasons.push("terminal_deal");
    }
  }

  // Meeting ativa/futura para o prospect — apenas automações agendadas de outbound.
  if (ctx.prospect_id && ["flow_initial","flow_followup","campaign"].includes(ctx.source_type)) {
    const { data: mtg } = await supabase
      .from("orbit_meetings")
      .select("id, status, scheduled_at")
      .eq("prospect_id", ctx.prospect_id)
      .in("status", ["scheduled","rescheduled"])
      .gte("scheduled_at", new Date().toISOString())
      .limit(1);
    if (mtg && mtg.length > 0) reasons.push("meeting_scheduled");
  }

  // Contato prévio real (bloqueia flow_initial) e resposta do lead (bloqueia initial/followup).
  // flow_followup exige ao menos uma OUT REAL prévia (não simulated) — followup não sai do nada.
  // Manual e ai_reply ignoram essas regras — humano assumindo e resposta à mensagem recebida.
  if (!isManual && ctx.prospect_id && (ctx.source_type === "flow_initial" || ctx.source_type === "flow_followup")) {
    const { data: convs } = await supabase
      .from("orbit_conversas")
      .select("id")
      .eq("prospect_id", ctx.prospect_id)
      .eq("empresa_id", ctx.empresa_id);
    const convIds = (convs ?? []).map((r: any) => r.id);
    const REAL_OUT_STATUS = ["enviada", "sent", "entregue", "delivered"];
    if (convIds.length > 0) {
      const { data: outMsgs } = await supabase
        .from("orbit_mensagens")
        .select("id, status")
        .in("conversa_id", convIds)
        .eq("direcao", "OUT")
        .in("status", REAL_OUT_STATUS)
        .limit(1);
      const hasRealOut = !!(outMsgs && outMsgs.length > 0);
      if (ctx.source_type === "flow_initial" && hasRealOut) {
        reasons.push("already_contacted");
      }
      if (ctx.source_type === "flow_followup" && !hasRealOut) {
        reasons.push("missing_prior_real_outbound");
      }
      const { data: inMsgs } = await supabase
        .from("orbit_mensagens")
        .select("id")
        .in("conversa_id", convIds)
        .eq("direcao", "IN")
        .limit(1);
      if (inMsgs && inMsgs.length > 0) reasons.push("lead_replied");
    } else if (ctx.source_type === "flow_followup") {
      // Sem qualquer conversa: definitivamente não há OUT real prévia.
      reasons.push("missing_prior_real_outbound");
    }
  }

  return { eligible: reasons.length === 0, reasons, idempotency_key };
}

/** Lê a flag global outbox_adapter_enabled do tenant. Default false. */
export async function isAdapterEnabled(supabase: any, empresa_id: string | null | undefined): Promise<boolean> {
  if (!empresa_id) return false;
  const { data } = await supabase
    .from("orbit_whatsapp_sending_config")
    .select("outbox_adapter_enabled")
    .eq("empresa_id", empresa_id)
    .maybeSingle();
  return data?.outbox_adapter_enabled === true;
}

/** Enfileira item no outbox. Retorna enqueued=false se elegibilidade falhar
 * ou se já existir (dedupe por idempotency_key). */
export async function enqueueOutbox(supabase: any, input: EnqueueInput): Promise<EnqueueResult> {
  const elig = await checkEligibility(supabase, input);
  if (!elig.eligible) {
    return { enqueued: false, idempotency_key: elig.idempotency_key, reason: elig.reasons[0], reasons: elig.reasons };
  }

  // Verifica dedupe explícito
  const { data: existing } = await supabase
    .from("orbit_whatsapp_outbox")
    .select("id, status")
    .eq("empresa_id", input.empresa_id)
    .eq("idempotency_key", elig.idempotency_key)
    .maybeSingle();
  if (existing) {
    return { enqueued: false, outbox_id: existing.id, idempotency_key: elig.idempotency_key, reason: "duplicate", status: existing.status };
  }

  const priority = input.priority_override ?? OUTBOX_PRIORITY[input.source_type];
  // Merge de contexto no metadata (o worker precisa desses campos para re-check no consumo).
  const ctxMeta: Record<string, unknown> = {};
  if (input.target_stage_id != null) ctxMeta.target_stage_id = input.target_stage_id;
  if (input.allow_terminal_stage_message != null) ctxMeta.allow_terminal_stage_message = input.allow_terminal_stage_message;
  if (input.event_id != null) ctxMeta.event_id = input.event_id;
  if (input.action_id != null) ctxMeta.action_id = input.action_id;
  // Persistir campos de contexto que o worker precisa no re-check no consumo:
  // sem eles, flow_initial cai em lead_not_new, ai_reply perde vínculo com IN,
  // meeting_confirmation esquece o meeting. Bug histórico do enqueue.
  if (input.event_created != null) ctxMeta.event_created = input.event_created;
  if (input.inbound_message_id != null) ctxMeta.inbound_message_id = input.inbound_message_id;
  if (input.meeting_id != null) ctxMeta.meeting_id = input.meeting_id;
  const mergedMetadata = { ...(input.metadata ?? {}), ...ctxMeta };
  const { data: row, error } = await supabase
    .from("orbit_whatsapp_outbox")
    .insert({
      empresa_id: input.empresa_id,
      conversa_id: input.conversa_id ?? null,
      prospect_id: input.prospect_id ?? null,
      deal_id: input.deal_id ?? null,
      campaign_id: input.campaign_id ?? null,
      flow_run_id: input.flow_run_id ?? null,
      scheduled_action_id: input.scheduled_action_id ?? null,
      source_type: input.source_type,
      source_id: input.source_id ?? null,
      idempotency_key: elig.idempotency_key,
      priority,
      payload_type: input.payload_type,
      payload: input.payload,
      scheduled_for: input.scheduled_for ?? new Date().toISOString(),
      metadata: mergedMetadata,
    })
    .select("id, status")
    .single();

  if (error) {
    // Race: unique violation => tratar como duplicate
    if ((error as any).code === "23505") {
      const { data: dupe } = await supabase
        .from("orbit_whatsapp_outbox")
        .select("id, status")
        .eq("empresa_id", input.empresa_id)
        .eq("idempotency_key", elig.idempotency_key)
        .maybeSingle();
      return { enqueued: false, outbox_id: dupe?.id, idempotency_key: elig.idempotency_key, reason: "duplicate", status: dupe?.status };
    }
    throw error;
  }

  return { enqueued: true, outbox_id: row.id, idempotency_key: elig.idempotency_key, status: row.status };
}

/** Cancela pendentes do prospect por motivo. Usado por handoff, meeting, resposta, etc. */
export async function cancelOutboxByProspect(
  supabase: any,
  empresa_id: string,
  prospect_id: string,
  reason: string,
  sources?: OutboxSourceType[],
): Promise<number> {
  const { data, error } = await supabase.rpc("outbox_cancel_by_prospect", {
    _empresa_id: empresa_id,
    _prospect_id: prospect_id,
    _reason: reason,
    _sources: sources ?? null,
  });
  if (error) {
    console.warn("[outbox] cancel error", error.message);
    return 0;
  }
  return Number(data ?? 0);
}
