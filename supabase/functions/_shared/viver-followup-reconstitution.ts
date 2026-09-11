// Reconstituição determinística e idempotente da cadência de follow-up da Viver
// Semijoias (tenant-scoped, nenhum outro tenant é afetado).
//
// PROBLEMA
// Runs `lead_recebido` antigos concluíram como success, mas as ações D0/D1 saíram
// como `action_disabled`; vários D1 caíram em `missing_prior_real_outbound`. As
// campanhas de recuperação enviadas depois entregam o PRIMEIRO CONTATO, mas não
// reconstituem a cadência — o lead recebe uma mensagem e nunca o follow-up.
//
// SOLUÇÃO
// Após um envio REAL confirmado de campanha controlada (outbox `sent` com
// `provider_message_id` e OUT correlacionada), agenda as ações de follow-up JÁ
// APROVADAS do flow Typebot originalmente associado ao prospect. A rotina:
//   • nunca inventa qualificação, template, ação ou flow — segue o flow original
//     do run/event `lead_recebido` existente da MESMA empresa e prospect;
//   • só agenda ações com `enabled=true`, `viver_controlled_followup=true` e
//     `cancel_on_reply=true` (não reativa nada: quem está desabilitado fica fora,
//     então o individual agenda D1/D3/D7 e o grupo apenas o D1 habilitado);
//   • ancora todos os delays no `sent_at` REAL da campanha, nunca na criação
//     antiga do lead;
//   • deduplica por `cadence_key` (ação + prospect) e pelo histórico real de
//     OUT/outbox do mesmo template — um toque já aceito nunca se repete;
//   • para completamente se houver resposta, reunião, humano/handoff externo,
//     opt-out, prospect inválido/deletado ou deal terminal;
//   • preserva lembretes de reunião: quando existe reunião a rotina apenas para,
//     sem cancelar, mexer ou reagendar nada.
//
// A exceção de corte temporal para esse follow-up exige ESTA PROVA server-side
// (campanha aprovada + outbox sent correlacionado + OUT real + run lead_recebido).
// Marcador booleano em metadata, isolado, nunca basta.

import {
  isAuthorizedViverControlledCampaign,
  VIVER_CONTROLLED_INBOUND_BATCH_LABELS,
  VIVER_CONTROLLED_INBOUND_EMPRESA_ID,
  VIVER_CONTROLLED_INBOUND_METADATA_KEY,
} from "./viver-controlled-inbound-reply.ts";

export const VIVER_FOLLOWUP_RECONSTITUTION_VERSION = "2026-09-11-v1";
export const VIVER_FOLLOWUP_EMPRESA_ID = VIVER_CONTROLLED_INBOUND_EMPRESA_ID;
export { VIVER_CONTROLLED_INBOUND_BATCH_LABELS };

const REAL_OUT_STATUS = new Set(["enviada", "enviado", "sent", "entregue", "delivered", "read", "lida"]);
const DEAD_OUTBOX_STATUS = new Set(["canceled", "cancelled", "failed"]);
const CLOSED_CONVERSA_STATUS = new Set([
  "fechada", "fechado", "closed", "encerrada", "encerrado", "arquivada", "archived",
]);

/**
 * Templates LEGADOS do toque D1 (individual e grupo) já enviados antes da troca
 * pelo áudio novo. O template atual difere, mas o TOQUE é o mesmo: nunca repetir
 * D1 só porque o template mudou.
 */
export const VIVER_LEGACY_D1_TEMPLATE_IDS = new Set([
  "5a9ecae4-5212-4e46-a612-f394a48d7f7e", // individual
  "d6307e57-9e08-437a-9a93-2181ab0bde60", // grupo
]);

/**
 * Flows Typebot APROVADOS da Viver (individual e grupo). Nenhum outro flow
 * `lead_recebido` do tenant autoriza reconstituição de cadência.
 */
export const VIVER_APPROVED_TYPEBOT_FLOW_IDS = new Set([
  "0da4e8dc-05ee-4faa-b4ca-4b359ae5feb7", // VIVER - Qualificado -> Call Individual
  "9f20eab5-abfe-4998-a8ac-a7afa616f1e6", // VIVER - Baixo capital -> Aula Grupo
]);

/** WhatsApp inválido/bloqueado: nunca agenda follow-up. */
const INVALID_WHATSAPP_STATUS = new Set([
  "invalido", "invalid", "inexistente", "bloqueado", "blocked", "banido",
]);

/** Janela do toque D1: até 48h após o envio real da campanha. */
const D1_MAX_DELAY_SECONDS = 48 * 3600;

/**
 * Status que ocupam o UNIQUE parcial (run_id, ordem) em
 * orbit_flow_scheduled_actions. `success` NÃO significa envio real: pode ser
 * skip/`missing_prior_real_outbound`. Nunca apagamos essa evidência; apenas
 * relatamos o motivo exato e não reinserimos a mesma ordem.
 */
const ACTIVE_SCHEDULED_STATUS = new Set(["pending", "running", "success"]);

/** Cancelamentos legítimos NUNCA são reativados nem reinseridos. */
const CANCELLED_SCHEDULED_STATUS = new Set(["cancelled", "canceled", "cancelado"]);

/**
 * Regras ATUAIS do flow aprovado (`orbit_flows.condicoes`) aplicadas ao payload
 * do evento REAL. Mesma semântica do dispatcher para `lead_recebido`.
 */
export function matchesApprovedTypebotFlowConditions(
  condicoes: Record<string, any> | null | undefined,
  payload: Record<string, any> | null | undefined,
): boolean {
  const c = condicoes ?? {};
  const p = payload ?? {};
  if (!c.source_id || !c.source_tipo) return false;
  if (p.source_id !== c.source_id) return false;
  if (p.source_tipo !== c.source_tipo) return false;
  const match = c.payload_match;
  if (!match || typeof match !== "object") return false;
  const raw = (p.raw ?? {}) as Record<string, any>;
  for (const [rawKey, expected] of Object.entries(match)) {
    const key = rawKey.startsWith("raw.") ? rawKey.slice(4) : rawKey;
    const actual = raw[key];
    if (Array.isArray(expected)) {
      if (!expected.includes(actual)) return false;
    } else if (String(actual ?? "") !== String(expected)) {
      return false;
    }
  }
  return true;
}



