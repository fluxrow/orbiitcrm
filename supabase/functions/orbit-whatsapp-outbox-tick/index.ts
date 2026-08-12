// orbit-whatsapp-outbox-tick
// Worker cron da fila global de WhatsApp. Autenticado via SCHEDULER_CRON_TOKEN.
// Consome orbit_whatsapp_outbox por tenant, respeitando ritmo/quota,
// kill switch envio_real_liberado e outbox_adapter_enabled (para campanhas).
//
// SEGURANÇA: qualquer bloqueio impede o envio Z-API e registra auditoria.
// Este worker também aceita { outbox_id, empresa_id } no body para processar
// imediatamente um item de alta prioridade (ai_reply / manual) recém-enfileirado.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getOrbitZapiRuntimeConfig, getOrbitZapiRealSendBlockReason } from "../_shared/orbit-zapi.ts";
import { auditZapiSendAttempt } from "../_shared/zapi-audit.ts";
import { signOrbitMediaUrl } from "../_shared/orbit-media.ts";
import { checkEligibility } from "../_shared/orbit-whatsapp-outbox.ts";
import { checkCampaignRecipientEligibility } from "../_shared/campaign-safety.ts";
import {
  saoPauloDayStartIso,
  effectiveDailyLimit,
  nextAttemptForRetain,
  RETAIN_REASON_DAILY,
  RETAIN_REASON_RATE,
  type EffectiveLimit,
} from "../_shared/outbox-quota.ts";
import {
  countEngagedReserveUsedToday,
  countEngagedReserveUsedTodayForConversa,
  engagedReserveLimit,
  evaluateEngagedReserve,
  isEngagedReserveCandidate,
  markEngagedReserveUse,
  auditEngagedReserveUsage,
  ENGAGED_RESERVE_CONVERSA_LIMIT,
  RETAIN_REASON_RESERVE_CONVERSA,
  RETAIN_REASON_RESERVE_DAILY,
} from "../_shared/engaged-reply-reserve.ts";
import {
  evaluateHoldGate,
  lastRecoverySentAtMs,
  recoveryTagOf,
  revalidateRecoveryTarget,
  parseHoldUntilMs,
  OUTBOX_HOLD_REASON,
  RECOVERY_SPACING_REASON,
  DEFAULT_RECOVERY_SPACING_SECONDS,
} from "../_shared/outbox-hold.ts";



const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_TOKEN = Deno.env.get("SCHEDULER_CRON_TOKEN") ?? "";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const WORKER_ID = `outbox-${crypto.randomUUID().slice(0, 8)}`;

// Janela comercial para sources não urgentes
const BUSINESS_TZ = "America/Sao_Paulo";
const BUSINESS_HOUR_START = 8;
const BUSINESS_HOUR_END = 20;
const URGENT_SOURCES = new Set(["ai_reply", "meeting_confirmation", "manual"]);

function nowInBusinessWindow(): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TZ,
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  return h >= BUSINESS_HOUR_START && h < BUSINESS_HOUR_END;
}

interface SendingConfig {
  enabled: boolean;
  daily_limit: number | null;
  max_per_minute: number | null;
  min_delay_ms: number | null;
  max_delay_ms: number | null;
  warmup_enabled: boolean | null;
  warmup_start_date: string | null;
  outbox_adapter_enabled: boolean;
  batch_size: number | null;
}

async function getSendingConfig(empresa_id: string): Promise<SendingConfig | null> {
  const { data } = await supabase
    .from("orbit_whatsapp_sending_config")
    .select("enabled, daily_limit, max_per_minute, min_delay_ms, max_delay_ms, warmup_enabled, warmup_start_date, outbox_adapter_enabled, batch_size")
    .eq("empresa_id", empresa_id)
    .maybeSingle();
  return (data as SendingConfig) ?? null;
}

async function getDailyUsage(empresa_id: string): Promise<number> {
  // Cota diária de warm-up: conta TODOS os envios reais do tenant no dia,
  // qualquer source_type e qualquer payload_type. Sem bypass por origem.
  const { count, error } = await supabase
    .from("orbit_whatsapp_outbox")
    .select("id", { count: "exact", head: true })
    .eq("empresa_id", empresa_id)
    .eq("status", "sent")
    .gte("sent_at", saoPauloDayStartIso());
  if (error) throw new Error(`daily_usage_query_failed: ${error.message}`);
  return Number(count ?? 0);
}

async function bumpDailyUsage(empresa_id: string, delta: number): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const { data: existing } = await supabase
    .from("orbit_whatsapp_daily_usage")
    .select("id, sent_count")
    .eq("empresa_id", empresa_id)
    .eq("usage_date", today)
    .maybeSingle();
  if (existing) {
    await supabase
      .from("orbit_whatsapp_daily_usage")
      .update({ sent_count: Number((existing as any).sent_count ?? 0) + delta, updated_at: new Date().toISOString() })
      .eq("id", (existing as any).id);
  } else {
    await supabase.from("orbit_whatsapp_daily_usage").insert({
      empresa_id,
      usage_date: today,
      sent_count: delta,
    });
  }
}

