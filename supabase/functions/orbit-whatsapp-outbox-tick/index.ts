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
}

async function getSendingConfig(empresa_id: string): Promise<SendingConfig | null> {
  const { data } = await supabase
    .from("orbit_whatsapp_sending_config")
    .select("enabled, daily_limit, max_per_minute, min_delay_ms, max_delay_ms, warmup_enabled, warmup_start_date, outbox_adapter_enabled")
    .eq("empresa_id", empresa_id)
    .maybeSingle();
  return (data as SendingConfig) ?? null;
}

async function getDailyUsage(empresa_id: string): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("orbit_whatsapp_daily_usage")
    .select("sent_count")
    .eq("empresa_id", empresa_id)
    .eq("usage_date", today)
    .maybeSingle();
  return Number((data as any)?.sent_count ?? 0);
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

interface ProcessResult {
  outcome: "sent" | "simulated" | "canceled" | "failed" | "deferred" | "blocked";
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
  const mediaSource = payload.storage_path || payload.url_midia || payload.url || null;
  const mediaUrl = mediaSource ? await signOrbitMediaUrl(supabase, mediaSource, 3600) : null;

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
  patch: { status: "enviado" | "falhou" | "ignorado"; erro?: string | null; motivo?: string | null },
): Promise<void> {
  if (item.source_type !== "campaign" || !item.source_id) return;
  const upd: Record<string, unknown> = { erro: patch.erro ?? null };
  if (patch.status === "enviado") {
    upd.status = "enviado";
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

async function processItem(item: any, cfg: SendingConfig | null): Promise<ProcessResult> {
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
  });
  if (!elig.eligible) {
    await supabase
      .from("orbit_whatsapp_outbox")
      .update({ status: "canceled", canceled_at: new Date().toISOString(), canceled_reason: elig.reasons.join(","), locked_at: null, locked_by: null })
      .eq("id", item.id);
    await updateCampaignRecipient(item, { status: "ignorado", motivo: elig.reasons[0] ?? "ineligible" });
    return { outcome: "canceled", reason: elig.reasons.join(",") };
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

  // Daily quota / warmup — cota de prospecção automatizada.
  // Aplica-se APENAS a sources outbound automatizados (campaign, flow_initial,
  // flow_followup). Sources conversacionais urgentes (ai_reply, manual,
  // meeting_confirmation) NÃO são bloqueados pelo daily_limit — precisam responder
  // ao lead mesmo quando a cota diária de prospecção já se esgotou. Eles continuam
  // sujeitos a max_per_minute, kill switch, opt-out, terminal deal, handoff etc.
  if (!URGENT_SOURCES.has(item.source_type)) {
    const used = await getDailyUsage(item.empresa_id);
    const limit = cfg.daily_limit ?? null;
    if (limit != null && used >= limit) {
      await supabase
        .from("orbit_whatsapp_outbox")
        .update({ status: "pending", locked_at: null, locked_by: null, next_attempt_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(), last_error: "daily_limit_reached" })
        .eq("id", item.id);
      return { outcome: "deferred", reason: "daily_limit_reached" };
    }
  }

  // Ritmo por minuto (global)
  if (cfg.max_per_minute && cfg.max_per_minute > 0) {
    const perMin = await countRecentSends(item.empresa_id, 60);
    if (perMin >= cfg.max_per_minute) {
      await supabase
        .from("orbit_whatsapp_outbox")
        .update({ status: "pending", locked_at: null, locked_by: null, next_attempt_at: new Date(Date.now() + 60 * 1000).toISOString(), last_error: "rate_limited" })
        .eq("id", item.id);
      return { outcome: "deferred", reason: "rate_limited" };
    }
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

  // Modo simulated para testes: metadata.simulate=true força simulação sem tocar Z-API
  if (item.metadata?.simulate === true) {
    await supabase
      .from("orbit_whatsapp_outbox")
      .update({ status: "simulated", sent_at: new Date().toISOString(), locked_at: null, locked_by: null })
      .eq("id", item.id);
    await upsertVisualMensagem(item, { status: "simulated" });
    await updateCampaignRecipient(item, { status: "enviado" });
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

async function processTenant(empresa_id: string, batch: number): Promise<{ claimed: number; sent: number; simulated: number; canceled: number; deferred: number; failed: number; blocked: number }> {
  const cfg = await getSendingConfig(empresa_id);
  const { data: claimed, error } = await supabase.rpc("outbox_claim_batch", {
    _empresa_id: empresa_id,
    _batch: batch,
    _worker_id: WORKER_ID,
    _lease_seconds: 120,
  });
  if (error) throw error;
  const stats = { claimed: 0, sent: 0, simulated: 0, canceled: 0, deferred: 0, failed: 0, blocked: 0 };
  for (const item of sortClaimed((claimed ?? []) as any[])) {
    stats.claimed++;
    const r = await processItem(item, cfg);
    stats[r.outcome as keyof typeof stats]++;
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