export interface FollowupActionRow {
  id?: string | null;
  flow_id?: string | null;
  ordem?: number | null;
  action_type?: string | null;
  delay_seconds?: number | null;
  action_config?: Record<string, any> | null;
}

export interface FollowupPlanItem {
  action_id: string;
  flow_id: string;
  ordem: number;
  action_type: string;
  action_config: Record<string, any>;
  delay_seconds: number;
  scheduled_for: string;
  cadence_key: string;
  template_id: string | null;
}

export interface FollowupSkip {
  action_id: string | null;
  reason: string;
}

export interface FollowupDecision {
  allowed: boolean;
  reason: string;
  /** Ações a agendar (vazio quando bloqueado). */
  plan: FollowupPlanItem[];
  skipped: FollowupSkip[];
  campaign_id?: string | null;
  batch_label?: string | null;
  flow_id?: string | null;
  run_id?: string | null;
  anchor_sent_at?: string | null;
  /**
   * Fallback auditável: nenhum run antigo existe, mas o EVENTO real do prospect
   * casa com as regras atuais do flow aprovado. Um novo run é criado apenas
   * como ÂNCORA (D0 nunca é reexecutado, nenhuma ação recebe status falso).
   */
  fallback_anchor?: {
    event_id: string;
    flow_id: string;
    reason: "no_prior_lead_recebido_run";
  } | null;
  /** Lembretes de reunião nunca são tocados por esta rotina. */
  preserve_meeting_reminders: true;
}

export interface FollowupFacts {
  empresa_id?: string | null;
  outbox?: {
    id?: string | null;
    empresa_id?: string | null;
    prospect_id?: string | null;
    conversa_id?: string | null;
    campaign_id?: string | null;
    source_type?: string | null;
    status?: string | null;
    provider_message_id?: string | null;
    sent_at?: string | null;
    metadata?: Record<string, unknown> | null;
  } | null;
  out_message?: {
    id?: string | null;
    empresa_id?: string | null;
    conversa_id?: string | null;
    campaign_id?: string | null;
    direcao?: string | null;
    status?: string | null;
    provider_message_id?: string | null;
    timestamp?: string | null;
  } | null;
  campaign?: {
    id?: string | null;
    empresa_id?: string | null;
    aprovacao_status?: string | null;
    filtros_json?: Record<string, any> | null;
  } | null;
  prospect?: {
    id?: string | null;
    empresa_id?: string | null;
    deleted_at?: string | null;
    optout_whatsapp?: boolean | null;
    whatsapp_status?: string | null;
  } | null;
  conversa?: {
    id?: string | null;
    empresa_id?: string | null;
    prospect_id?: string | null;
    human_talk?: boolean | null;
    human_user_id?: string | null;
    handoff_sent_at?: string | null;
    archived_at?: string | null;
    quarantine_reason?: string | null;
    status?: string | null;
  } | null;
  /** Run `lead_recebido` já existente da mesma empresa/prospect. */
  run?: {
    id?: string | null;
    empresa_id?: string | null;
    flow_id?: string | null;
    event_id?: string | null;
    entity_type?: string | null;
    entity_id?: string | null;
    context?: Record<string, any> | null;
  } | null;
  event?: {
    id?: string | null;
    empresa_id?: string | null;
    event_type?: string | null;
    entity_type?: string | null;
    entity_id?: string | null;
  } | null;
  /** Ações do flow ORIGINAL (nenhuma é criada ou reativada aqui). */
  actions?: FollowupActionRow[] | null;
  /** IN posterior ao envio real da campanha. */
  inbound_after_send_count?: number;
  future_meeting_count?: number;
  external_human_message_count?: number;
  terminal_deal?: boolean;
  /** cadence_keys já existentes em orbit_flow_scheduled_actions (qualquer status). */
  existing_cadence_keys?: string[];
  /** action_ids já agendados para o prospect (fallback de dedupe). */
  existing_action_ids?: string[];
  /** template_ids com envio REAL já aceito para este prospect. */
  accepted_template_ids?: string[];
  /**
   * Ordens já ocupadas no MESMO run (UNIQUE parcial run_id+ordem em
   * pending/running/success). `status` preservado para relatar o motivo exato.
   */
  existing_run_ordens?: Array<{ ordem: number; status?: string | null }>;
  /** Houve toque D1 REAL com template legado (individual ou grupo). */
  legacy_d1_touch_sent?: boolean;
  /**
   * FAIL-CLOSED: qualquer leitura de segurança que falhou (erro de query).
   * Preenchido, a reconstituição inteira é negada/adiada.
   */
  read_error?: string | null;
  /** action_ids com agendamento CANCELADO: nunca reativados. */
  cancelled_action_ids?: string[];
  /**
   * Fallback explícito: usado SOMENTE quando não existe run `lead_recebido`
   * antigo. Exige evento REAL do prospect + flow aprovado cujas regras atuais
   * casem exatamente com o payload do evento.
   */
  fallback_candidate?: {
    event?: {
      id?: string | null;
      empresa_id?: string | null;
      event_type?: string | null;
      entity_type?: string | null;
      entity_id?: string | null;
      payload?: Record<string, any> | null;
    } | null;
    flow?: {
      id?: string | null;
      empresa_id?: string | null;
      ativo?: boolean | null;
      trigger_type?: string | null;
      condicoes?: Record<string, any> | null;
    } | null;
  } | null;
}


function blocked(reason: string): FollowupDecision {
  return {
    allowed: false,
    reason,
    plan: [],
    skipped: [],
    preserve_meeting_reminders: true,
  };
}

