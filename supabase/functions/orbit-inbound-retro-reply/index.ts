// orbit-inbound-retro-reply
// Job retroativo AUDITÁVEL de respostas a mensagens IN sem resposta.
//
// Garantias:
//  • Somente super_admin (Bearer do usuário) — nunca exposto a clientes.
//  • NUNCA chama Z-API. A resposta é gerada pelo orbit-ai-agent, que enfileira
//    em orbit_whatsapp_outbox com idempotency_key determinística
//    (`<empresa>|ai_reply|<last_in_message_id>:text`). Reexecução não duplica.
//  • Considera APENAS a última mensagem IN de cada conversa e no máximo UMA
//    resposta por conversa por execução.
//  • Exclui conversas quarantined/arquivadas, prospects deletados, human_talk,
//    e prospects criados por backfill.
//  • Respeita as vagas restantes do warm-up/limite diário do tenant: nunca
//    enfileira mais do que `effectiveDailyLimit - enviados_hoje`.
//  • Execução serial (uma conversa por vez).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ok, fail, optionsResponse, ErrorCodes } from "../_shared/responses.ts";
import { effectiveDailyLimit, saoPauloDayStartIso } from "../_shared/outbox-quota.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Candidate {
  conversa_id: string;
  prospect_id: string | null;
  telefone: string | null;
  last_in_id: string;
  last_in_at: string;
  last_in_text: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse(req);

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Autorização: (a) token interno de operação (RETRO_JOB_TOKEN, comparação em
    // tempo constante) ou (b) Bearer de usuário com role super_admin.
    const opToken = Deno.env.get("RETRO_JOB_TOKEN") ?? "";
    const provided = req.headers.get("x-retro-job-token") ?? "";
    let authorized = false;
    if (opToken && provided.length === opToken.length) {
      let diff = 0;
      for (let i = 0; i < opToken.length; i++) diff |= opToken.charCodeAt(i) ^ provided.charCodeAt(i);
      authorized = diff === 0;
    }

    // Operação server-side: Bearer igual à service role key (nunca exposta ao
    // cliente; equivale a acesso administrativo já total ao banco).
    if (!authorized) {
      const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
      if (bearer && bearer.length === SERVICE_KEY.length) {
        let diff = 0;
        for (let i = 0; i < SERVICE_KEY.length; i++) diff |= SERVICE_KEY.charCodeAt(i) ^ bearer.charCodeAt(i);
        authorized = diff === 0;
      }
    }

    if (!authorized) {
      const authHeader = req.headers.get("Authorization") ?? "";
      if (!authHeader.startsWith("Bearer ")) {
        return fail(ErrorCodes.UNAUTHORIZED, "Não autorizado", 401, undefined, req);
      }
      const { data: userData, error: userErr } = await supabase.auth.getUser(authHeader.slice(7));
      if (userErr || !userData?.user) {
        return fail(ErrorCodes.UNAUTHORIZED, "Token inválido", 401, undefined, req);
      }
      const { data: superRow } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userData.user.id)
        .eq("role", "super_admin")
        .maybeSingle();
      if (!superRow) {
        return fail(ErrorCodes.UNAUTHORIZED, "Apenas super_admin", 403, undefined, req);
      }
    }


    const body = await req.json().catch(() => ({}));
    const empresa_id: string | undefined = body?.empresa_id;
    const hours = Math.max(1, Math.min(48, Number(body?.hours ?? 6)));
    const maxItems = Math.max(1, Math.min(50, Number(body?.max ?? 10)));
    const dryRun = body?.dry_run === true;
    // Modo alvo (recuperação cirúrgica): lista explícita de pares conversa/inbound.
    const targets: Array<{ conversa_id: string; inbound_id: string }> = Array.isArray(body?.targets)
      ? body.targets.filter((t: any) => typeof t?.conversa_id === "string" && typeof t?.inbound_id === "string")
      : [];
    // Textos OUT que NÃO contam como resposta real (ex.: fallback de fora do horário).
    const ignoreOutTexts: string[] = Array.isArray(body?.ignore_out_texts)
      ? body.ignore_out_texts.filter((t: any) => typeof t === "string" && t.trim().length > 10).slice(0, 5)
      : [];
    // Hold de envio + cadência: cada item enfileirado recebe scheduled_for no
    // futuro (hold_seconds) e, opcionalmente, espaçamento fixo entre itens
    // (stagger_seconds). Isso permite validar antes de qualquer envio real e
    // garantir cadência máxima de 1 mensagem por janela. Nunca relaxa gates.
    const holdSeconds = Math.max(0, Math.min(86400, Number(body?.hold_seconds ?? 0)));
    const staggerSeconds = Math.max(0, Math.min(3600, Number(body?.stagger_seconds ?? 0)));
    const recoveryTagRaw = typeof body?.recovery_tag === "string" ? body.recovery_tag.trim() : "";
    const recoveryTag = /^[a-z0-9][a-z0-9_-]{2,39}$/i.test(recoveryTagRaw) ? recoveryTagRaw : null;
    if (targets.length > 0 && !recoveryTag) {
      return fail(ErrorCodes.VALIDATION_ERROR, "recovery_tag é obrigatório no modo targets", 400, undefined, req);
    }
    if (!empresa_id) {
      return fail(ErrorCodes.VALIDATION_ERROR, "empresa_id é obrigatório", 400, undefined, req);
    }

    // ── Vagas restantes do warm-up/limite diário ──
    const { data: cfg } = await supabase
      .from("orbit_whatsapp_sending_config")
      .select("daily_limit, warmup_enabled, warmup_start_date, enabled, outbox_adapter_enabled")
      .eq("empresa_id", empresa_id)
      .maybeSingle();
    const effective = effectiveDailyLimit(cfg ?? {});
    const { count: sentToday } = await supabase
      .from("orbit_whatsapp_outbox")
      .select("id", { count: "exact", head: true })
      .eq("empresa_id", empresa_id)
      .eq("status", "sent")
      .gte("sent_at", saoPauloDayStartIso());
    const consumed = sentToday ?? 0;
    const remaining = effective.limit == null
      ? maxItems
      : Math.max(0, effective.limit - consumed);

    // Corte de automação do tenant (nunca responder lead pré-corte).
    const { data: aiCfg } = await supabase
      .from("orbit_ai_config")
      .select("auto_reply_new_leads_from")
      .eq("empresa_id", empresa_id)
      .maybeSingle();
    const cutoffMs = aiCfg?.auto_reply_new_leads_from ? Date.parse(aiCfg.auto_reply_new_leads_from) : null;

    // ── Candidatos ──
    const sinceIso = new Date(Date.now() - hours * 3600_000).toISOString();
    let convs: any[] = [];
    if (targets.length > 0) {
      const { data, error } = await supabase
        .from("orbit_conversas")
        .select("id, prospect_id, human_talk, archived_at, quarantine_reason, status, created_at, ultima_mensagem_at")
        .eq("empresa_id", empresa_id)
        .in("id", targets.map((t) => t.conversa_id));
      if (error) throw new Error(error.message);
      convs = data ?? [];
    } else {
      const { data, error: convErr } = await supabase
        .from("orbit_conversas")
        .select("id, prospect_id, human_talk, archived_at, quarantine_reason, status, created_at, ultima_mensagem_at")
        .eq("empresa_id", empresa_id)
        .is("archived_at", null)
        .is("quarantine_reason", null)
        .neq("status", "fechada")
        .gte("ultima_mensagem_at", sinceIso)
        .order("ultima_mensagem_at", { ascending: true });
      if (convErr) throw new Error(convErr.message);
      convs = data ?? [];
    }

    const candidates: Candidate[] = [];
    const skipped: Array<{ conversa_id: string; reason: string }> = [];
    for (const t of targets) {
      if (!convs.some((c) => c.id === t.conversa_id)) {
        skipped.push({ conversa_id: t.conversa_id, reason: "conversa_missing_or_cross_tenant" });
      }
    }

    for (const c of convs as any[]) {
      const target = targets.find((t) => t.conversa_id === c.id) ?? null;
      if (targets.length > 0 && !target) continue;
      if (c.archived_at) { skipped.push({ conversa_id: c.id, reason: "archived" }); continue; }
      if (c.quarantine_reason) { skipped.push({ conversa_id: c.id, reason: "quarantined" }); continue; }
      if (c.status === "fechada") { skipped.push({ conversa_id: c.id, reason: "conversa_fechada" }); continue; }
      if (c.human_talk === true) { skipped.push({ conversa_id: c.id, reason: "human_talk" }); continue; }
      if (!c.prospect_id) { skipped.push({ conversa_id: c.id, reason: "no_prospect" }); continue; }

      const { data: p } = await supabase
        .from("orbit_prospects")
        .select("id, empresa_id, deleted_at, origem_lead, telefone, optout_whatsapp, created_at")
        .eq("id", c.prospect_id)
        .maybeSingle();
      if (!p || p.empresa_id !== empresa_id) { skipped.push({ conversa_id: c.id, reason: "prospect_missing_or_cross_tenant" }); continue; }
      if (p.deleted_at) { skipped.push({ conversa_id: c.id, reason: "prospect_deleted" }); continue; }
      if (p.optout_whatsapp === true) { skipped.push({ conversa_id: c.id, reason: "optout_whatsapp" }); continue; }
      if (p.origem_lead === "backfill_webhook") { skipped.push({ conversa_id: c.id, reason: "backfill_data" }); continue; }
      if (cutoffMs != null) {
        const bornMs = Date.parse(p.created_at ?? c.created_at);
        if (!Number.isFinite(bornMs) || bornMs < cutoffMs) {
          skipped.push({ conversa_id: c.id, reason: "pre_automation_cutoff" });
          continue;
        }
      }

      const { data: lastIn } = await supabase
        .from("orbit_mensagens")
        .select("id, timestamp, mensagem, empresa_id, direcao")
        .eq("conversa_id", c.id)
        .eq("direcao", "IN")
        .order("timestamp", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!lastIn) { skipped.push({ conversa_id: c.id, reason: "no_inbound" }); continue; }
      if (lastIn.empresa_id !== empresa_id) { skipped.push({ conversa_id: c.id, reason: "inbound_cross_tenant" }); continue; }
      if (target && lastIn.id !== target.inbound_id) {
        skipped.push({ conversa_id: c.id, reason: "inbound_not_last_in" });
        continue;
      }
      if (!target && new Date(lastIn.timestamp).getTime() < Date.parse(sinceIso)) {
        skipped.push({ conversa_id: c.id, reason: "inbound_too_old" });
        continue;
      }

      const { data: outsAfter } = await supabase
        .from("orbit_mensagens")
        .select("id, mensagem, status")
        .eq("conversa_id", c.id)
        .eq("direcao", "OUT")
        .gt("timestamp", lastIn.timestamp);
      // Somente OUT REALMENTE entregues contam como resposta. Linhas visuais que
      // nunca saíram (queued/cancelada/falhou) não bloqueiam a recuperação.
      const NON_DELIVERED_OUT = new Set(["queued", "cancelada", "canceled", "falhou", "failed", "pendente"]);
      const realOuts = (outsAfter ?? []).filter(
        (o: any) =>
          !NON_DELIVERED_OUT.has(String(o.status ?? "").toLowerCase()) &&
          !ignoreOutTexts.some((t) => String(o.mensagem ?? "").trim() === t.trim()),
      );
      if (realOuts.length > 0) { skipped.push({ conversa_id: c.id, reason: "already_answered" }); continue; }

      // Idempotência: já existe outbox ai_reply para esta IN (no mesmo escopo)?
      const scopePrefix = recoveryTag ? `${recoveryTag}:` : "";
      const { count: already } = await supabase
        .from("orbit_whatsapp_outbox")
        .select("id", { count: "exact", head: true })
        .eq("empresa_id", empresa_id)
        .eq("conversa_id", c.id)
        .eq("source_type", "ai_reply")
        .eq("idempotency_key", `${scopePrefix}|ai_reply|${empresa_id}|${c.prospect_id}|${lastIn.id}:text`);
      if ((already ?? 0) > 0) { skipped.push({ conversa_id: c.id, reason: "already_enqueued" }); continue; }

      candidates.push({
        conversa_id: c.id,
        prospect_id: c.prospect_id,
        telefone: p.telefone ?? null,
        last_in_id: lastIn.id,
        last_in_at: lastIn.timestamp,
        last_in_text: String(lastIn.mensagem ?? ""),
      });
    }

    // No modo targets (recuperação cirúrgica de respostas engajadas), o teto de
    // prospecção diário NÃO se aplica: cada item está vinculado a um inbound real
    // e o worker é a autoridade final (reserva engajada, teto por conversa, 2/min).
    const cap = targets.length > 0
      ? Math.min(candidates.length, maxItems)
      : Math.min(candidates.length, maxItems, remaining);
    const selected = candidates.slice(0, cap);

    const results: Array<Record<string, unknown>> = [];
    if (!dryRun) {
      const secret = Deno.env.get("ORBIT_AI_AGENT_SECRET") ?? "";
      if (!secret) {
        return fail(ErrorCodes.INTERNAL_ERROR, "ORBIT_AI_AGENT_SECRET ausente", 503, undefined, req);
      }
      const holdBaseMs = Date.now() + holdSeconds * 1000;
      for (let idx = 0; idx < selected.length; idx++) {
        const cand = selected[idx];
        const t0 = Date.now();
        const holdUntil = holdSeconds > 0 || staggerSeconds > 0
          ? new Date(holdBaseMs + idx * staggerSeconds * 1000).toISOString()
          : null;
        try {
          const resp = await fetch(`${SUPABASE_URL}/functions/v1/orbit-ai-agent`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${SERVICE_KEY}`,
              "x-orbit-internal-secret": secret,
            },
            body: JSON.stringify({
              conversa_id: cand.conversa_id,
              prospect_id: cand.prospect_id,
              mensagem: cand.last_in_text,
              telefone: cand.telefone,
              inbound_message_id: cand.last_in_id,
              ...(recoveryTag ? { recovery_tag: recoveryTag } : {}),
              ...(holdUntil ? { outbox_hold_until: holdUntil } : {}),
            }),
          });
          const json = await resp.json().catch(() => ({}));
          results.push({
            conversa_id: cand.conversa_id,
            last_in_id: cand.last_in_id,
            http_status: resp.status,
            agent_ok: json?.ok !== false,
            hold_until: holdUntil,
            duration_ms: Date.now() - t0,
          });
        } catch (e) {
          results.push({
            conversa_id: cand.conversa_id,
            last_in_id: cand.last_in_id,
            error: String((e as Error).message).slice(0, 300),
          });
        }
      }
    }

    // Estado final do outbox (sem PII: nunca retorna payload/mensagem).
    const { data: outboxRows } = await supabase
      .from("orbit_whatsapp_outbox")
      .select("id, conversa_id, source_type, payload_type, status, priority, created_at, sent_at, last_error, idempotency_key")
      .eq("empresa_id", empresa_id)
      .order("created_at", { ascending: false })
      .limit(15);

    return ok({
      empresa_id,
      dry_run: dryRun,
      hold_seconds: holdSeconds,
      stagger_seconds: staggerSeconds,
      warmup: { ...effective, consumed_today: consumed, remaining_slots: remaining },
      adapter_enabled: cfg?.outbox_adapter_enabled === true,
      eligible: candidates.length,
      generated: results.length,
      selected: selected.map((c) => ({ conversa_id: c.conversa_id, last_in_id: c.last_in_id, last_in_at: c.last_in_at })),
      results,
      skipped_sample: skipped.slice(0, 30),
      outbox_recent: outboxRows ?? [],
    }, undefined, req);
  } catch (e) {
    return fail(ErrorCodes.INTERNAL_ERROR, String((e as Error).message), 500, undefined, req);
  }
});
