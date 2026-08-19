import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { evaluateAutomationCutoff } from "../_shared/automation-cutoff.ts";
import {
  classifyZapiFailure,
  markZapiInstanceOffline,
  markZapiInstanceOnline,
  markOfflineAlertSent,
  sanitizeZapiReason,
  ZAPI_STACK_VERSION,
} from "../_shared/zapi-connection.ts";
import { sendOpsOfflineAlert } from "../_shared/zapi-ops-alert.ts";
import {
  readDebounceConfig,
  computeFireAfter,
  msUntil,
  decideDebounce,
  type DebounceConfig,
} from "../_shared/ai-reply-debounce.ts";

/**
 * Caminho legado (tenant sem debounce): reclama lock stale, adquire lock atômico
 * e chama o agente imediatamente. Comportamento inalterado.
 */
async function runImmediateAgentPath(
  supabase: any,
  conversa: any,
  prospectId: string,
  messageText: string,
  invokeAgent: (mensagem: string, extra?: Record<string, unknown>) => Promise<boolean>,
): Promise<void> {
  // Safety-net: reclamar lock stale (>3min) — evita conversa travada por falha anterior
  const staleThreshold = new Date(Date.now() - 3 * 60 * 1000).toISOString();
  await supabase
    .from("orbit_conversas")
    .update({ ai_processing: false })
    .eq("id", conversa.id)
    .eq("ai_processing", true)
    .lt("updated_at", staleThreshold);

  const { data: lockResult } = await supabase
    .from("orbit_conversas")
    .update({ ai_processing: true })
    .eq("id", conversa.id)
    .eq("ai_processing", false)
    .select("id");

  if (!lockResult || lockResult.length === 0) {
    console.log("[orbit-webhook] AI já processando conversa, msg será agregada:", conversa.id);
    return;
  }
  await invokeAgent(messageText);
}

/**
 * Consolida as inbound acumuladas desde o último OUT visual da conversa.
 * Sem PII em log: apenas contagem.
 */
async function consolidateInbound(
  supabase: any,
  empresaId: string,
  conversaId: string,
  fallbackText: string,
): Promise<{ text: string; batchSize: number }> {
  try {
    const { data: lastOut } = await supabase
      .from("orbit_mensagens")
      .select("timestamp")
      .eq("empresa_id", empresaId)
      .eq("conversa_id", conversaId)
      .eq("direcao", "OUT")
      .order("timestamp", { ascending: false })
      .limit(1)
      .maybeSingle();

    let q = supabase
      .from("orbit_mensagens")
      .select("mensagem, media_extracted_text, timestamp")
      .eq("empresa_id", empresaId)
      .eq("conversa_id", conversaId)
      .eq("direcao", "IN")
      .order("timestamp", { ascending: true })
      .limit(10);
    if (lastOut?.timestamp) q = q.gt("timestamp", lastOut.timestamp);

    const { data: ins, error: insError } = await q;
    if (insError) return { text: fallbackText, batchSize: 1 };
    const texts = (ins ?? [])
      .map((m: any) => String(m.mensagem ?? m.media_extracted_text ?? "").trim())
      .filter((t: string) => t.length > 0);
    if (texts.length === 0) return { text: fallbackText, batchSize: 1 };
    return { text: texts.join("\n"), batchSize: texts.length };
  } catch (_e) {
    return { text: fallbackText, batchSize: 1 };
  }
}

/**
 * Dispara a resposta do lote se — e somente se — este job continua sendo o dono
 * da conversa (claim_token corrente). Qualquer job stale é descartado, o que
 * garante no máximo uma resposta por lote mesmo em corrida no limite da janela.
 */