/** Mesma identidade usada pelo executor em orbit_flow_scheduled_actions.cadence_key. */
export function followupCadenceKey(input: {
  empresa_id?: string | null;
  prospect_id?: string | null;
  flow_id?: string | null;
  action_id?: string | null;
}): string | null {
  const { empresa_id, prospect_id, flow_id, action_id } = input;
  if (!empresa_id || !prospect_id || !flow_id || !action_id) return null;
  return `cad:swt:${empresa_id}:${prospect_id}:${flow_id}:${action_id}`;
}

/** Ação aprovada da cadência controlada: nada é habilitado aqui. */
export function isApprovedControlledFollowupAction(action: FollowupActionRow): boolean {
  const cfg = action.action_config ?? {};
  return String(action.action_type ?? "") === "send_whatsapp_template" &&
    cfg.enabled === true &&
    cfg.viver_controlled_followup === true &&
    cfg.cancel_on_reply === true;
}

/**
 * Decisão pura, determinística e sem I/O. Fail-closed: qualquer evidência
 * ausente ou divergente bloqueia a reconstituição inteira.
 */
export function decideViverFollowupReconstitution(f: FollowupFacts): FollowupDecision {
  const empresaId = f.empresa_id ?? null;
  if (empresaId !== VIVER_FOLLOWUP_EMPRESA_ID) return blocked("not_viver_tenant");

  // ── 0. FAIL-CLOSED: leitura de segurança que falhou nega/adia tudo.
  if (f.read_error) return blocked("evidence_read_failed");

  // ── 1. Envio REAL de campanha controlada (outbox)
  const out = f.outbox ?? null;
  if (!out) return blocked("outbox_missing");
  if (out.empresa_id && out.empresa_id !== empresaId) return blocked("cross_tenant");
  if (String(out.source_type ?? "") !== "campaign") return blocked("outbox_not_campaign");
  if (String(out.status ?? "") !== "sent") return blocked("outbox_not_sent");
  if (!out.provider_message_id) return blocked("outbox_without_provider_message_id");
  if (!out.campaign_id) return blocked("outbox_without_campaign");
  if (!out.prospect_id) return blocked("outbox_without_prospect");
  if (out.metadata?.[VIVER_CONTROLLED_INBOUND_METADATA_KEY] !== true) {
    return blocked("outbox_without_controlled_marker");
  }
  const anchorMs = Date.parse(String(out.sent_at ?? ""));
  if (!Number.isFinite(anchorMs)) return blocked("outbox_sent_at_invalid");

  // ── 2. OUT correlacionada (mesmo provider + empresa + prospect + campanha)
  const msg = f.out_message ?? null;
  if (!msg) return blocked("out_message_missing");
  if (msg.empresa_id && msg.empresa_id !== empresaId) return blocked("cross_tenant");
  if (String(msg.direcao ?? "OUT").toUpperCase() !== "OUT") return blocked("out_not_outbound");
  if (!REAL_OUT_STATUS.has(String(msg.status ?? "").toLowerCase())) return blocked("out_not_sent");
  if (!msg.provider_message_id || msg.provider_message_id !== out.provider_message_id) {
    return blocked("out_provider_message_id_mismatch");
  }
  if (!msg.campaign_id || msg.campaign_id !== out.campaign_id) return blocked("campaign_mismatch");
  if (out.conversa_id && msg.conversa_id && msg.conversa_id !== out.conversa_id) {
    return blocked("out_other_conversation");
  }

  // ── 3. Campanha aprovada de um dos dois batches allowlisted
  const camp = f.campaign ?? null;
  if (!camp?.id) return blocked("campaign_missing");
  if (camp.id !== out.campaign_id) return blocked("campaign_mismatch");
  if (!isAuthorizedViverControlledCampaign(camp)) return blocked("campaign_not_authorized");
  const batchLabel = String(camp.filtros_json?.batch_label ?? "");

  // ── 4. Prospect / conversa / deal
  const p = f.prospect ?? null;
  if (!p?.id) return blocked("prospect_missing");
  if (p.id !== out.prospect_id) return blocked("prospect_mismatch");
  if (p.empresa_id && p.empresa_id !== empresaId) return blocked("cross_tenant");
  if (p.deleted_at) return blocked("prospect_deleted");
  if (p.optout_whatsapp === true) return blocked("opt_out");
  if (INVALID_WHATSAPP_STATUS.has(String(p.whatsapp_status ?? "").toLowerCase())) {
    return blocked("prospect_whatsapp_invalid");
  }
  if (f.terminal_deal === true) return blocked("terminal_deal");

  const c = f.conversa ?? null;
  if (!c?.id) return blocked("conversa_missing");
  if (c.empresa_id && c.empresa_id !== empresaId) return blocked("cross_tenant");
  if (c.prospect_id && c.prospect_id !== p.id) return blocked("conversa_other_prospect");
  if (c.human_talk === true || c.human_user_id) return blocked("human_owner");
  if (c.handoff_sent_at) return blocked("human_handoff");
  if (c.archived_at) return blocked("conversa_archived");
  if (c.quarantine_reason) return blocked("conversa_quarantined");
  if (c.status && CLOSED_CONVERSA_STATUS.has(String(c.status).toLowerCase())) {
    return blocked("conversa_closed");
  }
  if ((f.external_human_message_count ?? 0) > 0) return blocked("external_human_attendance");
  if ((f.inbound_after_send_count ?? 0) > 0) return blocked("lead_replied");
  // Reunião: para sem tocar em nenhum lembrete já agendado.
  if ((f.future_meeting_count ?? 0) > 0) return blocked("meeting_scheduled");

  // ── 5. Run/event `lead_recebido` do flow Typebot APROVADO (ou fallback ancorado)
  let effectiveRunId: string | null = null;
  let effectiveFlowId: string | null = null;
  let fallbackAnchor: FollowupDecision["fallback_anchor"] = null;

  const run = f.run ?? null;
  if (run?.id && run.flow_id) {
    if (run.empresa_id && run.empresa_id !== empresaId) return blocked("cross_tenant");
    if (String(run.entity_type ?? "prospect") !== "prospect") return blocked("run_entity_invalid");
    if (String(run.entity_id ?? "") !== String(p.id)) return blocked("run_other_prospect");
    if (!VIVER_APPROVED_TYPEBOT_FLOW_IDS.has(String(run.flow_id))) {
      return blocked("run_flow_not_approved_typebot");
    }
    const ev = f.event ?? null;
    if (!ev?.id) return blocked("lead_recebido_event_missing");
    if (run.event_id && String(run.event_id) !== String(ev.id)) return blocked("event_mismatch");
    if (ev.empresa_id && ev.empresa_id !== empresaId) return blocked("cross_tenant");
    if (String(ev.event_type ?? "") !== "lead_recebido") return blocked("event_not_lead_recebido");
    if (String(ev.entity_type ?? "prospect") !== "prospect") return blocked("event_entity_invalid");
    if (String(ev.entity_id ?? "") !== String(p.id)) return blocked("event_other_prospect");
    effectiveRunId = String(run.id);
    effectiveFlowId = String(run.flow_id);
  } else {
    // Fallback auditável: sem run antigo, exige EVENTO real + flow aprovado
    // cujas regras ATUAIS casem exatamente com o payload do evento. Nenhum run
    // antigo é inventado; nenhuma ação recebe status de executada.
    const fb = f.fallback_candidate ?? null;
    const fev = fb?.event ?? null;
    const fflow = fb?.flow ?? null;
    if (!fev?.id || !fflow?.id) return blocked("lead_recebido_run_missing");
    if (fev.empresa_id && fev.empresa_id !== empresaId) return blocked("cross_tenant");
    if (String(fev.event_type ?? "") !== "lead_recebido") return blocked("event_not_lead_recebido");
    if (String(fev.entity_type ?? "") !== "prospect") return blocked("event_entity_invalid");
    if (String(fev.entity_id ?? "") !== String(p.id)) return blocked("event_other_prospect");
    if (fflow.empresa_id && fflow.empresa_id !== empresaId) return blocked("cross_tenant");
    if (!VIVER_APPROVED_TYPEBOT_FLOW_IDS.has(String(fflow.id))) {
      return blocked("fallback_flow_not_approved_typebot");
    }
    if (fflow.ativo !== true) return blocked("fallback_flow_inactive");
    if (fflow.trigger_type && String(fflow.trigger_type) !== "lead_recebido") {
      return blocked("fallback_flow_trigger_invalid");
    }
    if (!matchesApprovedTypebotFlowConditions(fflow.condicoes, fev.payload)) {
      return blocked("fallback_flow_rules_mismatch");
    }
    effectiveRunId = null; // run âncora criado na execução, sem reexecutar D0
    effectiveFlowId = String(fflow.id);
    fallbackAnchor = {
      event_id: String(fev.id),
      flow_id: String(fflow.id),
      reason: "no_prior_lead_recebido_run",
    };
  }
  const anchorFlowId = String(effectiveFlowId);

  // ── 6. Plano: somente ações aprovadas do flow original, ancoradas no sent_at
  const actions = (f.actions ?? []).filter((a) => a && a.id);
  if (actions.length === 0) return blocked("flow_actions_missing");
  const existingKeys = new Set(f.existing_cadence_keys ?? []);
  const existingActions = new Set((f.existing_action_ids ?? []).map(String));
  const acceptedTemplates = new Set((f.accepted_template_ids ?? []).map(String));
  // Cancelamento legítimo nunca é reativado.
  const cancelledActions = new Set((f.cancelled_action_ids ?? []).map(String));
  // UNIQUE parcial (run_id, ordem): ordem ocupada não pode ser reinserida.
  const occupiedOrdens = new Map<number, string>();
  for (const row of f.existing_run_ordens ?? []) {
    const status = String(row?.status ?? "").toLowerCase();
    if (!ACTIVE_SCHEDULED_STATUS.has(status)) continue;
    occupiedOrdens.set(Number(row.ordem), status);
  }
  // Toque D1 já enviado com template legado (individual/grupo).
  const legacyD1Sent = f.legacy_d1_touch_sent === true ||
    [...acceptedTemplates].some((t) => VIVER_LEGACY_D1_TEMPLATE_IDS.has(t));

  const plan: FollowupPlanItem[] = [];
  const skipped: FollowupSkip[] = [];

  for (const action of actions) {
    const actionId = String(action.id);
    if (String(action.flow_id ?? anchorFlowId) !== anchorFlowId) {
      skipped.push({ action_id: actionId, reason: "action_other_flow" });
      continue;
    }
    if (!isApprovedControlledFollowupAction(action)) {
      skipped.push({ action_id: actionId, reason: "action_not_approved" });
      continue;
    }
    const delaySeconds = Number(action.delay_seconds ?? 0);
    if (!Number.isFinite(delaySeconds) || delaySeconds <= 0) {
      skipped.push({ action_id: actionId, reason: "delay_invalid" });
      continue;
    }
    const cadenceKey = followupCadenceKey({
      empresa_id: empresaId,
      prospect_id: p.id,
      flow_id: anchorFlowId,
      action_id: actionId,
    });
    if (!cadenceKey) {
      skipped.push({ action_id: actionId, reason: "cadence_key_unavailable" });
      continue;
    }
    if (cancelledActions.has(actionId)) {
      skipped.push({ action_id: actionId, reason: "cancelled_not_reactivated" });
      continue;
    }
    if (existingKeys.has(cadenceKey) || existingActions.has(actionId)) {
      skipped.push({ action_id: actionId, reason: "already_scheduled" });
      continue;
    }
    const ordem = Number(action.ordem ?? 0);
    const occupied = occupiedOrdens.get(ordem);
    if (occupied) {
      // `success` pode ser skip (ex.: missing_prior_real_outbound). Evidência
      // preservada; apenas não reinserimos a mesma ordem do mesmo run.
      skipped.push({
        action_id: actionId,
        reason: occupied === "success"
          ? "run_ordem_success_without_real_send"
          : `run_ordem_occupied_${occupied}`,
      });
      continue;
    }
    const cfg = action.action_config ?? {};
    const templateId = cfg.template_id == null ? null : String(cfg.template_id);
    if (templateId && acceptedTemplates.has(templateId)) {
      skipped.push({ action_id: actionId, reason: "touch_already_sent" });
      continue;
    }
    // Mesmo toque D1, template novo (áudio): não repetir.
    if (legacyD1Sent && delaySeconds <= D1_MAX_DELAY_SECONDS) {
      skipped.push({ action_id: actionId, reason: "legacy_d1_already_sent" });
      continue;
    }

    plan.push({
      action_id: actionId,
      flow_id: anchorFlowId,
      ordem: Number(action.ordem ?? 0),
      action_type: "send_whatsapp_template",
      action_config: cfg,
      delay_seconds: delaySeconds,
      // Âncora: envio REAL da campanha, nunca a criação antiga do lead.
      scheduled_for: new Date(anchorMs + delaySeconds * 1000).toISOString(),
      cadence_key: cadenceKey,
      template_id: templateId,
    });
  }

  if (plan.length === 0) {
    return {
      allowed: false,
      reason: "nothing_to_schedule",
      plan: [],
      skipped,
      campaign_id: camp.id,
      batch_label: batchLabel,
      flow_id: anchorFlowId,
      run_id: effectiveRunId,
      anchor_sent_at: new Date(anchorMs).toISOString(),
      fallback_anchor: fallbackAnchor,
      preserve_meeting_reminders: true,
    };
  }

  plan.sort((a, b) =>
    a.scheduled_for.localeCompare(b.scheduled_for) || a.ordem - b.ordem
  );

  return {
    allowed: true,
    reason: "viver_followup_reconstitution",
    plan,
    skipped,
    campaign_id: camp.id,
    batch_label: batchLabel,
    flow_id: anchorFlowId,
    run_id: effectiveRunId,
    anchor_sent_at: new Date(anchorMs).toISOString(),
    fallback_anchor: fallbackAnchor,
    preserve_meeting_reminders: true,
  };
}

