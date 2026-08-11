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

    // ── Candidatos: conversas ativas com última IN recente sem OUT posterior ──
    const sinceIso = new Date(Date.now() - hours * 3600_000).toISOString();
    const { data: convs, error: convErr } = await supabase
      .from("orbit_conversas")
      .select("id, prospect_id, human_talk, archived_at, quarantine_reason, status, ultima_mensagem_at")
      .eq("empresa_id", empresa_id)
      .is("archived_at", null)
      .is("quarantine_reason", null)
      .neq("status", "fechada")
      .gte("ultima_mensagem_at", sinceIso)
      .order("ultima_mensagem_at", { ascending: true });
    if (convErr) throw new Error(convErr.message);

    const candidates: Candidate[] = [];
    const skipped: Array<{ conversa_id: string; reason: string }> = [];

    for (const c of (convs ?? []) as any[]) {
      if (c.human_talk === true) { skipped.push({ conversa_id: c.id, reason: "human_talk" }); continue; }
      if (!c.prospect_id) { skipped.push({ conversa_id: c.id, reason: "no_prospect" }); continue; }

      const { data: p } = await supabase
        .from("orbit_prospects")
        .select("id, empresa_id, deleted_at, origem_lead, telefone")
        .eq("id", c.prospect_id)
        .maybeSingle();
      if (!p || p.empresa_id !== empresa_id) { skipped.push({ conversa_id: c.id, reason: "prospect_missing_or_cross_tenant" }); continue; }
      if (p.deleted_at) { skipped.push({ conversa_id: c.id, reason: "prospect_deleted" }); continue; }
      if (p.origem_lead === "backfill_webhook") { skipped.push({ conversa_id: c.id, reason: "backfill_data" }); continue; }

      const { data: lastIn } = await supabase
        .from("orbit_mensagens")
        .select("id, timestamp, mensagem")
        .eq("conversa_id", c.id)
        .eq("direcao", "IN")
        .order("timestamp", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!lastIn) { skipped.push({ conversa_id: c.id, reason: "no_inbound" }); continue; }
      if (new Date(lastIn.timestamp).getTime() < Date.parse(sinceIso)) {
        skipped.push({ conversa_id: c.id, reason: "inbound_too_old" });
        continue;
      }

      const { count: outAfter } = await supabase
        .from("orbit_mensagens")
        .select("id", { count: "exact", head: true })
        .eq("conversa_id", c.id)
        .eq("direcao", "OUT")
        .gt("timestamp", lastIn.timestamp);
      if ((outAfter ?? 0) > 0) { skipped.push({ conversa_id: c.id, reason: "already_answered" }); continue; }

      // Idempotência: já existe outbox ai_reply para esta última IN?
      const { count: already } = await supabase
        .from("orbit_whatsapp_outbox")
        .select("id", { count: "exact", head: true })
        .eq("empresa_id", empresa_id)
        .eq("conversa_id", c.id)
        .eq("source_type", "ai_reply")
        .eq("idempotency_key", `${empresa_id}|ai_reply|${lastIn.id}:text`);
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

    const cap = Math.min(candidates.length, maxItems, remaining);
    const selected = candidates.slice(0, cap);

    const results: Array<Record<string, unknown>> = [];
    if (!dryRun) {
      const secret = Deno.env.get("ORBIT_AI_AGENT_SECRET") ?? "";
      if (!secret) {
        return fail(ErrorCodes.INTERNAL_ERROR, "ORBIT_AI_AGENT_SECRET ausente", 503, undefined, req);
      }
      for (const cand of selected) {
        const t0 = Date.now();
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
            }),
          });
          const json = await resp.json().catch(() => ({}));
          results.push({
            conversa_id: cand.conversa_id,
            last_in_id: cand.last_in_id,
            http_status: resp.status,
            agent_ok: json?.ok !== false,
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