async function fireDebouncedReply(args: {
  supabase: any;
  empresaId: string;
  conversa: any;
  prospectId: string;
  claimToken: string;
  cfg: DebounceConfig;
  receivedAt: string;
  inboundMessageId: string;
  fallbackText: string;
  invokeAgent: (mensagem: string, extra?: Record<string, unknown>) => Promise<boolean>;
}): Promise<void> {
  const { supabase, empresaId, conversa, claimToken, cfg } = args;
  try {
    const { data: row } = await supabase
      .from("orbit_ai_reply_debounce")
      .select("claim_token, fire_after, status")
      .eq("conversa_id", conversa.id)
      .maybeSingle();

    const decision = decideDebounce(row as any, claimToken);
    if (decision.action === "wait") {
      // Inbound nova reiniciou a janela: o job dela responde.
      console.log(JSON.stringify({ event: "ai_reply_debounce_rescheduled", conversa_id: conversa.id }));
      return;
    }
    if (decision.action === "abort") {
      console.log(JSON.stringify({ event: "ai_reply_debounce_skipped", reason: decision.reason, conversa_id: conversa.id }));
      return;
    }

    // Gate de human_talk / cutoff reavaliado no momento do disparo.
    const { data: fresh } = await supabase
      .from("orbit_conversas")
      .select("human_talk, ai_processing")
      .eq("id", conversa.id)
      .maybeSingle();
    if (fresh?.human_talk === true) {
      await supabase.from("orbit_ai_reply_debounce")
        .update({ status: "canceled", last_error: "human_talk", updated_at: new Date().toISOString() })
        .eq("conversa_id", conversa.id).eq("claim_token", claimToken);
      return;
    }

    // Claim atômico da geração (status pending -> generating no mesmo token).
    const { data: claimed } = await supabase
      .from("orbit_ai_reply_debounce")
      .update({ status: "generating", attempts: (row as any)?.attempts ?? 0, updated_at: new Date().toISOString() })
      .eq("conversa_id", conversa.id)
      .eq("claim_token", claimToken)
      .eq("status", "pending")
      .select("conversa_id");
    if (!claimed || claimed.length === 0) return;

    const staleThreshold = new Date(Date.now() - 3 * 60 * 1000).toISOString();
    await supabase.from("orbit_conversas").update({ ai_processing: false })
      .eq("id", conversa.id).eq("ai_processing", true).lt("updated_at", staleThreshold);
    const { data: lockResult } = await supabase
      .from("orbit_conversas")
      .update({ ai_processing: true })
      .eq("id", conversa.id)
      .eq("ai_processing", false)
      .select("id");
    if (!lockResult || lockResult.length === 0) {
      await supabase.from("orbit_ai_reply_debounce")
        .update({ status: "pending", last_error: "lock_busy", updated_at: new Date().toISOString() })
        .eq("conversa_id", conversa.id).eq("claim_token", claimToken);
      return;
    }

    const batch = await consolidateInbound(supabase, empresaId, conversa.id, args.fallbackText);
    const ok = await args.invokeAgent(batch.text, {
      debounced: true,
      batch_size: batch.batchSize,
      received_at: args.receivedAt,
    });

    await supabase.from("orbit_ai_reply_debounce")
      .update({
        status: ok ? "done" : "pending",
        batch_size: batch.batchSize,
        last_error: ok ? null : "agent_error",
        updated_at: new Date().toISOString(),
      })
      .eq("conversa_id", conversa.id).eq("claim_token", claimToken);

    // Observabilidade de SLA (idempotente por inbound).
    if (ok) {
      const nowIso = new Date().toISOString();
      const { data: out } = await supabase
        .from("orbit_whatsapp_outbox")
        .select("id, created_at")
        .eq("empresa_id", empresaId)
        .eq("conversa_id", conversa.id)
        .eq("source_type", "ai_reply")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      await supabase.from("orbit_ai_reply_sla").upsert({
        empresa_id: empresaId,
        conversa_id: conversa.id,
        inbound_message_id: String(args.inboundMessageId),
        outbox_id: out?.id ?? null,
        batch_size: batch.batchSize,
        received_at: args.receivedAt,
        ai_generated_at: nowIso,
        queued_at: out?.created_at ?? nowIso,
        wait_ms: cfg.waitMs,
        sla_ms: cfg.slaMs,
      }, { onConflict: "empresa_id,inbound_message_id" });
    }
  } catch (e) {
    console.error("[orbit-webhook] debounce fire falhou:", e instanceof Error ? e.message : e);
    await supabase.from("orbit_conversas").update({ ai_processing: false }).eq("id", conversa.id);
  }
}

console.log("[orbit-webhook] boot version:", ZAPI_STACK_VERSION);
import {
  extractInboundContent,
  extractInboundPhone,
  inboundEligibility,
  inboundTimestampIso,
  providerMessageId,
  resolveEmpresaByInstance,
  safePreview,
} from "../_shared/inbound-zapi.ts";
import {
  classifyZapiInbound,
  extractLid,
  extractTrustedPhone,
  sanitizeUnresolvedLidPayload,
} from "../_shared/inbound-identity.ts";





/**
 * Generate phone number variants for flexible matching.
 * Given a normalized BR phone like 5551999887766 (13 digits with 9),
 * also generate variant without the 9: 555199887766 (12 digits).
 * And vice-versa: given 555199887766 (12 digits), add the 9: 5551999887766.
 */