async function countRecentSends(empresa_id: string, seconds: number): Promise<number> {
  const since = new Date(Date.now() - seconds * 1000).toISOString();
  const { count } = await supabase
    .from("orbit_whatsapp_outbox")
    .select("id", { count: "exact", head: true })
    .eq("empresa_id", empresa_id)
    .eq("status", "sent")
    .gte("sent_at", since);
  return Number(count ?? 0);
}

interface QuotaState {
  limitInfo: EffectiveLimit;
  remainingDaily: number;
  remainingMinute: number;
  /** Reserva separada de respostas engajadas (ai_reply com inbound real). */
  remainingReserve?: number;
}


interface ProcessResult {
  outcome: "sent" | "simulated" | "canceled" | "failed" | "deferred" | "blocked" | "retained";
  reason?: string;
  provider_message_id?: string | null;
  status_message?: string;
}

async function sendViaZapi(item: any, telefone: string, config: any): Promise<{ ok: boolean; providerId?: string | null; error?: string }> {
  const base = `https://api.z-api.io/instances/${config.instance_id}/token/${config.token}`;
  const headers = { "Content-Type": "application/json", "Client-Token": config.client_token || "" };
  const payload = item.payload || {};
  let url = `${base}/send-text`;
  let body: any = { phone: telefone, message: payload.mensagem ?? "" };

  // Padroniza em url_midia; aceita legado payload.url e storage_path.
  // A signed URL é gerada AQUI (momento do processamento) com TTL de 6h para
  // tolerar retries do item sem expirar no meio da entrega.
  const mediaSource = payload.storage_path || payload.url_midia || payload.url || null;
  const mediaUrl = mediaSource ? await signOrbitMediaUrl(supabase, mediaSource, 21600) : null;


  if (item.payload_type === "image" && mediaUrl) {
    url = `${base}/send-image`;
    body = { phone: telefone, image: mediaUrl, caption: payload.mensagem || "" };
  } else if (item.payload_type === "audio" && mediaUrl) {
    url = `${base}/send-audio`;
    body = { phone: telefone, audio: mediaUrl };
  } else if (item.payload_type === "document" && mediaUrl) {
    url = `${base}/send-document`;
    const fileName = (mediaUrl as string).split("?")[0].split("/").pop() || "documento";
    body = { phone: telefone, document: mediaUrl, fileName };
  } else if (item.payload_type === "video" && mediaUrl) {
    url = `${base}/send-video`;
    body = { phone: telefone, video: mediaUrl, caption: payload.mensagem || "" };
  }

  try {
    const resp = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) return { ok: false, error: `Z-API ${resp.status}: ${JSON.stringify(json).slice(0, 300)}` };
    return { ok: true, providerId: json.messageId ?? null };
  } catch (e) {
    return { ok: false, error: `Z-API exception: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ── Persistência unificada em orbit_mensagens ──
// Se o produtor criou orbit_mensagens.status='queued' e passou metadata.orbit_message_id,
// o worker UPDATE essa mesma linha (sem INSERT duplicado). Fallback: INSERT quando
// orbit_message_id não vier (garante backward-compat).
async function upsertVisualMensagem(
  item: any,
  patch: { status: string; provider_message_id?: string | null; erro?: string | null },
) {
  const orbitMsgId: string | null = item.metadata?.orbit_message_id ?? null;
  if (!item.conversa_id) return;
  if (orbitMsgId) {
    const { data, error } = await supabase
      .from("orbit_mensagens")
      .update({
        status: patch.status,
        provider_message_id: patch.provider_message_id ?? null,
        erro: patch.erro ?? null,
      })
      .eq("id", orbitMsgId)
      .select("id")
      .maybeSingle();
    if (!error && data) return;
    console.warn("[outbox] upsertVisualMensagem update sem match, fallback INSERT", error?.message);
  }
  await supabase.from("orbit_mensagens").insert({
    conversa_id: item.conversa_id,
    direcao: "OUT",
    mensagem: item.payload?.mensagem ?? "",
    canal: "whatsapp",
    status: patch.status,
    provider_message_id: patch.provider_message_id ?? null,
    erro: patch.erro ?? null,
    empresa_id: item.empresa_id,
    tipo_midia: item.payload_type !== "text" ? item.payload_type : null,
    url_midia: item.payload?.url_midia ?? item.payload?.url ?? null,
    storage_path: item.payload?.storage_path ?? null,
    campaign_id: item.campaign_id ?? null,
  });
}

// ── Recipient lifecycle (source_type=campaign) ──
// source_id do outbox = orbit_campaign_recipients.id. Fail-safe: se não houver
// source_id, ignora.
async function updateCampaignRecipient(
  item: any,
  patch: { status: "enviado" | "simulated" | "falhou" | "ignorado"; erro?: string | null; motivo?: string | null },
): Promise<void> {
  if (item.source_type !== "campaign" || !item.source_id) return;
  const upd: Record<string, unknown> = { erro: patch.erro ?? null };
  if (patch.status === "enviado") {
    upd.status = "enviado";
    upd.enviado_em = new Date().toISOString();
    upd.erro = null;
  } else if (patch.status === "simulated") {
    upd.status = "simulated";
    upd.enviado_em = new Date().toISOString();
    upd.erro = null;
  } else if (patch.status === "ignorado") {
    upd.status = "ignorado";
    upd.ignorado_em = new Date().toISOString();
    upd.ignorado_motivo = patch.motivo ?? "worker_cancel";
    upd.erro = null;
  } else {
    upd.status = "falhou";
  }
  await supabase
    .from("orbit_campaign_recipients")
    .update(upd)
    .eq("id", item.source_id)
    .eq("campaign_id", item.campaign_id)
    .in("status", ["pendente", "enviando"]);
  if (item.campaign_id) {
    try {
      await supabase.rpc("reconcile_campaign_counters", { _campaign_id: item.campaign_id });
    } catch (e) {
      console.warn("[outbox] reconcile falhou", (e as any)?.message);
    }
  }
}

// Resolve ou cria conversa tenant-safe antes de persistir OUT para campanhas.
// Sem esse passo, mensagens de campanha ficariam sem conversa e a resposta inbound
// não caía na mesma thread.
async function ensureCampaignConversa(item: any, telefone: string): Promise<string | null> {
  if (item.source_type !== "campaign" || !item.empresa_id || !item.prospect_id) {
    return item.conversa_id ?? null;
  }
  if (item.conversa_id) return item.conversa_id;

  const { data: existing } = await supabase
    .from("orbit_conversas")
    .select("id")
    .eq("empresa_id", item.empresa_id)
    .eq("prospect_id", item.prospect_id)
    .eq("status", "aberta")
    .maybeSingle();
  if (existing?.id) {
    item.conversa_id = existing.id;
    return existing.id;
  }
  const { data: nova } = await supabase
    .from("orbit_conversas")
    .insert({
      empresa_id: item.empresa_id,
      prospect_id: item.prospect_id,
      canal: "whatsapp",
      telefone_whatsapp: telefone,
      status: "aberta",
      ultima_mensagem_at: new Date().toISOString(),
      ai_contexto: {
        origin: "outbound_campaign",
        campaign_id: item.campaign_id ?? null,
        intro_already_sent: true,
        estado: "aguardando_resposta",
      },
    })
    .select("id")
    .maybeSingle();
  item.conversa_id = nova?.id ?? null;
  return item.conversa_id;
}

// Retém item na fila (queued) quando a cota de warm-up ou o ritmo por minuto
// foram atingidos. NUNCA marca falha: status volta a pending com next_attempt_at
// na próxima janela e razão estruturada em last_error + metadata.retained.
async function retainItem(item: any, reason: string, limitInfo: EffectiveLimit): Promise<void> {
  const nowIso = new Date().toISOString();
  const metadata = {
    ...(item.metadata ?? {}),
    retained: {
      reason,
      at: nowIso,
      warmup_day: limitInfo.warmup_day,
      effective_daily_limit: limitInfo.limit,
      limit_source: limitInfo.source,
    },
  };
  await supabase
    .from("orbit_whatsapp_outbox")
    .update({
      status: "pending",
      locked_at: null,
      locked_by: null,
      next_attempt_at: nextAttemptForRetain(reason),
      last_error: reason,
      metadata,
    })
    .eq("id", item.id);
}

// Retém em lote os pendentes do tenant sem nenhum claim/fetch externo.
async function retainPendingForTenant(empresa_id: string, reason: string, limitInfo: EffectiveLimit, max = 100): Promise<number> {
  const nowIso = new Date().toISOString();
  const { data: pend } = await supabase
    .from("orbit_whatsapp_outbox")
    .select("id, empresa_id, source_type, metadata")
    .eq("empresa_id", empresa_id)
    .eq("status", "pending")
    .lte("scheduled_for", nowIso)
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
    .limit(max);
  for (const row of (pend ?? []) as any[]) {
    // Reserva esgotada: respostas engajadas recebem reason específico.
    const r = reason === RETAIN_REASON_DAILY && isEngagedReserveCandidate(row)
      ? RETAIN_REASON_RESERVE_DAILY
      : reason;
    await retainItem(row, r, limitInfo);
  }

  return (pend ?? []).length;
}

// Devolve o item a pending SEM incrementar attempts (compensa o incremento do
// claim) e SEM qualquer chamada externa. Usado pelo gate de hold/cadência.
async function releaseHeldItem(item: any, reason: string, retryAtIso: string | null): Promise<void> {
  const attempts = Math.max(0, Number(item.attempts ?? 0) - 1);
  await supabase
    .from("orbit_whatsapp_outbox")
    .update({
      status: "pending",
      locked_at: null,
      locked_by: null,
      attempts,
      next_attempt_at: retryAtIso ?? new Date(Date.now() + 30 * 1000).toISOString(),
      last_error: reason,
    })
    .eq("id", item.id);
}

// Gate de hold/cadência. Usa o MESMO avaliador antes do claim e depois do claim.
async function evaluateItemHold(item: any, nowMs = Date.now()) {
  const tag = recoveryTagOf(item.metadata);
  const lastMs = tag ? await lastRecoverySentAtMs(supabase, item.empresa_id, tag) : null;
  return evaluateHoldGate({
    metadata: item.metadata,
    nowMs,
    lastRecoverySentAtMs: lastMs,
    spacingSeconds: DEFAULT_RECOVERY_SPACING_SECONDS,
  });
}

// PRÉ-CLAIM: empurra next_attempt_at dos pendentes retidos por hold/cadência,
// de modo que outbox_claim_batch nem os selecione. Nunca toca attempts.
async function deferHeldPendingForTenant(empresa_id: string): Promise<number> {
  const nowIso = new Date().toISOString();
  const { data: pend } = await supabase
    .from("orbit_whatsapp_outbox")
    .select("id, empresa_id, attempts, metadata")
    .eq("empresa_id", empresa_id)
    .eq("status", "pending")
    .lte("scheduled_for", nowIso)
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
    .limit(200);

  let deferred = 0;
  const nowMs = Date.now();
  for (const row of (pend ?? []) as any[]) {
    if (parseHoldUntilMs(row.metadata) === null && !recoveryTagOf(row.metadata)) continue;
    const verdict = await evaluateItemHold(row, nowMs);
    if (verdict.allowed) continue;
    await supabase
      .from("orbit_whatsapp_outbox")
      .update({
        locked_at: null,
        locked_by: null,
        next_attempt_at: verdict.retryAtIso ?? new Date(nowMs + 30 * 1000).toISOString(),
        last_error: verdict.reason,
      })
      .eq("id", row.id)
      .eq("status", "pending");
    deferred++;
  }
  return deferred;
}

async function processItem(item: any, cfg: SendingConfig | null, quota?: QuotaState): Promise<ProcessResult> {
  // ── GATE 1 (pós-claim, anti-corrida): hold explícito e cadência por recovery.
  // Roda ANTES de horário comercial, elegibilidade, cota e qualquer fetch externo.
  const holdVerdict = await evaluateItemHold(item);
  if (!holdVerdict.allowed) {
    await releaseHeldItem(item, holdVerdict.reason ?? OUTBOX_HOLD_REASON, holdVerdict.retryAtIso);
    return { outcome: "deferred", reason: holdVerdict.reason ?? OUTBOX_HOLD_REASON };
  }

  // Kill switch por tenant + horário comercial para não-urgentes
  if (!URGENT_SOURCES.has(item.source_type) && !nowInBusinessWindow()) {
    // reagenda para próxima janela (default: próximo horário 08:00)
    const next = new Date();
    next.setUTCHours(next.getUTCHours() + 1);
    await supabase
      .from("orbit_whatsapp_outbox")
      .update({ status: "pending", locked_at: null, locked_by: null, next_attempt_at: next.toISOString(), last_error: "outside_business_hours" })
      .eq("id", item.id);
    return { outcome: "deferred", reason: "outside_business_hours" };
  }

  // Re-check elegibilidade antes de qualquer efeito
  const elig = await checkEligibility(supabase, {
    empresa_id: item.empresa_id,
    prospect_id: item.prospect_id,
    conversa_id: item.conversa_id,
    deal_id: item.deal_id,
    campaign_id: item.campaign_id,
    flow_run_id: item.flow_run_id,
    scheduled_action_id: item.scheduled_action_id,
    source_type: item.source_type,
    source_id: item.source_id,
    event_created: item.metadata?.event_created ?? null,
    inbound_message_id: item.metadata?.inbound_message_id ?? null,
    meeting_id: item.metadata?.meeting_id ?? null,
    // flow_stage: propaga contexto de transição de etapa para o re-check no consumo.
    target_stage_id: item.metadata?.target_stage_id ?? null,
    allow_terminal_stage_message: item.metadata?.allow_terminal_stage_message ?? null,
    event_id: item.metadata?.event_id ?? null,
    action_id: item.metadata?.action_id ?? null,
  });
  if (!elig.eligible) {
    await supabase
      .from("orbit_whatsapp_outbox")
      .update({ status: "canceled", canceled_at: new Date().toISOString(), canceled_reason: elig.reasons.join(","), locked_at: null, locked_by: null })
      .eq("id", item.id);
    await updateCampaignRecipient(item, { status: "ignorado", motivo: elig.reasons[0] ?? "ineligible" });
    return { outcome: "canceled", reason: elig.reasons.join(",") };
  }

  // Re-check específico de campanha: aplica flags configuráveis (campaign_safety)
  // no INSTANTE do consumo. Fecha lacuna quando lead responde/é contatado entre
  // enqueue e tick. NÃO chama Z-API. Se inelegível: cancel outbox + ignorado
  // no recipient com o mesmo motivo.
  if (item.source_type === "campaign" && item.campaign_id) {
    const { data: camp } = await supabase
      .from("orbit_campaigns")
      .select("id, empresa_id, canal, filtros_json")
      .eq("id", item.campaign_id)
      .maybeSingle();
    let prospect: any = null;
    if (item.prospect_id) {
      const { data: p } = await supabase
        .from("orbit_prospects")
        .select("id, empresa_id, optout_whatsapp, deleted_at, nome_razao, nome_contato, nome_fantasia, email_principal, tags")
        .eq("id", item.prospect_id)
        .maybeSingle();
      prospect = p;
    }
    const cse = await checkCampaignRecipientEligibility(supabase, {
      campaign: camp,
      empresa_id: item.empresa_id,
      prospect,
    });
    if (!cse.eligible) {
      const motivo = cse.motivo ?? "campaign_ineligible";
      await supabase
        .from("orbit_whatsapp_outbox")
        .update({ status: "canceled", canceled_at: new Date().toISOString(), canceled_reason: motivo, locked_at: null, locked_by: null })
        .eq("id", item.id);
      await updateCampaignRecipient(item, { status: "ignorado", motivo });
      return { outcome: "canceled", reason: motivo };
    }
  }

  // Config e quota
  if (!cfg || cfg.enabled === false) {
    await supabase
      .from("orbit_whatsapp_outbox")
      .update({ status: "pending", locked_at: null, locked_by: null, next_attempt_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(), last_error: "sending_disabled" })
      .eq("id", item.id);
    return { outcome: "deferred", reason: "sending_disabled" };
  }

  // Campaign adapter flag
  if (item.source_type === "campaign" && cfg.outbox_adapter_enabled !== true) {
    await supabase
      .from("orbit_whatsapp_outbox")
      .update({ status: "canceled", canceled_at: new Date().toISOString(), canceled_reason: "campaign_adapter_disabled", locked_at: null, locked_by: null })
      .eq("id", item.id);
    return { outcome: "canceled", reason: "campaign_adapter_disabled" };
  }

  // ── Cota de warm-up (diária) e ritmo por minuto ──
  // Vale para TODAS as origens (ai_reply, manual, meeting_confirmation, flow_*,
  // campaign) e todos os payload_type. Nenhuma origem fura a cota.
  // Ao atingir o limite o item NÃO falha: continua queued (status=pending) com
  // next_attempt_at na próxima janela e last_error/metadata estruturados.
  const q: QuotaState = quota ?? {
    limitInfo: effectiveDailyLimit(cfg ?? {}),
    remainingDaily: Number.POSITIVE_INFINITY,
    remainingMinute: Number.POSITIVE_INFINITY,
  };
  if (!quota) {
    const usedNow = await getDailyUsage(item.empresa_id);
    q.remainingDaily = q.limitInfo.limit == null ? Number.POSITIVE_INFINITY : q.limitInfo.limit - usedNow;
    if (cfg?.max_per_minute && cfg.max_per_minute > 0) {
      q.remainingMinute = cfg.max_per_minute - (await countRecentSends(item.empresa_id, 60));
    }
    if (q.remainingDaily <= 0 && engagedReserveLimit(item.empresa_id) > 0) {
      q.remainingReserve = engagedReserveLimit(item.empresa_id) -
        (await countEngagedReserveUsedToday(supabase, item.empresa_id));
    }
  }

  // ── Reserva de resposta engajada ──
  // Só quando a cota base já esgotou. Exige ai_reply + inbound REAL da MESMA
  // conversa/tenant, dentro de 24h, posterior ao cutoff e anterior à geração da
  // resposta, conversa ativa e uma única resposta por inbound.
  // Prospecção (campaign/flow_*) e notificações nunca entram aqui.
  // A avaliação acontece na MESMA passagem, antes de qualquer retenção diária.
  let usedReserve = false;
  if (q.remainingDaily <= 0) {
    const reserveLimit = engagedReserveLimit(item.empresa_id);
    const reserveLeft = q.remainingReserve ?? 0;
    let retainReason = RETAIN_REASON_DAILY;
    if (reserveLimit > 0 && isEngagedReserveCandidate(item)) {
      if (reserveLeft <= 0) {
        retainReason = RETAIN_REASON_RESERVE_DAILY;
      } else {
        const decision = await evaluateEngagedReserve(supabase, item);
        if (decision.eligible) {
          const conversaUsed = await countEngagedReserveUsedTodayForConversa(
            supabase,
            item.empresa_id,
            item.conversa_id,
          );
          if (conversaUsed >= ENGAGED_RESERVE_CONVERSA_LIMIT) {
            retainReason = RETAIN_REASON_RESERVE_CONVERSA;
          } else {
            usedReserve = true;
            const dailyUsed = reserveLimit - reserveLeft;
            await markEngagedReserveUse(supabase, item, decision, {
              daily_used: dailyUsed + 1,
              daily_limit: reserveLimit,
              conversa_used: conversaUsed + 1,
              conversa_limit: ENGAGED_RESERVE_CONVERSA_LIMIT,
            });
            await auditEngagedReserveUsage(supabase, {
              empresa_id: item.empresa_id,
              used: dailyUsed + 1,
              limit: reserveLimit,
              conversa_id: item.conversa_id,
              outbox_id: item.id,
            });
          }
        }
      }
    }
    if (!usedReserve) {
      await retainItem(item, retainReason, q.limitInfo);
      return { outcome: "retained", reason: retainReason };
    }
  }

  if (q.remainingMinute <= 0) {
    await retainItem(item, RETAIN_REASON_RATE, q.limitInfo);
    return { outcome: "retained", reason: RETAIN_REASON_RATE };
  }


  // Resolver telefone
  let telefone: string | null = item.payload?.telefone ?? null;
  if (!telefone && item.conversa_id) {
    const { data: c } = await supabase.from("orbit_conversas").select("telefone_whatsapp").eq("id", item.conversa_id).maybeSingle();
    telefone = (c as any)?.telefone_whatsapp ?? null;
  }
  if (!telefone && item.prospect_id) {
    const { data: p } = await supabase.from("orbit_prospects").select("telefone").eq("id", item.prospect_id).maybeSingle();
    telefone = (p as any)?.telefone ?? null;
  }
  if (!telefone) {
    await supabase.from("orbit_whatsapp_outbox").update({ status: "failed", last_error: "missing_phone", locked_at: null, locked_by: null }).eq("id", item.id);
    await upsertVisualMensagem(item, { status: "falhou", erro: "missing_phone" });
    await updateCampaignRecipient(item, { status: "falhou", erro: "missing_phone" });
    return { outcome: "failed", reason: "missing_phone" };
  }

  // Para campaign: resolver/criar conversa antes de qualquer persistência OUT.
  if (item.source_type === "campaign") {
    await ensureCampaignConversa(item, telefone);
  }

  // ── GATE 2: revalidação do alvo da recovery imediatamente antes do envio ──
  const recheck = await revalidateRecoveryTarget(supabase, item);
  if (!recheck.valid) {
    await supabase
      .from("orbit_whatsapp_outbox")
      .update({
        status: "canceled",
        canceled_at: new Date().toISOString(),
        canceled_reason: recheck.reason ?? "recovery_target_invalid",
        locked_at: null,
        locked_by: null,
      })
      .eq("id", item.id);
    await upsertVisualMensagem(item, { status: "cancelada", erro: recheck.reason ?? "recovery_target_invalid" });
    return { outcome: "canceled", reason: recheck.reason ?? "recovery_target_invalid" };
  }

  // ── GATE 3 (último instante): re-avalia hold/cadência já com o telefone resolvido.
  const holdFinal = await evaluateItemHold(item);
  if (!holdFinal.allowed) {
    await releaseHeldItem(item, holdFinal.reason ?? RECOVERY_SPACING_REASON, holdFinal.retryAtIso);
    return { outcome: "deferred", reason: holdFinal.reason ?? RECOVERY_SPACING_REASON };
  }

  // Modo simulated para testes: metadata.simulate=true força simulação sem tocar Z-API
  if (item.metadata?.simulate === true) {
    await supabase
      .from("orbit_whatsapp_outbox")
      .update({ status: "simulated", sent_at: new Date().toISOString(), locked_at: null, locked_by: null })
      .eq("id", item.id);
    await upsertVisualMensagem(item, { status: "simulated" });
    await updateCampaignRecipient(item, { status: "simulated" });
    q.remainingDaily -= 1;
    q.remainingMinute -= 1;
    return { outcome: "simulated" };
  }

  // Z-API config + kill switch
  const zcfg = await getOrbitZapiRuntimeConfig(supabase, item.empresa_id);
  const block = getOrbitZapiRealSendBlockReason(zcfg);
  if (block) {
    await auditZapiSendAttempt(supabase, {
      empresa_id: item.empresa_id,
      function_name: "orbit-whatsapp-outbox-tick",
      action: item.source_type,
      blocked: true,
      block_reason: "ZAPI_REAL_SEND_BLOCKED",
      zapi_config_id: zcfg?.id ?? null,
      conversa_id: item.conversa_id,
      prospect_id: item.prospect_id,
      campaign_id: item.campaign_id,
      payload_summary: { source_type: item.source_type, payload_type: item.payload_type, telefone },
    });
    await supabase
      .from("orbit_whatsapp_outbox")
      .update({ status: "failed", last_error: block, locked_at: null, locked_by: null })
      .eq("id", item.id);
    await upsertVisualMensagem(item, { status: "falhou", erro: block });
    await updateCampaignRecipient(item, { status: "falhou", erro: block });
    return { outcome: "blocked", reason: "zapi_real_send_blocked" };
  }

  if (!zcfg?.instance_id || !zcfg?.token) {
    await supabase
      .from("orbit_whatsapp_outbox")
      .update({ status: "failed", last_error: "zapi_config_missing", locked_at: null, locked_by: null })
      .eq("id", item.id);
    await upsertVisualMensagem(item, { status: "falhou", erro: "zapi_config_missing" });
    await updateCampaignRecipient(item, { status: "falhou", erro: "zapi_config_missing" });
    return { outcome: "failed", reason: "zapi_config_missing" };
  }

  // Envio
  const result = await sendViaZapi(item, telefone, zcfg);
  if (result.ok) {
    await supabase
      .from("orbit_whatsapp_outbox")
      .update({ status: "sent", sent_at: new Date().toISOString(), provider_message_id: result.providerId ?? null, locked_at: null, locked_by: null })
      .eq("id", item.id);

    // Persistir orbit_mensagens: UPDATE se produtor pré-criou queued; INSERT fallback.
    if (item.conversa_id) {
      const preview = String(item.payload?.mensagem || `📎 ${item.payload_type}`).slice(0, 100);
      await upsertVisualMensagem(item, { status: "enviada", provider_message_id: result.providerId ?? null });
      await supabase
        .from("orbit_conversas")
        .update({ ultima_mensagem_at: new Date().toISOString(), ultima_mensagem_preview: preview })
        .eq("id", item.conversa_id);
    }

    await updateCampaignRecipient(item, { status: "enviado" });

    if (usedReserve) {
      q.remainingReserve = Math.max(0, (q.remainingReserve ?? 0) - 1);
    } else {
      q.remainingDaily -= 1;
    }
    q.remainingMinute -= 1;
    await bumpDailyUsage(item.empresa_id, 1);

    await auditZapiSendAttempt(supabase, {
      empresa_id: item.empresa_id,
      function_name: "orbit-whatsapp-outbox-tick",
      action: item.source_type,
      blocked: false,
      zapi_config_id: zcfg.id,
      conversa_id: item.conversa_id,
      prospect_id: item.prospect_id,
      campaign_id: item.campaign_id,
      payload_summary: { source_type: item.source_type, payload_type: item.payload_type, telefone },
    });
    return { outcome: "sent", provider_message_id: result.providerId };
  }

  // Falha: backoff se ainda houver tentativas
  const maxAttempts = Number(item.max_attempts ?? 5);
  if (Number(item.attempts) >= maxAttempts) {
    await supabase
      .from("orbit_whatsapp_outbox")
      .update({ status: "failed", last_error: result.error?.slice(0, 500) ?? "unknown", locked_at: null, locked_by: null })
      .eq("id", item.id);
    await updateCampaignRecipient(item, { status: "falhou", erro: result.error?.slice(0, 500) ?? "unknown" });
    return { outcome: "failed", reason: result.error };
  }
  const backoff = Math.min(30 * 60 * 1000, 60 * 1000 * Math.pow(2, Number(item.attempts) - 1));
  await supabase
    .from("orbit_whatsapp_outbox")
    .update({ status: "pending", locked_at: null, locked_by: null, next_attempt_at: new Date(Date.now() + backoff).toISOString(), last_error: result.error?.slice(0, 500) ?? "unknown" })
    .eq("id", item.id);
  return { outcome: "deferred", reason: result.error };
}

function sortClaimed(items: any[]): any[] {
  // Ordem determinística: priority DESC, scheduled_for ASC, created_at ASC, id ASC.
  // Necessário porque RETURNING de UPDATE ... FROM não garante ordem do CTE.
  return [...items].sort((a, b) => {
    const p = (Number(b.priority) || 0) - (Number(a.priority) || 0);
    if (p !== 0) return p;
    const s = String(a.scheduled_for ?? "").localeCompare(String(b.scheduled_for ?? ""));
    if (s !== 0) return s;
    const c = String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""));
    if (c !== 0) return c;
    return String(a.id).localeCompare(String(b.id));
  });
}

async function processTenant(empresa_id: string, batch: number): Promise<Record<string, number>> {
  const stats = { claimed: 0, sent: 0, simulated: 0, canceled: 0, deferred: 0, failed: 0, blocked: 0, retained: 0, held: 0 };
  const cfg = await getSendingConfig(empresa_id);

  // ── Hold/cadência ANTES de qualquer contagem de cota, claim ou fetch externo ──
  stats.held = await deferHeldPendingForTenant(empresa_id);

  // ── Contagem e decisão de cota ANTES de qualquer claim ou fetch externo ──
  const limitInfo = effectiveDailyLimit(cfg ?? {});
  const usedToday = await getDailyUsage(empresa_id);
  const remainingDaily = limitInfo.limit == null
    ? Number.POSITIVE_INFINITY
    : limitInfo.limit - usedToday;

  // Reserva de resposta engajada: teto separado, só tenants habilitados.
  let remainingReserve = 0;
  if (remainingDaily <= 0 && engagedReserveLimit(empresa_id) > 0) {
    remainingReserve = Math.max(
      0,
      engagedReserveLimit(empresa_id) - (await countEngagedReserveUsedToday(supabase, empresa_id)),
    );
  }
  if (remainingDaily <= 0 && remainingReserve <= 0) {
    stats.retained = await retainPendingForTenant(empresa_id, RETAIN_REASON_DAILY, limitInfo);
    return stats;
  }

  let remainingMinute = Number.POSITIVE_INFINITY;
  if (cfg?.max_per_minute && cfg.max_per_minute > 0) {
    remainingMinute = cfg.max_per_minute - (await countRecentSends(empresa_id, 60));
    if (remainingMinute <= 0) {
      stats.retained = await retainPendingForTenant(empresa_id, RETAIN_REASON_RATE, limitInfo);
      return stats;
    }
  }

  const quota: QuotaState = { limitInfo, remainingDaily, remainingMinute, remainingReserve };
  const budget = remainingDaily > 0 ? remainingDaily : remainingReserve;
  const cap = Math.max(
    1,
    Math.min(
      batch,
      cfg?.batch_size && cfg.batch_size > 0 ? cfg.batch_size : batch,
      Number.isFinite(budget) ? budget : batch,
      Number.isFinite(remainingMinute) ? remainingMinute : batch,
    ),
  );

  const { data: claimed, error } = await supabase.rpc("outbox_claim_batch", {
    _empresa_id: empresa_id,
    _batch: cap,
    _worker_id: WORKER_ID,
    _lease_seconds: 120,
  });
  if (error) throw error;
  for (const item of sortClaimed((claimed ?? []) as any[])) {
    stats.claimed++;
    const r = await processItem(item, cfg, quota);
    stats[r.outcome as keyof typeof stats]++;
  }

  // Sobrou fila e a cota estourou durante o lote: retém o restante como queued.
  if (quota.remainingDaily <= 0 && (quota.remainingReserve ?? 0) <= 0) {
    stats.retained += await retainPendingForTenant(empresa_id, RETAIN_REASON_DAILY, limitInfo);
  } else if (quota.remainingMinute <= 0) {
    stats.retained += await retainPendingForTenant(empresa_id, RETAIN_REASON_RATE, limitInfo);
  }
  return stats;
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!CRON_TOKEN || token !== CRON_TOKEN) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const tickId = crypto.randomUUID();
  const t0 = Date.now();

  try {
    let body: any = {};
    try { body = await req.json(); } catch { /* empty */ }
    const batchPerTenant = Math.max(1, Math.min(50, Number(body?.batch ?? 15)));

    // Modo dirigido: processa 1 item específico (usado por AI reply / manual imediato)
    if (body?.outbox_id && body?.empresa_id) {
      const { data: single } = await supabase
        .from("orbit_whatsapp_outbox")
        .select("*")
        .eq("id", body.outbox_id)
        .eq("empresa_id", body.empresa_id)
        .maybeSingle();
      if (!single) return new Response(JSON.stringify({ ok: false, error: "not_found" }), { status: 200, headers: corsHeaders });

      // Fura-fila guard: se existe pending com prioridade maior nesse tenant e já elegível,
      // defer este item — nunca desrespeitar prioridade global.
      const nowIso = new Date().toISOString();
      const { data: higher } = await supabase
        .from("orbit_whatsapp_outbox")
        .select("id, priority")
        .eq("empresa_id", body.empresa_id)
        .eq("status", "pending")
        .gt("priority", (single as any).priority ?? 0)
        .lte("scheduled_for", nowIso)
        .limit(1);
      if (higher && higher.length > 0) {
        return new Response(JSON.stringify({ ok: true, data: { deferred: true, reason: "higher_priority_pending" } }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Reserva manualmente
      const { data: locked } = await supabase
        .from("orbit_whatsapp_outbox")
        .update({ status: "processing", locked_at: new Date().toISOString(), locked_by: WORKER_ID, attempts: (single as any).attempts + 1 })
        .eq("id", single.id)
        .eq("status", "pending")
        .select("*")
        .maybeSingle();
      if (!locked) return new Response(JSON.stringify({ ok: true, data: { skipped: true, status: (single as any).status } }), { status: 200, headers: corsHeaders });
      const cfg = await getSendingConfig((locked as any).empresa_id);
      const r = await processItem(locked, cfg);
      return new Response(JSON.stringify({ ok: true, data: { tick_id: tickId, outcome: r.outcome, reason: r.reason ?? null } }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Modo cron: descobre tenants com itens pendentes
    const { data: tenants } = await supabase
      .from("orbit_whatsapp_outbox")
      .select("empresa_id")
      .eq("status", "pending")
      .lte("scheduled_for", new Date().toISOString())
      .limit(500);
    const empresaIds = Array.from(new Set(((tenants ?? []) as any[]).map((r) => r.empresa_id).filter(Boolean)));

    const results: Record<string, any> = {};
    for (const eid of empresaIds) {
      try {
        results[eid] = await processTenant(eid, batchPerTenant);
      } catch (e: any) {
        results[eid] = { error: String(e?.message ?? e).slice(0, 300) };
      }
    }

    const summary = { tick_id: tickId, tenants: empresaIds.length, results, duration_ms: Date.now() - t0 };
    console.log(JSON.stringify({ scope: "outbox_tick_summary", ...summary }));
    return new Response(JSON.stringify({ ok: true, data: summary }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("outbox-tick fatal", e);
    return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e), tick_id: tickId }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