// ─────────────────────────────────────────────────────────────
// Coleta de evidências (somente o necessário) + execução idempotente
// ─────────────────────────────────────────────────────────────

async function loadFacts(
  supabase: any,
  outboxRow: any,
): Promise<FollowupFacts> {
  const empresaId = VIVER_FOLLOWUP_EMPRESA_ID;
  const prospectId = outboxRow?.prospect_id ?? null;
  // FAIL-CLOSED: qualquer leitura de segurança que falhe é registrada e faz a
  // decisão negar/adiar. Nunca liberamos agendamento com evidência incompleta.
  const readErrors: string[] = [];
  const take = <T>(label: string, res: any, fallback: T): T => {
    if (res?.error) {
      readErrors.push(label);
      return fallback;
    }
    return (res?.data ?? fallback) as T;
  };

  const [outMsgsRes, campaignRes, prospectRes] = await Promise.all([
    supabase
      .from("orbit_mensagens")
      .select("id, empresa_id, conversa_id, campaign_id, direcao, status, provider_message_id, timestamp")
      .eq("empresa_id", empresaId)
      .eq("campaign_id", outboxRow.campaign_id)
      .eq("provider_message_id", outboxRow.provider_message_id)
      .eq("direcao", "OUT")
      .limit(5),
    supabase
      .from("orbit_campaigns")
      .select("id, empresa_id, aprovacao_status, filtros_json")
      .eq("id", outboxRow.campaign_id)
      .eq("empresa_id", empresaId)
      .maybeSingle(),
    supabase
      .from("orbit_prospects")
      .select("id, empresa_id, deleted_at, optout_whatsapp, whatsapp_status")
      .eq("id", prospectId)
      .eq("empresa_id", empresaId)
      .maybeSingle(),
  ]);
  const outMsgs = take<any[]>("out_messages", outMsgsRes, []);
  const campaign = take<any>("campaign", campaignRes, null);
  const prospect = take<any>("prospect", prospectRes, null);

  const outMessage = (outMsgs ?? [])[0] ?? null;
  const conversaId = outboxRow.conversa_id ?? outMessage?.conversa_id ?? null;

  const conversa = conversaId
    ? take<any>(
      "conversa",
      await supabase
        .from("orbit_conversas")
        .select("id, empresa_id, prospect_id, human_talk, human_user_id, handoff_sent_at, archived_at, quarantine_reason, status")
        .eq("id", conversaId)
        .eq("empresa_id", empresaId)
        .maybeSingle(),
      null,
    )
    : null;

  // Run lead_recebido existente da mesma empresa/prospect (flow original).
  const runs = take<any[]>(
    "flow_runs",
    await supabase
      .from("orbit_flow_runs")
      .select("id, empresa_id, flow_id, event_id, entity_type, entity_id, created_at")
      .eq("empresa_id", empresaId)
      .eq("entity_type", "prospect")
      .eq("entity_id", prospectId)
      .order("created_at", { ascending: false })
      .limit(10),
    [],
  );

  let run: any = null;
  let event: any = null;
  for (const candidate of runs ?? []) {
    if (!candidate?.event_id || !candidate?.flow_id) continue;
    if (!VIVER_APPROVED_TYPEBOT_FLOW_IDS.has(String(candidate.flow_id))) continue;
    const ev = take<any>(
      "flow_event",
      await supabase
        .from("orbit_flow_events")
        .select("id, empresa_id, event_type, entity_type, entity_id")
        .eq("id", candidate.event_id)
        .eq("empresa_id", empresaId)
        .maybeSingle(),
      null,
    );
    if (ev?.event_type === "lead_recebido") {
      run = candidate;
      event = ev;
      break;
    }
  }

  // Fallback auditável: sem run antigo de flow aprovado, procuramos o EVENTO
  // REAL `lead_recebido` do prospect e o flow aprovado cujas regras atuais
  // casem exatamente com o payload. Nenhum run antigo é inventado.
  let fallbackCandidate: FollowupFacts["fallback_candidate"] = null;
  if (!run) {
    const events = take<any[]>(
      "fallback_events",
      await supabase
        .from("orbit_flow_events")
        .select("id, empresa_id, event_type, entity_type, entity_id, payload, created_at")
        .eq("empresa_id", empresaId)
        .eq("event_type", "lead_recebido")
        .eq("entity_type", "prospect")
        .eq("entity_id", prospectId)
        .order("created_at", { ascending: false })
        .limit(5),
      [],
    );
    const flows = events.length > 0
      ? take<any[]>(
        "fallback_flows",
        await supabase
          .from("orbit_flows")
          .select("id, empresa_id, ativo, trigger_type, condicoes")
          .eq("empresa_id", empresaId)
          .in("id", [...VIVER_APPROVED_TYPEBOT_FLOW_IDS]),
        [],
      )
      : [];
    outer: for (const ev of events) {
      for (const flow of flows) {
        if (flow?.ativo !== true) continue;
        if (String(flow?.trigger_type ?? "lead_recebido") !== "lead_recebido") continue;
        if (matchesApprovedTypebotFlowConditions(flow?.condicoes, ev?.payload)) {
          fallbackCandidate = { event: ev, flow };
          break outer;
        }
      }
    }
  }

  const anchorFlowId = run?.flow_id ?? fallbackCandidate?.flow?.id ?? null;
  const actions = anchorFlowId
    ? take<any[]>(
      "flow_actions",
      await supabase
        .from("orbit_flow_actions")
        .select("id, flow_id, ordem, action_type, action_config, delay_seconds")
        .eq("flow_id", anchorFlowId)
        .order("ordem", { ascending: true }),
      [],
    )
    : [];

  // Resposta do lead posterior ao envio real.
  const inbound = conversaId
    ? take<any[]>(
      "inbound_after_send",
      await supabase
        .from("orbit_mensagens")
        .select("id")
        .eq("empresa_id", empresaId)
        .eq("conversa_id", conversaId)
        .eq("direcao", "IN")
        .gt("timestamp", outboxRow.sent_at)
        .limit(1),
      [],
    )
    : [];

  const humanMsgs = conversaId
    ? take<any[]>(
      "human_messages",
      await supabase
        .from("orbit_mensagens")
        .select("id")
        .eq("empresa_id", empresaId)
        .eq("conversa_id", conversaId)
        .in("sender_type", ["human_phone", "human_orbit"])
        .limit(1),
      [],
    )
    : [];

  const meetings = take<any[]>(
    "meetings",
    await supabase
      .from("orbit_meetings")
      .select("id, status, scheduled_at")
      .eq("empresa_id", empresaId)
      .eq("prospect_id", prospectId)
      .gte("scheduled_at", new Date().toISOString())
      .limit(10),
    [],
  );
  const futureMeetingCount = (meetings ?? [])
    .filter((m: any) => !["cancelled", "canceled", "cancelada"].includes(String(m?.status ?? "").toLowerCase()))
    .length;

  const deals = take<any[]>(
    "deals",
    await supabase
      .from("orbit_deals")
      .select("id, status, deleted_at")
      .eq("empresa_id", empresaId)
      .eq("prospect_id", prospectId)
      .limit(10),
    [],
  );
  const terminalDeal = (deals ?? []).some((d: any) =>
    d?.deleted_at ||
    ["won", "lost", "ganho", "perdido", "deleted"].includes(String(d?.status ?? "").toLowerCase())
  );

  // Dedupe: agendamentos já existentes do prospect (qualquer status) e ordens
  // ocupadas no MESMO run (UNIQUE parcial run_id+ordem).
  const scheduled = take<any[]>(
    "scheduled_actions",
    await supabase
      .from("orbit_flow_scheduled_actions")
      .select("id, run_id, action_id, ordem, cadence_key, status")
      .eq("empresa_id", empresaId)
      .eq("prospect_id", prospectId)
      .limit(200),
    [],
  );
  const runOrdens = (scheduled ?? [])
    .filter((r: any) => run?.id && String(r?.run_id ?? "") === String(run.id))
    .map((r: any) => ({ ordem: Number(r?.ordem ?? -1), status: r?.status ?? null }))
    .filter((r: any) => Number.isFinite(r.ordem) && r.ordem >= 0);
  const cancelledActionIds = (scheduled ?? [])
    .filter((r: any) => CANCELLED_SCHEDULED_STATUS.has(String(r?.status ?? "").toLowerCase()))
    .map((r: any) => r?.action_id)
    .filter(Boolean)
    .map(String);

  // Dedupe por TOQUE REAL já aceito: somente outbox efetivamente `sent` com
  // confirmação do provedor. Pendentes/failed/canceled não contam como toque.
  const followupOutbox = take<any[]>(
    "followup_outbox",
    await supabase
      .from("orbit_whatsapp_outbox")
      .select("id, status, source_id, provider_message_id, payload")
      .eq("empresa_id", empresaId)
      .eq("prospect_id", prospectId)
      .in("source_type", ["flow_followup", "flow_initial"])
      .limit(200),
    [],
  );
  const acceptedTemplates: string[] = [];
  const acceptedActionIds: string[] = [];
  for (const row of followupOutbox ?? []) {
    const status = String(row?.status ?? "").toLowerCase();
    if (DEAD_OUTBOX_STATUS.has(status)) continue;
    if (status !== "sent" || !row?.provider_message_id) continue;
    const tpl = row?.payload?.template_id;
    if (tpl) acceptedTemplates.push(String(tpl));
    if (row?.source_id) acceptedActionIds.push(String(row.source_id));
  }
  const legacyD1Sent = acceptedTemplates.some((t) =>
    VIVER_LEGACY_D1_TEMPLATE_IDS.has(t)
  );

  return {
    empresa_id: empresaId,
    outbox: outboxRow,
    out_message: outMessage,
    campaign: campaign ?? null,
    prospect: prospect ?? null,
    conversa: conversa ?? null,
    run,
    event,
    fallback_candidate: fallbackCandidate,
    actions: (actions ?? []) as FollowupActionRow[],
    inbound_after_send_count: (inbound ?? []).length,
    external_human_message_count: (humanMsgs ?? []).length,
    future_meeting_count: futureMeetingCount,
    terminal_deal: terminalDeal,
    existing_cadence_keys: (scheduled ?? [])
      .map((r: any) => r?.cadence_key)
      .filter(Boolean)
      .map(String),
    existing_action_ids: [
      ...(scheduled ?? []).map((r: any) => r?.action_id).filter(Boolean).map(String),
      ...acceptedActionIds,
    ],
    cancelled_action_ids: cancelledActionIds,
    accepted_template_ids: acceptedTemplates,
    existing_run_ordens: runOrdens,
    legacy_d1_touch_sent: legacyD1Sent,
    read_error: readErrors.length > 0 ? readErrors.join(",") : null,
  };
}

