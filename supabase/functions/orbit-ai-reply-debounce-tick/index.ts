// Tick de recuperação do debounce da resposta ativa.
//
// Só existe para cobrir runtimes que morreram antes de disparar o job em memória.
// NUNCA responde mensagens antigas: apenas linhas `pending` cuja janela venceu
// há mais que a carência e que continuam sendo o claim corrente da conversa.
// Nenhum envio direto: o agente é o produtor, o outbox-tick é o único emissor.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import {
  isRecoverable,
  readDebounceConfig,
  readLockBusyRetryFlag,
  DEBOUNCE_RECOVERY_GRACE_MS,
} from "../_shared/ai-reply-debounce.ts";
import {
  evaluateIncidentRecovery,
  INCIDENT_RECOVERY_MAX_AGE_MS,
  INCIDENT_RECOVERY_MIN_AGE_MS,
} from "../_shared/ai-incident-recovery.ts";

const MAX_ATTEMPTS = 3;
/** Não recupera nada mais velho que isso (zero reprocessamento de backlog). */
const MAX_AGE_MS = 10 * 60 * 1000;

serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const now = new Date();
  const results: Array<Record<string, unknown>> = [];

  try {
    // Recuperação persistente de inbound enfileirado cujo lease anterior terminou
    // por timeout/crash. O agente refaz o claim atômico usando o ID da mensagem IN;
    // este tick nunca envia ao WhatsApp diretamente.
    const { data: queuedEvents, error: queuedError } = await supabase.rpc(
      "list_ready_orbit_ai_execution_events",
      { _limit: 25 },
    );
    if (queuedError) console.warn("[orbit-ai-reply-debounce-tick] queued drain unavailable");
    for (const event of queuedEvents ?? []) {
      const { data: conversa } = await supabase
        .from("orbit_conversas")
        .select("prospect_id, human_talk")
        .eq("id", event.conversa_id)
        .eq("empresa_id", event.empresa_id)
        .maybeSingle();
      if (!conversa?.prospect_id || conversa.human_talk === true) continue;
      const { data: prospect } = await supabase
        .from("orbit_prospects")
        .select("telefone")
        .eq("id", conversa.prospect_id)
        .eq("empresa_id", event.empresa_id)
        .maybeSingle();
      const resp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/orbit-ai-agent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          "x-orbit-internal-secret": Deno.env.get("ORBIT_AI_AGENT_SECRET") ?? "",
        },
        body: JSON.stringify({
          conversa_id: event.conversa_id,
          prospect_id: conversa.prospect_id,
          telefone: prospect?.telefone ?? null,
          mensagem: "",
          inbound_message_id: event.inbound_message_id,
        }),
      });
      results.push({ conversa_id: event.conversa_id, action: resp.ok ? "queued_drained" : "queued_retry" });
    }

    // Recuperação automática estritamente limitada de incidentes recentes.
    // Uma conversa por tenant/tick; nunca recupera backlog, delivery_failed,
    // handoff humano, opt-out, fila pausada ou mensagem que deixou de ser a mais recente.
    const incidentMinAt = new Date(now.getTime() - INCIDENT_RECOVERY_MAX_AGE_MS).toISOString();
    const incidentMaxAt = new Date(now.getTime() - INCIDENT_RECOVERY_MIN_AGE_MS).toISOString();
    const { data: incidents, error: incidentsError } = await supabase
      .from("orbit_ai_delivery_incidents")
      .select("id, empresa_id, conversa_id, inbound_message_id, incident_type, status, inbound_at")
      .eq("status", "open")
      .in("incident_type", ["missing_dispatch", "execution_failed"])
      .gte("inbound_at", incidentMinAt)
      .lte("inbound_at", incidentMaxAt)
      .order("inbound_at", { ascending: true })
      .limit(20);
    if (incidentsError) console.warn("[orbit-ai-reply-debounce-tick] incident recovery unavailable");
    const recoveredTenants = new Set<string>();

    for (const incident of incidents ?? []) {
      if (recoveredTenants.has(incident.empresa_id)) continue;
      const [aiCfgResult, sendCfgResult, zapiResult, conversaResult, inboundResult, claimResult] = await Promise.all([
        supabase.from("orbit_ai_config")
          .select("modo_automatico, responder_fora_horario, horario_inicio, horario_fim")
          .eq("empresa_id", incident.empresa_id).maybeSingle(),
        supabase.from("orbit_whatsapp_sending_config")
          .select("enabled, outbox_adapter_enabled")
          .eq("empresa_id", incident.empresa_id).maybeSingle(),
        supabase.from("orbit_zapi_config")
          .select("ativo, instance_offline, envio_real_liberado, canary_mode_enabled, canary_phone_numbers")
          .eq("empresa_id", incident.empresa_id).eq("ativo", true).maybeSingle(),
        supabase.from("orbit_conversas")
          .select("prospect_id, telefone_whatsapp, status, human_talk, human_user_id, archived_at, quarantine_reason")
          .eq("empresa_id", incident.empresa_id).eq("id", incident.conversa_id).maybeSingle(),
        supabase.from("orbit_mensagens")
          .select("id, mensagem, media_extracted_text, timestamp, direcao")
          .eq("empresa_id", incident.empresa_id).eq("id", incident.inbound_message_id).maybeSingle(),
        supabase.from("orbit_ai_execution_claims")
          .select("status, attempts, finished_at")
          .eq("empresa_id", incident.empresa_id)
          .eq("conversa_id", incident.conversa_id)
          .eq("inbound_message_id", incident.inbound_message_id)
          .order("created_at", { ascending: false }).limit(1).maybeSingle(),
      ]);
      const aiCfg = aiCfgResult.data as any;
      const sendCfg = sendCfgResult.data as any;
      const zapi = zapiResult.data as any;
      const conversa = conversaResult.data as any;
      const inbound = inboundResult.data as any;
      const claim = claimResult.data as any;
      if (!conversa?.prospect_id || inbound?.direcao !== "IN") continue;

      const [prospectResult, latestInboundResult, outboundResult, outboxResult] = await Promise.all([
        supabase.from("orbit_prospects")
          .select("telefone, deleted_at, optout_whatsapp")
          .eq("empresa_id", incident.empresa_id).eq("id", conversa.prospect_id).maybeSingle(),
        supabase.from("orbit_mensagens")
          .select("id")
          .eq("empresa_id", incident.empresa_id).eq("conversa_id", incident.conversa_id)
          .eq("direcao", "IN").order("timestamp", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("orbit_mensagens")
          .select("id, status")
          .eq("empresa_id", incident.empresa_id).eq("conversa_id", incident.conversa_id)
          .eq("direcao", "OUT").gt("timestamp", incident.inbound_at).limit(20),
        supabase.from("orbit_whatsapp_outbox")
          .select("id, status")
          .eq("empresa_id", incident.empresa_id).eq("conversa_id", incident.conversa_id)
          .eq("source_type", "ai_reply").gte("created_at", incident.inbound_at)
          .in("status", ["pending", "processing", "sent"]).limit(1),
      ]);
      const prospect = prospectResult.data as any;
      const phone = String(conversa.telefone_whatsapp || prospect?.telefone || "").trim() || null;
      const realOutbounds = (outboundResult.data ?? []).filter((row: any) =>
        !["queued", "cancelada", "canceled", "falhou", "failed", "pendente"].includes(String(row.status ?? "").toLowerCase())
      );
      const decision = evaluateIncidentRecovery({
        incidentType: incident.incident_type,
        incidentStatus: incident.status,
        inboundAt: incident.inbound_at,
        now,
        automaticMode: aiCfg?.modo_automatico === true,
        sendingEnabled: sendCfg?.enabled === true,
        outboxAdapterEnabled: sendCfg?.outbox_adapter_enabled === true,
        zapiActive: zapi?.ativo === true,
        zapiOffline: zapi?.instance_offline === true,
        realSendEnabled: zapi?.envio_real_liberado === true,
        canaryModeEnabled: zapi?.canary_mode_enabled === true,
        canaryPhoneNumbers: Array.isArray(zapi?.canary_phone_numbers) ? zapi.canary_phone_numbers : [],
        phone,
        responderForaHorario: aiCfg?.responder_fora_horario === true,
        horarioInicio: aiCfg?.horario_inicio ?? null,
        horarioFim: aiCfg?.horario_fim ?? null,
        humanTalk: conversa.human_talk === true,
        humanUserId: conversa.human_user_id ?? null,
        archivedAt: conversa.archived_at ?? null,
        quarantineReason: conversa.quarantine_reason ?? null,
        conversationStatus: conversa.status ?? null,
        prospectDeletedAt: prospect?.deleted_at ?? null,
        prospectOptoutWhatsapp: prospect?.optout_whatsapp === true,
        latestInboundMessageId: latestInboundResult.data?.id ?? null,
        incidentInboundMessageId: incident.inbound_message_id,
        hasRealOutboundAfterInbound: realOutbounds.length > 0,
        hasActiveOutboxAfterInbound: (outboxResult.data?.length ?? 0) > 0,
        claimStatus: claim?.status ?? null,
        claimAttempts: Number(claim?.attempts ?? 0),
        claimFinishedAt: claim?.finished_at ?? null,
      });
      if (!decision.eligible) continue;

      const text = String(inbound.mensagem ?? inbound.media_extracted_text ?? "").trim();
      if (!text || !phone) continue;
      recoveredTenants.add(incident.empresa_id);
      const recoveryTag = `auto_incident_${String(incident.inbound_message_id).replace(/-/g, "").slice(0, 16)}`;
      const response = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/orbit-ai-agent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          "x-orbit-internal-secret": Deno.env.get("ORBIT_AI_AGENT_SECRET") ?? "",
          "Idempotency-Key": recoveryTag,
        },
        body: JSON.stringify({
          conversa_id: incident.conversa_id,
          prospect_id: conversa.prospect_id,
          telefone: phone,
          mensagem: text,
          inbound_message_id: incident.inbound_message_id,
          recovery_tag: recoveryTag,
          correlation_id: recoveryTag,
        }),
      });
      results.push({
        conversa_id: incident.conversa_id,
        action: response.ok ? "incident_recovered" : "incident_retry_failed",
        incident_type: incident.incident_type,
        http_status: response.status,
      });
    }

    // Busca com carência ZERO e aplica a carência por tenant abaixo:
    // o default (DEBOUNCE_RECOVERY_GRACE_MS) permanece inalterado.
    const { data: rows, error } = await supabase
      .from("orbit_ai_reply_debounce")
      .select("conversa_id, empresa_id, prospect_id, claim_token, fire_after, status, attempts, last_inbound_at, last_inbound_message_id")
      .eq("status", "pending")
      .lte("fire_after", now.toISOString())
      .gte("fire_after", new Date(now.getTime() - MAX_AGE_MS).toISOString())
      .order("fire_after", { ascending: true })
      .limit(50);
    if (error) throw error;

    for (const row of rows ?? []) {
      if ((row.attempts ?? 0) >= MAX_ATTEMPTS) {
        await supabase.from("orbit_ai_reply_debounce")
          .update({ status: "canceled", last_error: "max_attempts", updated_at: now.toISOString() })
          .eq("conversa_id", row.conversa_id).eq("claim_token", row.claim_token);
        results.push({ conversa_id: row.conversa_id, action: "canceled" });
        continue;
      }

      const { data: cfgRow } = await supabase
        .from("orbit_ai_config")
        .select("modo_automatico, ai_reply_debounce")
        .eq("empresa_id", row.empresa_id)
        .maybeSingle();
      const cfg = readDebounceConfig(cfgRow);
      const lockBusyDoesNotConsumeAttempt = readLockBusyRetryFlag(cfgRow as any);
      if (!cfg || !cfgRow?.modo_automatico) {
        await supabase.from("orbit_ai_reply_debounce")
          .update({ status: "canceled", last_error: "debounce_disabled", updated_at: now.toISOString() })
          .eq("conversa_id", row.conversa_id).eq("claim_token", row.claim_token);
        continue;
      }

      const graceRaw = (cfgRow as any)?.ai_reply_debounce?.recovery_grace_ms;
      const graceMs = Number.isFinite(Number(graceRaw))
        ? Math.min(120_000, Math.max(0, Math.round(Number(graceRaw))))
        : DEBOUNCE_RECOVERY_GRACE_MS;
      if (!isRecoverable(row as any, now, graceMs)) continue;

      const { data: conversa } = await supabase
        .from("orbit_conversas")
        .select("id, human_talk")
        .eq("id", row.conversa_id)
        .maybeSingle();
      if (!conversa || conversa.human_talk === true) {
        await supabase.from("orbit_ai_reply_debounce")
          .update({ status: "canceled", last_error: "human_talk", updated_at: now.toISOString() })
          .eq("conversa_id", row.conversa_id).eq("claim_token", row.claim_token);
        continue;
      }

      // Claim atômico: pending -> generating no mesmo token.
      const { data: claimed } = await supabase
        .from("orbit_ai_reply_debounce")
        .update({
          status: "generating",
          attempts: lockBusyDoesNotConsumeAttempt ? (row.attempts ?? 0) : (row.attempts ?? 0) + 1,
          updated_at: now.toISOString(),
        })
        .eq("conversa_id", row.conversa_id)
        .eq("claim_token", row.claim_token)
        .eq("status", "pending")
        .select("conversa_id");
      if (!claimed || claimed.length === 0) continue;

      // Consolida as inbound pendentes desde o último OUT.
      const { data: lastOut } = await supabase
        .from("orbit_mensagens")
        .select("timestamp")
        .eq("empresa_id", row.empresa_id)
        .eq("conversa_id", row.conversa_id)
        .eq("direcao", "OUT")
        .order("timestamp", { ascending: false })
        .limit(1)
        .maybeSingle();
      let q = supabase
        .from("orbit_mensagens")
        .select("id, mensagem, media_extracted_text, timestamp")
        .eq("empresa_id", row.empresa_id)
        .eq("conversa_id", row.conversa_id)
        .eq("direcao", "IN")
        .order("timestamp", { ascending: true })
        .limit(10);
      if (lastOut?.timestamp) q = q.gt("timestamp", lastOut.timestamp);
      const { data: ins, error: insError } = await q;
      if (insError) {
        // Erro de leitura NUNCA pode ser confundido com "nada a responder":
        // devolve a linha a pending para o próximo tick tentar de novo.
        await supabase.from("orbit_ai_reply_debounce")
          .update({ status: "pending", last_error: "inbound_read_failed", updated_at: now.toISOString() })
          .eq("conversa_id", row.conversa_id).eq("claim_token", row.claim_token);
        await supabase.from("orbit_conversas").update({ ai_processing: false }).eq("id", row.conversa_id);
        continue;
      }
      const texts = (ins ?? [])
        .map((m: any) => String(m.mensagem ?? m.media_extracted_text ?? "").trim())
        .filter(Boolean);
      if (texts.length === 0) {
        await supabase.from("orbit_ai_reply_debounce")
          .update({ status: "canceled", last_error: "nothing_to_answer", updated_at: now.toISOString() })
          .eq("conversa_id", row.conversa_id).eq("claim_token", row.claim_token);
        await supabase.from("orbit_conversas").update({ ai_processing: false }).eq("id", row.conversa_id);
        continue;
      }

      // Revalidação de POSSE ATUAL imediatamente antes de acionar o agente.
      // handoff_sent_at é histórico e não bloqueia sozinho.
      const { data: freshConversa } = await supabase
        .from("orbit_conversas")
        .select("human_talk, human_user_id")
        .eq("id", row.conversa_id)
        .maybeSingle();
      if (freshConversa?.human_talk === true || freshConversa?.human_user_id) {
        await supabase.from("orbit_conversas").update({ ai_processing: false }).eq("id", row.conversa_id);
        await supabase.from("orbit_ai_reply_debounce")
          .update({ status: "canceled", last_error: "human_talk", updated_at: now.toISOString() })
          .eq("conversa_id", row.conversa_id).eq("claim_token", row.claim_token);
        continue;
      }

      const { data: lockResult } = await supabase
        .from("orbit_conversas")
        .update({ ai_processing: true })
        .eq("id", row.conversa_id)
        .eq("ai_processing", false)
        .select("id");
      if (!lockResult || lockResult.length === 0) {
        await supabase.from("orbit_ai_reply_debounce")
          .update({ status: "pending", last_error: "lock_busy", updated_at: now.toISOString() })
          .eq("conversa_id", row.conversa_id).eq("claim_token", row.claim_token);
        continue;
      }

      // No modo seguro do Bullink, só uma chamada efetiva ao provider consome
      // tentativa. Lock ocupado é contenção normal, não falha do agente.
      if (lockBusyDoesNotConsumeAttempt) {
        await supabase.from("orbit_ai_reply_debounce")
          .update({ attempts: (row.attempts ?? 0) + 1, updated_at: now.toISOString() })
          .eq("conversa_id", row.conversa_id).eq("claim_token", row.claim_token);
      }

      const correlationId = `debounce-recovery:${row.empresa_id}:${row.conversa_id}:${row.claim_token}`;
      const resp = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/orbit-ai-agent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          "x-orbit-internal-secret": Deno.env.get("ORBIT_AI_AGENT_SECRET") ?? "",
          "Idempotency-Key": correlationId,
        },
        body: JSON.stringify({
          conversa_id: row.conversa_id,
          prospect_id: row.prospect_id,
          mensagem: texts.join("\n"),
          telefone: (ins?.[0] as any)?.telefone ?? null,
          inbound_message_id: (ins?.at(-1) as any)?.id ?? null,
          correlation_id: correlationId,
          debounced: true,
          batch_size: texts.length,
          received_at: row.last_inbound_at,
        }),
      });
      const ok = resp.ok;
      if (!ok) await supabase.from("orbit_conversas").update({ ai_processing: false }).eq("id", row.conversa_id);
      await supabase.from("orbit_ai_reply_debounce")
        .update({
          status: ok ? "done" : "pending",
          batch_size: texts.length,
          last_error: ok ? null : `agent_${resp.status}`,
          updated_at: new Date().toISOString(),
        })
        .eq("conversa_id", row.conversa_id).eq("claim_token", row.claim_token);
      results.push({ conversa_id: row.conversa_id, action: ok ? "recovered" : "retry", batch_size: texts.length });
    }

    return new Response(JSON.stringify({ ok: true, data: { processed: results.length, results } }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[orbit-ai-reply-debounce-tick] falhou:", e instanceof Error ? e.message : e);
    return new Response(JSON.stringify({ ok: false, error: "tick_failed" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