function generatePhoneVariants(normalizedPhone: string): string[] {
  const variants = new Set<string>();
  variants.add(normalizedPhone);

  // Only apply to Brazilian numbers (starting with 55)
  if (normalizedPhone.startsWith("55")) {
    const withoutCountry = normalizedPhone.substring(2); // e.g. 51999887766

    if (withoutCountry.length === 11) {
      // Has 9th digit (DDD 2 digits + 9 + 8 digits) — create variant without it
      const ddd = withoutCountry.substring(0, 2);
      const ninthDigit = withoutCountry.charAt(2);
      if (ninthDigit === "9") {
        const without9 = `55${ddd}${withoutCountry.substring(3)}`;
        variants.add(without9);
      }
    } else if (withoutCountry.length === 10) {
      // Missing 9th digit (DDD 2 digits + 8 digits) — create variant with it
      const ddd = withoutCountry.substring(0, 2);
      const with9 = `55${ddd}9${withoutCountry.substring(2)}`;
      variants.add(with9);
    }
  }

  return Array.from(variants);
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // 1) Auth shared-secret (fast, sync — sempre antes do ACK)
  const webhookSecret = Deno.env.get("ORBIT_WEBHOOK_SECRET");
  if (webhookSecret) {
    const provided = req.headers.get("x-webhook-secret") || "";
    const a = new TextEncoder().encode(provided);
    const b = new TextEncoder().encode(webhookSecret);
    let ok = a.length === b.length;
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i] !== b[i]) ok = false;
    }
    if (!ok) {
      console.warn("[orbit-webhook] Invalid webhook secret");
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  // 2) Parse + validação rápida do payload (ainda síncrono para responder 400 cedo)
  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  if (!payload || typeof payload !== "object") {
    return new Response(JSON.stringify({ error: "invalid_payload" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const _rawText = JSON.stringify(payload);
  if (_rawText.length > 200_000) {
    return new Response(JSON.stringify({ error: "payload_too_large" }), {
      status: 413,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const eventType = url.searchParams.get("event") || "on-receive";
  console.log(`[orbit-webhook] ACK rápido — event=${eventType} len=${_rawText.length}`);

  // 3) Dispara processamento pesado em background e ACK em <1s.
  //    EdgeRuntime.waitUntil mantém o worker vivo até o processInboundZapi resolver,
  //    sem bloquear a resposta para o provedor (Z-API).
  const processor = processInboundZapi(payload, eventType, corsHeaders).catch((e) => {
    console.error("[orbit-webhook] background error:", e instanceof Error ? e.message : String(e));
  });
  // @ts-ignore — EdgeRuntime é um global do runtime do Supabase Edge
  if (typeof EdgeRuntime !== "undefined") {
    // @ts-ignore
    EdgeRuntime.waitUntil(processor);
  }

  return new Response(JSON.stringify({ ok: true, queued: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

/**
 * Worker assíncrono que processa o payload Z-API depois do ACK.
 * Pode demorar (lookups, IA, RAG, inserts) sem prejudicar o tempo de resposta.
 * Idempotência garantida pelo índice único parcial em orbit_mensagens(empresa_id, provider_message_id).
 * Retorna Response apenas por compat de código legado — o valor é ignorado pelo waitUntil.
 */
async function processInboundZapi(payload: any, eventType: string, corsHeaders: Record<string, string>): Promise<Response> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let logId: string | null = null;

  try {




    const payloadInstanceId = payload.instanceId || null;
    const payloadPhone = payload.phone?.replace(/\D/g, "") || payload.from?.replace(/\D/g, "") || null;
    const payloadType = payload.type as string | undefined;

    // Z-API status callbacks que NUNCA representam mensagem nova de conteúdo
    const STATUS_ONLY_CALLBACKS = new Set([
      "ConnectedCallback",
      "DisconnectedCallback",
      "PresenceChatCallback",
      "MessageStatusCallback",
      "DeliveryCallback",
      "ChatPresenceCallback",
      "NotificationCallback",
    ]);

    if (payloadType && STATUS_ONLY_CALLBACKS.has(payloadType) && eventType !== "message-status" && eventType !== "presence" && eventType !== "on-connect" && eventType !== "on-disconnect" && eventType !== "phone-disconnected") {
      console.log(`[orbit-webhook] Ignorando callback de status: ${payloadType}`);
      const { data: logRow } = await supabase
        .from("orbit_webhook_logs")
        .insert({
          event_type: eventType,
          instance_id: payloadInstanceId,
          phone: payloadPhone,
          payload,
          status: "ignored",
          error_message: `status_callback:${payloadType}`,
        })
        .select("id")
        .single();
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "status_callback", type: payloadType }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: logRow } = await supabase
      .from("orbit_webhook_logs")
      .insert({
        event_type: eventType,
        instance_id: payloadInstanceId,
        phone: payloadPhone,
        payload,
        status: "received",
      })
      .select("id")
      .single();
    logId = logRow?.id || null;

    switch (eventType) {
      case "on-connect": {
        // Reconexão confirmada: libera o estado offline (a fila retoma sozinha).
        const online = await markZapiInstanceOnline(supabase, {
          instance_id: payloadInstanceId,
          source: "webhook",
        });
        console.log("[orbit-webhook] Instância conectada", JSON.stringify({ recovered: online.recovered }));
        if (logId) await supabase.from("orbit_webhook_logs").update({ status: "processed" }).eq("id", logId);
        return new Response(JSON.stringify({ ok: true, event: "on-connect", recovered: online.recovered }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "on-disconnect":
      case "phone-disconnected": {
        // FAIL-CLOSED: marca offline, pausa a fila do tenant e alerta a operação
        // imediatamente (com cooldown para evitar tempestade).
        const rawReason =
          payload?.error || payload?.reason || payload?.message || payload?.disconnected || eventType;
        const cls = classifyZapiFailure(null, rawReason);
        const marked = await markZapiInstanceOffline(supabase, {
          instance_id: payloadInstanceId,
          reason: `webhook ${eventType}: ${sanitizeZapiReason(rawReason, 200)}`,
          source: "webhook",
          event_type: eventType === "phone-disconnected" ? "phone-disconnected" : cls.event_type,
          blockSeconds: cls.blockSeconds,
        });

        let alerted = false;
        if (marked.shouldAlert) {
          const alert = await sendOpsOfflineAlert(supabase, {
            empresa_id: marked.empresa_id,
            instance_id: marked.instance_id ?? payloadInstanceId,
            reason: sanitizeZapiReason(rawReason, 200),
            event_type: eventType,
            event_id: marked.event_id,
          });
          alerted = alert.sent;
          await markOfflineAlertSent(supabase, {
            config_id: marked.config_id,
            event_id: marked.event_id,
            error: alert.sent ? null : alert.error ?? "alert_failed",
            channel: alert.channel,
            provider_message_id: alert.provider_message_id ?? null,
            idempotency_key: alert.idempotency_key,
          });
        }

        console.warn("[orbit-webhook] Instância desconectada", JSON.stringify({
          instance_id: payloadInstanceId,
          paused_outbox: marked.paused_outbox,
          alerted,
        }));
        if (logId) await supabase.from("orbit_webhook_logs").update({ status: "processed" }).eq("id", logId);
        return new Response(JSON.stringify({ ok: true, event: eventType, paused_outbox: marked.paused_outbox, alerted }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      case "presence":
        console.log("[orbit-webhook] Atualização de presença:", payload.status);
        if (logId) await supabase.from("orbit_webhook_logs").update({ status: "processed" }).eq("id", logId);
        return new Response(JSON.stringify({ ok: true, event: "presence", status: payload.status }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

      case "message-status":
        if (payload.messageId) {
          await supabase
            .from("orbit_mensagens")
            .update({ status: payload.status || "delivered" })
            .eq("provider_message_id", payload.messageId);
        }
        if (logId) await supabase.from("orbit_webhook_logs").update({ status: "processed" }).eq("id", logId);
        return new Response(JSON.stringify({ ok: true, event: "message-status" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

      case "on-send":
      case "on-receive":
      default:
        break;
    }

    // ── Resolve empresa_id EXCLUSIVAMENTE pelo instance_id ──
    // Sem fallback por "primeiro tenant ativo": instance_id duplicado/ausente
    // já causou gravação de inbound no tenant errado. Falha explícita é melhor.
    if (!payloadInstanceId) {
      if (logId) await supabase.from("orbit_webhook_logs").update({ status: "ignored", error_message: "instance_id_missing" }).eq("id", logId);
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "instance_id_missing" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: zapiRows } = await supabase
      .from("orbit_zapi_config")
      .select("empresa_id, notificar_enviadas_por_mim")
      .eq("instance_id", payloadInstanceId);

    const resolved = resolveEmpresaByInstance(zapiRows);
    const empresaId: string | null = resolved.empresaId;
    if (!empresaId) {
      console.error("[orbit-webhook] instance não resolvida:", resolved.reason);
      if (logId) await supabase.from("orbit_webhook_logs").update({ status: "failed", error_message: resolved.reason ?? "instance_unresolved" }).eq("id", logId);
      return new Response(JSON.stringify({ ok: false, reason: resolved.reason }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (eventType === "on-send" && !zapiRows?.[0]?.notificar_enviadas_por_mim) {
      if (logId) await supabase.from("orbit_webhook_logs").update({ status: "ignored", error_message: "own messages disabled" }).eq("id", logId);
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "own messages disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[orbit-webhook] Resolved empresa_id:", empresaId);

    const notifyOwnMessages = zapiRows?.[0]?.notificar_enviadas_por_mim === true;
    const isOnSend = eventType === "on-send";

    // ── Classificação (helpers puros, cobertos por testes) ──
    // on-send permanece callback de delivery/status (comportamento legado).
    // on-receive com fromMe=true e fromApi=false é OUT externa (celular do atendente).
    let externalOut = false;
    if (!isOnSend) {
      const cls = classifyZapiInbound(payload, "on-receive", { notifyOwnMessages });
      if (cls.kind === "orbit_echo") {
        if (logId) await supabase.from("orbit_webhook_logs").update({ status: "ignored", error_message: "duplicate_message" }).eq("id", logId);
        return new Response(JSON.stringify({ ok: true, skipped: true, reason: "duplicate_message" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (cls.kind === "ignore" || cls.kind === "status_callback") {
        if (logId) await supabase.from("orbit_webhook_logs").update({ status: "ignored", error_message: cls.reason }).eq("id", logId);
        return new Response(JSON.stringify({ ok: true, skipped: true, reason: cls.reason }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      externalOut = cls.kind === "external_out";
    }

    const fromMe = isOnSend || payload.fromMe === true;

    const { messageText, tipoMidia, urlMidia } = extractInboundContent(payload);
    const messageId = providerMessageId(payload);
    const inboundAt = inboundTimestampIso(payload);

    if (!messageText && !tipoMidia) {
      if (logId) await supabase.from("orbit_webhook_logs").update({ status: "ignored", error_message: "empty_payload" }).eq("id", logId);
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: "empty_payload" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Telefone confiável (nunca connectedPhone, nunca dígitos de @lid) ──
    const payloadLid = extractLid(payload);
    let normalizedPhone = extractTrustedPhone(payload);
    let lidResolvedVia: string | null = normalizedPhone ? "payload_phone" : null;

    if (!normalizedPhone && payloadLid && empresaId) {
      const { data: lidRow } = await supabase
        .from("orbit_whatsapp_lid_map")
        .select("telefone, prospect_id, conversa_id")
        .eq("empresa_id", empresaId)
        .eq("lid", payloadLid)
        .maybeSingle();
      if (lidRow?.telefone) {
        normalizedPhone = lidRow.telefone;
        lidResolvedVia = "lid_map";
      }
    }

    if (!normalizedPhone) {
      // Sem telefone confiável: nunca inventamos número a partir do LID e nunca
      // acionamos a IA. Estado é observável para correlação posterior.
      const unresolvedReason = payloadLid ? "phone_lid_unresolved" : "no_phone";
      if (logId) {
        await supabase
          .from("orbit_webhook_logs")
          .update({
            status: "ignored",
            error_message: unresolvedReason,
            payload: { sanitized: sanitizeUnresolvedLidPayload(payload), webhook_log_id: logId },
          })
          .eq("id", logId);
      }
      console.warn(JSON.stringify({ event: unresolvedReason, empresa_id: empresaId, webhook_log_id: logId }));
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: unresolvedReason }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }




    // Generate phone variants for matching (with/without 9th digit)
    const phoneVariants = generatePhoneVariants(normalizedPhone);
    console.log("[orbit-webhook] Phone variants para busca:", phoneVariants);

    // 1. Find or create prospect — search all phone variants
    const orFilter = phoneVariants
      .map(v => `whatsapp.eq.${v},telefone.eq.${v}`)
      .join(",");

    const { data: prospectRows } = await supabase
      .from("orbit_prospects")
      .select("*")
      .eq("empresa_id", empresaId)
      .or(orFilter)
      .order("created_at", { ascending: true })
      .limit(1);

    let prospect: any = prospectRows?.[0] ?? null;


    if (prospect && !prospect.whatsapp) {
      console.log("[orbit-webhook] Auto-preenchendo whatsapp para prospect:", prospect.id);
      await supabase
        .from("orbit_prospects")
        .update({ whatsapp: normalizedPhone, whatsapp_status: "nao_verificado" })
        .eq("id", prospect.id);
      prospect.whatsapp = normalizedPhone;
    }

    if (!prospect) {
      if (empresaId) {
        const { data: saasEmpresa } = await supabase
          .from("saas_empresa")
          .select("plan_id, plan:saas_plans(code, limits)")
          .eq("empresa_id", empresaId)
          .maybeSingle();
        const planLimits = (saasEmpresa?.plan as any)?.limits;
        const maxProspects = planLimits?.max_prospects;

        if (maxProspects) {
          const { count } = await supabase
            .from("orbit_prospects")
            .select("*", { count: "exact", head: true })
            .eq("empresa_id", empresaId);

          if (count !== null && count >= maxProspects) {
            console.log("[orbit-webhook] Prospect limit reached for empresa:", empresaId);
            if (logId) await supabase.from("orbit_webhook_logs").update({ status: "ignored", error_message: "prospect_limit_reached" }).eq("id", logId);
            return new Response(JSON.stringify({ ok: true, skipped: true, reason: "prospect_limit_reached" }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
      }

      const insertData: any = {
        nome_razao: `WhatsApp ${normalizedPhone}`,
        telefone: normalizedPhone,
        whatsapp: normalizedPhone,
        whatsapp_status: "nao_verificado",
        origem_contato: "PROSPECTS",
        status_qualificacao: "novo",
      };
      if (empresaId) insertData.empresa_id = empresaId;

      const { data: newProspect, error: prospectError } = await supabase
        .from("orbit_prospects")
        .insert(insertData)
        .select()
        .single();

      if (prospectError) {
        if (prospectError.code === "23505") {
          console.log("[orbit-webhook] Prospect duplicado, buscando por variantes de telefone");
          const fallbackOrFilter = phoneVariants
            .map(v => `whatsapp.eq.${v},telefone.eq.${v}`)
            .join(",");
          const { data: existingProspect } = await supabase
            .from("orbit_prospects")
            .select("*")
            .or(fallbackOrFilter)
            .maybeSingle();

          if (existingProspect) {
            if (!existingProspect.empresa_id && empresaId) {
              await supabase
                .from("orbit_prospects")
                .update({ empresa_id: empresaId })
                .eq("id", existingProspect.id);
              existingProspect.empresa_id = empresaId;
            }
            if (!existingProspect.whatsapp) {
              console.log("[orbit-webhook] Auto-preenchendo whatsapp (fallback) para prospect:", existingProspect.id);
              await supabase
                .from("orbit_prospects")
                .update({ whatsapp: normalizedPhone, whatsapp_status: "nao_verificado" })
                .eq("id", existingProspect.id);
              existingProspect.whatsapp = normalizedPhone;
            }
            prospect = existingProspect;
          } else {
            console.error("[orbit-webhook] Prospect duplicado mas não encontrado com OR:", normalizedPhone);
            if (logId) await supabase.from("orbit_webhook_logs").update({ status: "ignored", error_message: "duplicate_unresolved" }).eq("id", logId);
            return new Response(JSON.stringify({ ok: true, ignored: true, reason: "duplicate_unresolved" }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        } else {
          console.error("[orbit-webhook] Erro ao criar prospect:", prospectError);
          throw prospectError;
        }
      } else {
        prospect = newProspect;
      }
    }

    // Quarentena: prospect arquivado reversivelmente (deleted_at + dados_adicionais.quarantined)
    // continua recebendo histórico, mas NUNCA aciona a IA. Atendimento fica humano.
    const prospectQuarantined =
      !!prospect &&
      prospect.deleted_at != null &&
      (prospect.dados_adicionais as any)?.quarantined === true;
    if (prospectQuarantined) {
      console.log("[orbit-webhook] Prospect em quarentena, IA bloqueada:", prospect.id);
    }

    // 2. Find or create conversation — match by prospect + phone variants
    // para evitar duplicar quando entrada/saída usam formatos diferentes (com/sem 9)
    // Prospect em quarentena: conversa arquivada está com status 'fechada' — buscamos
    // também esse status para NÃO criar conversa nova (e não reabrir a IA).
    const conversaStatuses = prospectQuarantined ? ["aberta", "fechada"] : ["aberta"];
    let conversaQuery = supabase
      .from("orbit_conversas")
      .select("*")
      .eq("prospect_id", prospect.id)
      .eq("canal", "whatsapp")
      .in("status", conversaStatuses)
      .order("ultima_mensagem_at", { ascending: false, nullsFirst: false })
      .limit(1);
    if (empresaId) conversaQuery = conversaQuery.eq("empresa_id", empresaId);

    let { data: conversaRows } = await conversaQuery;
    let conversa = conversaRows?.[0] || null;

    if (!conversa) {
      let altQuery = supabase
        .from("orbit_conversas")
        .select("*")
        .in("telefone_whatsapp", phoneVariants)
        .eq("canal", "whatsapp")
        .in("status", conversaStatuses)
        .order("ultima_mensagem_at", { ascending: false, nullsFirst: false })
        .limit(1);
      if (empresaId) altQuery = altQuery.eq("empresa_id", empresaId);
      const { data: altRows } = await altQuery;
      conversa = altRows?.[0] || null;
    }


    if (conversa && conversa.telefone_whatsapp !== normalizedPhone) {
      await supabase
        .from("orbit_conversas")
        .update({ telefone_whatsapp: normalizedPhone })
        .eq("id", conversa.id);
      conversa.telefone_whatsapp = normalizedPhone;
    }

    if (!conversa) {
      const insertConversa: any = {
        prospect_id: prospect.id,
        telefone_whatsapp: normalizedPhone,
        canal: "whatsapp",
        // Prospect em quarentena nunca abre conversa ativa nem entrega para a IA.
        status: prospectQuarantined ? "fechada" : "aberta",
        human_talk: prospectQuarantined ? true : false,
        mensagens_nao_lidas: 0,
      };
      if (prospectQuarantined) {
        insertConversa.ai_processing = false;
        insertConversa.archived_at = new Date().toISOString();
        insertConversa.quarantine_reason = "legacy_fluxrow_instance_backfill";
      }
      if (empresaId) insertConversa.empresa_id = empresaId;

      const { data: newConversa, error: conversaError } = await supabase
        .from("orbit_conversas")
        .insert(insertConversa)
        .select()
        .single();

      if (conversaError) {
        console.error("[orbit-webhook] Erro ao criar conversa:", conversaError);
        throw conversaError;
      }
      conversa = newConversa;
    }

    // Conversa em quarentena (por prospect arquivado ou marcação própria):
    // mantém histórico, força atendimento humano e bloqueia qualquer chamada à IA.
    const conversaQuarantined =
      prospectQuarantined || !!conversa?.archived_at || !!conversa?.quarantine_reason;
    if (conversaQuarantined && (conversa.human_talk !== true || conversa.ai_processing === true)) {
      await supabase
        .from("orbit_conversas")
        .update({ human_talk: true, ai_processing: false })
        .eq("id", conversa.id);
      conversa.human_talk = true;
      conversa.ai_processing = false;
    }

    // ── Corte de automação do tenant (orbit_ai_config.auto_reply_new_leads_from) ──
    // Prospect anterior ao corte: inbound é persistido e a UI atualiza normalmente,
    // porém a conversa fica humana para sempre — nunca agente, nunca D+1/D+3.
    // Tenant sem corte configurado: comportamento inalterado.
    const cutoffDecision = await evaluateAutomationCutoff(supabase, {
      empresa_id: empresaId,
      prospect_id: prospect?.id ?? null,
      prospect,
      conversa,
    });
    const automationAllowed = cutoffDecision.allowed;
    if (!automationAllowed && cutoffDecision.cutoff) {
      console.log("[orbit-webhook] automação bloqueada pelo corte do tenant:", {
        empresa_id: empresaId,
        prospect_id: prospect?.id,
        conversa_id: conversa?.id,
        reason: cutoffDecision.reason,
        cutoff: cutoffDecision.cutoff,
      });
      // Legado permanece explicitamente em atendimento humano.
      if (conversa?.id && conversa.human_talk !== true) {
        await supabase
          .from("orbit_conversas")
          .update({ human_talk: true, ai_processing: false })
          .eq("id", conversa.id);
        conversa.human_talk = true;
        conversa.ai_processing = false;
      }
    }




    // 3. Idempotência por (empresa_id, provider_message_id) — retry não duplica
    if (messageId) {
      const { data: existingMsg } = await supabase
        .from("orbit_mensagens")
        .select("id")
        .eq("empresa_id", empresaId)
        .eq("provider_message_id", messageId)
        .limit(1)
        .maybeSingle();

      if (existingMsg) {
        console.log("[orbit-webhook] Mensagem duplicada ignorada:", messageId);
        if (logId) await supabase.from("orbit_webhook_logs").update({ status: "ignored", error_message: "duplicate_message" }).eq("id", logId);
        return new Response(JSON.stringify({ ok: true, duplicate: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // 4. Save message with media fields
    const direcao = fromMe ? "OUT" : "IN";
    const previewText = safePreview(messageText, tipoMidia);

    let shouldProcessMedia = false;
    if (!fromMe && (tipoMidia === "image" || tipoMidia === "audio")) {
      const { data: mediaConfig } = await supabase
        .from("orbit_ai_config")
        .select("inbound_image_understanding_enabled, inbound_audio_transcription_enabled")
        .eq("empresa_id", empresaId)
        .maybeSingle();
      shouldProcessMedia = tipoMidia === "image"
        ? mediaConfig?.inbound_image_understanding_enabled === true
        : mediaConfig?.inbound_audio_transcription_enabled === true;
    }

    const { data: savedMessage, error: savedMessageError } = await supabase.from("orbit_mensagens").insert({
      conversa_id: conversa.id,
      direcao,
      mensagem: messageText || (tipoMidia ? `📎 ${tipoMidia}` : ""),
      provider_message_id: messageId,
      canal: "whatsapp",
      status: fromMe ? "enviada" : "recebida",
      empresa_id: empresaId,
      timestamp: inboundAt,
      tipo_midia: tipoMidia,
      url_midia: urlMidia,
      sender_type: externalOut ? "human_phone" : (fromMe ? "ai" : "lead"),
      media_processing_status: shouldProcessMedia ? "pending" : (tipoMidia ? "disabled" : null),
    }).select("id").single();
    if (savedMessageError) {
      // Corrida com retry concorrente do provedor: índice único absorve.
      if ((savedMessageError as any).code === "23505") {
        if (logId) await supabase.from("orbit_webhook_logs").update({ status: "ignored", error_message: "duplicate_message" }).eq("id", logId);
        return new Response(JSON.stringify({ ok: true, duplicate: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw savedMessageError;
    }


    // 4b. Email-CTA attribution: if this is an inbound message and the prospect
    // recently clicked an email CTA (last 14 days), record a one-time attribution event.
    if (!fromMe && empresaId && prospect?.id) {
      try {
        const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
        const { data: ctaClick } = await supabase
          .from("orbit_campaign_recipients")
          .select("campaign_id, clicked_at")
          .eq("empresa_id", empresaId)
          .eq("prospect_id", prospect.id)
          .not("clicked_at", "is", null)
          .gte("clicked_at", since)
          .order("clicked_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (ctaClick?.campaign_id) {
          const { data: alreadyLogged } = await supabase
            .from("prospect_events")
            .select("id")
            .eq("prospect_id", prospect.id)
            .eq("event_type", "email_cta_whatsapp_reply")
            .contains("metadata", { campaign_id: ctaClick.campaign_id })
            .maybeSingle();

          if (!alreadyLogged) {
            await supabase.from("prospect_events").insert({
              empresa_id: empresaId,
              prospect_id: prospect.id,
              event_type: "email_cta_whatsapp_reply",
              titulo: "Resposta via CTA de email",
              descricao: "Lead respondeu no WhatsApp após clicar no botão do email",
              metadata: { campaign_id: ctaClick.campaign_id, clicked_at: ctaClick.clicked_at },
            });
            console.log("[orbit-webhook] CTA attribution registered for prospect", prospect.id);
          }
        }
      } catch (attrErr) {
        console.warn("[orbit-webhook] CTA attribution skipped:", attrErr);
      }
    }


    // 5. Update conversation — visibilidade imediata na UI
    await supabase
      .from("orbit_conversas")
      .update({
        ultima_mensagem_at: inboundAt,
        ultima_mensagem_preview: previewText,
        mensagens_nao_lidas: fromMe ? 0 : (conversa.mensagens_nao_lidas || 0) + 1,
      })
      .eq("id", conversa.id);

    // 5a-lid. Correlação LID → lead/conversa persistida por tenant (nunca global).
    if (payloadLid && empresaId) {
      const { error: lidErr } = await supabase
        .from("orbit_whatsapp_lid_map")
        .upsert({
          empresa_id: empresaId,
          lid: payloadLid,
          telefone: normalizedPhone,
          prospect_id: prospect?.id ?? null,
          conversa_id: conversa?.id ?? null,
          instance_id: payloadInstanceId,
          resolved_via: lidResolvedVia ?? "payload_phone",
          updated_at: new Date().toISOString(),
        }, { onConflict: "empresa_id,lid" });
      if (lidErr) console.warn("[orbit-webhook] lid map upsert falhou:", lidErr.message);
    }

    // 5c. OUT externa (atendente falou pelo celular): pausa a IA imediatamente.
    //     human_user_id permanece null — não sabemos qual usuário escreveu.
    if (externalOut && conversa?.id) {
      const externalCtx = {
        ...((conversa.ai_contexto as Record<string, unknown>) ?? {}),
        external_human_active: true,
        external_human_at: new Date().toISOString(),
      };
      await supabase
        .from("orbit_conversas")
        .update({
          human_talk: true,
          ai_processing: false,
          handoff_sent_at: new Date().toISOString(),
          ai_contexto: externalCtx,
        })
        .eq("id", conversa.id);
      await supabase
        .from("orbit_ai_reply_debounce")
        .update({ status: "canceled", last_error: "external_human_out", updated_at: new Date().toISOString() })
        .eq("conversa_id", conversa.id)
        .in("status", ["pending", "generating"]);
      console.log(JSON.stringify({
        event: "external_out_processed",
        empresa_id: empresaId,
        conversa_id: conversa.id,
      }));
      if (logId) await supabase.from("orbit_webhook_logs").update({ status: "processed", error_message: "external_out_processed" }).eq("id", logId);
      return new Response(JSON.stringify({ ok: true, external_out: true, conversa_id: conversa.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5b. Lead respondeu → cancela cadência (D+1/D+3) e outbox futuro ligado a ela.
    //     Nunca cancela a resposta atual (ai_reply/manual ficam fora do escopo).
    if (!fromMe && prospect?.id) {
      const { data: canceled, error: cancelError } = await supabase.rpc("cancel_cadence_on_reply", {
        _empresa_id: empresaId,
        _prospect_id: prospect.id,
        _reason: "replied",
      });
      if (cancelError) console.error("[orbit-webhook] cancel_cadence_on_reply falhou:", cancelError.message);
      else console.log("[orbit-webhook] cadência cancelada:", canceled);
    }


    // 6. Somente APÓS o commit do inbound: pipeline de mídia / agente.
    //    Falha aqui nunca desfaz a mensagem IN — apenas loga e libera retry.
    const correlationId = `inbound:${empresaId}:${messageId ?? savedMessage?.id}`;
    if (!fromMe && automationAllowed && !conversaQuarantined && !conversa.human_talk && shouldProcessMedia && savedMessage?.id) {
      try {
        const mediaResponse = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/orbit-inbound-media-processor`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            "Idempotency-Key": correlationId,
          },
          body: JSON.stringify({ message_id: savedMessage.id }),
        });
        if (!mediaResponse.ok) {
          const detail = (await mediaResponse.text()).slice(0, 300);
          console.error("[orbit-webhook] Erro ao processar mídia:", mediaResponse.status, detail);
        }
      } catch (mediaErr) {
        console.error("[orbit-webhook] media processor indisponível:", mediaErr instanceof Error ? mediaErr.message : mediaErr);
      }
    } else if (!fromMe && automationAllowed && !conversaQuarantined && !conversa.human_talk && prospect?.id && !((tipoMidia === "image" || tipoMidia === "audio") && !shouldProcessMedia)) {
      const { data: aiConfig } = await supabase
        .from("orbit_ai_config")
        .select("modo_automatico, ai_reply_debounce")
        .eq("empresa_id", empresaId)
        .maybeSingle();

      // Chamada do agente compartilhada pelos dois caminhos (legado e debounce).
      // A resposta gerada SEMPRE entra no orbit_whatsapp_outbox (o agente é o
      // produtor; orbit-whatsapp-outbox-tick é o único emissor).
      const invokeAgent = async (mensagem: string, extra: Record<string, unknown> = {}) => {
        try {
          const agentResponse = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/orbit-ai-agent`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              "x-orbit-internal-secret": Deno.env.get("ORBIT_AI_AGENT_SECRET") ?? "",
              "Idempotency-Key": correlationId,
            },
            body: JSON.stringify({
              conversa_id: conversa.id,
              prospect_id: prospect.id,
              mensagem,
              telefone: normalizedPhone,
              correlation_id: correlationId,
              ...extra,
            }),
          });
          if (!agentResponse.ok) {
            const detail = (await agentResponse.text()).slice(0, 300);
            console.error("[orbit-webhook] agente respondeu erro:", agentResponse.status, detail);
            await supabase.from("orbit_conversas").update({ ai_processing: false }).eq("id", conversa.id);
            return false;
          }
          return true;
        } catch (agentErr) {
          console.error("[orbit-webhook] Erro ao chamar AI agent:", agentErr instanceof Error ? agentErr.message : agentErr);
          await supabase.from("orbit_conversas").update({ ai_processing: false }).eq("id", conversa.id);
          return false;
        }
      };

      const debounceCfg = readDebounceConfig(aiConfig);

      if (aiConfig?.modo_automatico && debounceCfg) {
        // ── Debounce tenant-scoped: espera a janela após a ÚLTIMA inbound e
        //    responde uma única vez com o lote consolidado. Jobs anteriores são
        //    invalidados pelo claim_token (idempotente por construção).
        const claimToken = crypto.randomUUID();
        const fireAfter = computeFireAfter(inboundAt ?? new Date().toISOString(), debounceCfg.waitMs);
        const { error: claimErr } = await supabase
          .from("orbit_ai_reply_debounce")
          .upsert({
            conversa_id: conversa.id,
            empresa_id: empresaId,
            prospect_id: prospect.id,
            claim_token: claimToken,
            last_inbound_at: inboundAt ?? new Date().toISOString(),
            last_inbound_message_id: savedMessage?.id ?? null,
            fire_after: fireAfter,
            status: "pending",
            updated_at: new Date().toISOString(),
          }, { onConflict: "conversa_id" })
          .select("conversa_id");

        if (claimErr) {
          console.error("[orbit-webhook] debounce claim falhou, caindo no caminho imediato:", claimErr.message);
          await runImmediateAgentPath(supabase, conversa, prospect.id, messageText, invokeAgent);
        } else {
          console.log(JSON.stringify({
            event: "ai_reply_debounce_scheduled",
            empresa_id: empresaId,
            conversa_id: conversa.id,
            wait_ms: debounceCfg.waitMs,
          }));
          const job = (async () => {
            await new Promise((r) => setTimeout(r, msUntil(fireAfter)));
            await fireDebouncedReply({
              supabase,
              empresaId,
              conversa,
              prospectId: prospect.id,
              claimToken,
              cfg: debounceCfg,
              receivedAt: inboundAt ?? new Date().toISOString(),
              inboundMessageId: savedMessage?.id ?? messageId ?? conversa.id,
              fallbackText: messageText,
              invokeAgent,
            });
          })();
          // @ts-ignore EdgeRuntime é global no runtime Supabase
          if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(job);
          else await job;
        }
      } else if (aiConfig?.modo_automatico) {
        await runImmediateAgentPath(supabase, conversa, prospect.id, messageText, invokeAgent);
      } else {
        console.log("[orbit-webhook] modo automático desligado — sem resposta da IA");
      }
    } else if (!fromMe && !prospect?.id) {
      console.log("[orbit-webhook] contato sem prospect vinculado — visível para atendimento humano, sem resposta automática");
    }

    if (logId) await supabase.from("orbit_webhook_logs").update({ status: "processed" }).eq("id", logId);


    return new Response(JSON.stringify({ ok: true, event: eventType, prospect_id: prospect.id, conversa_id: conversa.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[orbit-webhook] Erro:", message);
    if (logId) {
      try {
        await supabase.from("orbit_webhook_logs").update({ status: "failed", error_message: message }).eq("id", logId);
      } catch { /* best-effort logging */ }
    }
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

}