export interface ReconstitutionResult {
  ok: boolean;
  reason: string;
  scheduled_ids: string[];
  planned: number;
  deduped: number;
  skipped: FollowupSkip[];
}

/**
 * Chamada no caminho do envio confirmado e também pela reconciliação do tick.
 * Idempotente: reexecuções não criam agendamento novo (dedupe por cadence_key).
 */
export async function reconstituteViverControlledFollowups(
  supabase: any,
  params: { empresa_id: string; outbox_id: string },
): Promise<ReconstitutionResult> {
  const empty = (reason: string): ReconstitutionResult => ({
    ok: false,
    reason,
    scheduled_ids: [],
    planned: 0,
    deduped: 0,
    skipped: [],
  });
  if (params.empresa_id !== VIVER_FOLLOWUP_EMPRESA_ID) return empty("not_viver_tenant");

  try {
    const { data: outboxRow, error: outboxError } = await supabase
      .from("orbit_whatsapp_outbox")
      .select("id, empresa_id, prospect_id, conversa_id, campaign_id, source_type, status, provider_message_id, sent_at, metadata")
      .eq("id", params.outbox_id)
      .eq("empresa_id", params.empresa_id)
      .maybeSingle();
    if (outboxError) return empty("evidence_read_failed");
    if (!outboxRow) return empty("outbox_missing");
    if (
      String(outboxRow.source_type ?? "") !== "campaign" ||
      String(outboxRow.status ?? "") !== "sent" ||
      !outboxRow.provider_message_id || !outboxRow.campaign_id || !outboxRow.prospect_id
    ) {
      return empty("outbox_not_eligible");
    }

    const facts = await loadFacts(supabase, outboxRow);
    const decision = decideViverFollowupReconstitution(facts);
    if (!decision.allowed) {
      return {
        ok: false,
        reason: decision.reason,
        scheduled_ids: [],
        planned: 0,
        deduped: 0,
        skipped: decision.skipped,
      };
    }

    // Fallback auditável: sem run antigo, criamos um run ÂNCORA. Status
    // `skipped` deixa explícito que NADA foi executado (D0 não é reexecutado e
    // nenhuma ação recebe status falso de envio).
    let runId = decision.run_id ?? null;
    if (!runId) {
      const anchor = decision.fallback_anchor;
      if (!anchor) return empty("anchor_run_unavailable");
      const { data: newRun, error: runError } = await supabase
        .from("orbit_flow_runs")
        .insert({
          empresa_id: VIVER_FOLLOWUP_EMPRESA_ID,
          flow_id: anchor.flow_id,
          event_id: anchor.event_id,
          entity_type: "prospect",
          entity_id: facts.prospect?.id ?? null,
          status: "skipped",
          context: {
            viver_followup_fallback_anchor: {
              version: VIVER_FOLLOWUP_RECONSTITUTION_VERSION,
              reason: anchor.reason,
              event_id: anchor.event_id,
              campaign_id: decision.campaign_id,
              batch_label: decision.batch_label,
              anchor_sent_at: decision.anchor_sent_at,
              d0_not_executed: true,
              actions_not_executed: true,
            },
          },
        })
        .select("id")
        .maybeSingle();
      if (runError || !(newRun as any)?.id) return empty("anchor_run_insert_failed");
      runId = String((newRun as any).id);
    }

    const scheduledIds: string[] = [];
    let deduped = 0;
    for (const item of decision.plan) {
      const { data, error } = await supabase
        .from("orbit_flow_scheduled_actions")
        .insert({
          empresa_id: VIVER_FOLLOWUP_EMPRESA_ID,
          run_id: runId,
          flow_id: item.flow_id,
          action_id: item.action_id,
          ordem: item.ordem,
          action_type: item.action_type,
          action_config: item.action_config,
          context: {
            payload: { prospect_id: facts.prospect?.id ?? null },
            entity_type: "prospect",
            entity_id: facts.prospect?.id ?? null,
            event_id: facts.event?.id ?? null,
            viver_followup_reconstitution: {
              version: VIVER_FOLLOWUP_RECONSTITUTION_VERSION,
              outbox_id: outboxRow.id,
              campaign_id: decision.campaign_id,
              batch_label: decision.batch_label,
              anchor_sent_at: decision.anchor_sent_at,
              provider_message_id: outboxRow.provider_message_id,
            },
          },
          prospect_id: facts.prospect?.id ?? null,
          scheduled_for: item.scheduled_for,
          status: "pending",
          cadence_key: item.cadence_key,
        })
        .select("id")
        .maybeSingle();
      if (error) {
        if (String((error as any).code) === "23505") {
          deduped++;
          continue;
        }
        console.warn("[viver-followup] insert falhou", (error as any).message);
        continue;
      }
      if ((data as any)?.id) scheduledIds.push(String((data as any).id));
    }

    try {
      await supabase.from("orbit_audit_log").insert({
        empresa_id: VIVER_FOLLOWUP_EMPRESA_ID,
        acao: "viver_followup_reconstitution",
        entidade: "orbit_whatsapp_outbox",
        entidade_id: outboxRow.id,
        detalhes: {
          version: VIVER_FOLLOWUP_RECONSTITUTION_VERSION,
          campaign_id: decision.campaign_id,
          batch_label: decision.batch_label,
          flow_id: decision.flow_id,
          run_id: decision.run_id,
          anchor_sent_at: decision.anchor_sent_at,
          scheduled_ids: scheduledIds,
          deduped,
          skipped: decision.skipped,
        },
      });
    } catch (_e) { /* auditoria best-effort */ }

    return {
      ok: scheduledIds.length > 0 || deduped > 0,
      reason: decision.reason,
      scheduled_ids: scheduledIds,
      planned: decision.plan.length,
      deduped,
      skipped: decision.skipped,
    };
  } catch (e) {
    console.warn(
      "[viver-followup] reconstituição falhou",
      e instanceof Error ? e.message : String(e),
    );
    return empty("reconstitution_failed");
  }
}

/**
 * Reconciliação idempotente executada pelo tick existente (sem cron novo):
 * cobre falha entre o envio confirmado e o agendamento.
 */
export async function reconcileViverControlledFollowups(
  supabase: any,
  empresa_id: string,
  opts: { lookbackMs?: number; maxCandidates?: number; maxRuns?: number } = {},
): Promise<{ candidates: number; reconstituted: number }> {
  if (empresa_id !== VIVER_FOLLOWUP_EMPRESA_ID) return { candidates: 0, reconstituted: 0 };
  const lookback = opts.lookbackMs ?? 14 * 24 * 60 * 60 * 1000;
  const maxCandidates = opts.maxCandidates ?? 20;
  const maxRuns = opts.maxRuns ?? 5;

  try {
    const { data: rows } = await supabase
      .from("orbit_whatsapp_outbox")
      .select("id, prospect_id, sent_at")
      .eq("empresa_id", empresa_id)
      .eq("source_type", "campaign")
      .eq("status", "sent")
      .not("provider_message_id", "is", null)
      .gte("sent_at", new Date(Date.now() - lookback).toISOString())
      .order("sent_at", { ascending: false })
      .limit(maxCandidates);
    const candidates = ((rows ?? []) as any[]).filter((r) => r?.prospect_id);
    if (candidates.length === 0) return { candidates: 0, reconstituted: 0 };

    // Uma única leitura para descartar prospects que já possuem cadência.
    const { data: scheduled } = await supabase
      .from("orbit_flow_scheduled_actions")
      .select("prospect_id")
      .eq("empresa_id", empresa_id)
      .in("prospect_id", candidates.map((r) => r.prospect_id))
      .limit(500);
    const already = new Set(
      ((scheduled ?? []) as any[]).map((r) => String(r?.prospect_id ?? "")),
    );

    let reconstituted = 0;
    let runs = 0;
    for (const row of candidates) {
      if (runs >= maxRuns) break;
      if (already.has(String(row.prospect_id))) continue;
      runs++;
      const r = await reconstituteViverControlledFollowups(supabase, {
        empresa_id,
        outbox_id: row.id,
      });
      if (r.ok) reconstituted++;
    }
    return { candidates: candidates.length, reconstituted };
  } catch (e) {
    console.warn(
      "[viver-followup] reconciliação falhou",
      e instanceof Error ? e.message : String(e),
    );
    return { candidates: 0, reconstituted: 0 };
  }
}

// ─────────────────────────────────────────────────────────────
// PROVA server-side exigida para dispensar o corte temporal no follow-up
// ─────────────────────────────────────────────────────────────

export interface FollowupProof {
  allowed: boolean;
  reason: string;
  campaign_id?: string | null;
  batch_label?: string | null;
}

/**
 * Revalidação usada pelo executor (enqueue) e pelo worker (pré-envio).
 * Exige campanha aprovada de batch allowlisted + outbox `sent` correlacionado
 * por provider/empresa/prospect/campanha + OUT real + run/event lead_recebido.
 * O marcador booleano em metadata JAMAIS é suficiente.
 */
export async function proveViverControlledFollowup(
  supabase: any,
  input: { empresa_id?: string | null; prospect_id?: string | null; conversa_id?: string | null },
): Promise<FollowupProof> {
  if ((input.empresa_id ?? null) !== VIVER_FOLLOWUP_EMPRESA_ID) {
    return { allowed: false, reason: "not_viver_tenant" };
  }
  if (!input.prospect_id) return { allowed: false, reason: "context_incomplete" };

  try {
    const { data: rows } = await supabase
      .from("orbit_whatsapp_outbox")
      .select("id, empresa_id, prospect_id, conversa_id, campaign_id, source_type, status, provider_message_id, sent_at, metadata")
      .eq("empresa_id", VIVER_FOLLOWUP_EMPRESA_ID)
      .eq("prospect_id", input.prospect_id)
      .eq("source_type", "campaign")
      .eq("status", "sent")
      .not("provider_message_id", "is", null)
      .order("sent_at", { ascending: false })
      .limit(5);

    for (const outboxRow of (rows ?? []) as any[]) {
      const facts = await loadFacts(supabase, outboxRow);
      // A prova valida evidência de campanha/OUT/run; o plano em si (dedupe,
      // ações restantes) não é requisito para autorizar o toque já agendado.
      const decision = decideViverFollowupReconstitution(facts);
      const proven = decision.allowed || decision.reason === "nothing_to_schedule";
      if (proven) {
        return {
          allowed: true,
          reason: "viver_controlled_followup_proven",
          campaign_id: decision.campaign_id ?? null,
          batch_label: decision.batch_label ?? null,
        };
      }
    }
    return { allowed: false, reason: "controlled_campaign_proof_missing" };
  } catch (_e) {
    return { allowed: false, reason: "controlled_followup_proof_failed" };
  }
}
