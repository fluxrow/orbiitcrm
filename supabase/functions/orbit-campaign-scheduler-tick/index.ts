// orbit-campaign-scheduler-tick
// Cron worker que dispara campanhas agendadas.
// Autenticado exclusivamente pelo CAMPAIGN_SCHEDULER_CRON_TOKEN.
// Delega o envio para send-orbit-campaign em modo interno (header x-campaign-scheduler-token).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  canResumePausadaPorLimite,
  loadCampaignSendingConfig,
  loadCampaignDailyUsage,
} from "../_shared/whatsapp-campaign-quota.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_TOKEN = Deno.env.get("CAMPAIGN_SCHEDULER_CRON_TOKEN") ?? "";
const FUNCTIONS_BASE = `${SUPABASE_URL}/functions/v1`;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

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
  const results: any[] = [];
  let claimed = 0, dispatched = 0, errors = 0;

  try {
    let body: any = {};
    try { body = await req.json(); } catch { /* empty */ }
    const batch = Math.max(1, Math.min(50, Number(body?.batch ?? 10)));

    const nowIso = new Date().toISOString();

    const { data: candidates, error: qErr } = await supabase
      .from("orbit_campaigns")
      .select("id, empresa_id, canal, agendada_para, status, aprovacao_status")
      .eq("status", "agendada")
      .eq("aprovacao_status", "aprovada")
      .lte("agendada_para", nowIso)
      .order("agendada_para", { ascending: true })
      .limit(batch);

    if (qErr) throw new Error(qErr.message);

    for (const c of (candidates ?? [])) {
      // Claim idempotente: UPDATE ... WHERE id=? AND status='agendada' RETURNING id
      const { data: claimed_row, error: claimErr } = await supabase
        .from("orbit_campaigns")
        .update({ status: "aprovada_para_envio" })
        .eq("id", c.id)
        .eq("status", "agendada")
        .select("id")
        .maybeSingle();

      if (claimErr) {
        errors++;
        results.push({ id: c.id, ok: false, error: `claim: ${claimErr.message}` });
        continue;
      }
      if (!claimed_row) {
        // Outro tick já pegou.
        continue;
      }
      claimed++;

      try {
        const resp = await fetch(`${FUNCTIONS_BASE}/send-orbit-campaign`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${SERVICE_KEY}`,
            "x-campaign-scheduler-token": CRON_TOKEN,
          },
          body: JSON.stringify({ campaign_id: c.id }),
        });
        const json = await resp.json().catch(() => ({}));
        const ok = resp.ok && (json?.ok === true);
        if (ok) dispatched++;
        else errors++;
        results.push({ id: c.id, ok, http: resp.status, error: json?.error ?? null });
        console.log(JSON.stringify({
          scope: "campaign_scheduler_tick", tick_id: tickId, campaign_id: c.id,
          empresa_id: c.empresa_id, canal: c.canal, ok, http: resp.status,
        }));
      } catch (e: any) {
        errors++;
        const msg = String(e?.message ?? e).slice(0, 500);
        results.push({ id: c.id, ok: false, error: msg });
        // Volta para 'agendada' para nova tentativa no próximo tick.
        await supabase
          .from("orbit_campaigns")
          .update({ status: "agendada" })
          .eq("id", c.id)
          .eq("status", "aprovada_para_envio");
      }
    }

    // ── Auto-resume: campanhas 'enviando' órfãs (função caiu por timeout) ──
    // Critério: status='enviando', com destinatários pendentes, e sem atividade
    // (nenhum envio nos últimos 90s). Reinvoca send-orbit-campaign para retomar.
    let resumed = 0;
    try {
      const staleCutoffIso = new Date(Date.now() - 90_000).toISOString();
      const { data: enviando } = await supabase
        .from("orbit_campaigns")
        .select("id, empresa_id, canal")
        .eq("status", "enviando")
        .limit(20);

      for (const c of (enviando ?? [])) {
        // Tem pendentes?
        const { count: pending } = await supabase
          .from("orbit_campaign_recipients")
          .select("*", { count: "exact", head: true })
          .eq("campaign_id", c.id)
          .eq("status", "pendente");
        if (!pending || pending === 0) continue;

        // Último envio recente? Se sim, ainda está rodando — pular.
        const { data: lastSent } = await supabase
          .from("orbit_campaign_recipients")
          .select("enviado_em")
          .eq("campaign_id", c.id)
          .eq("status", "enviado")
          .order("enviado_em", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (lastSent?.enviado_em && lastSent.enviado_em > staleCutoffIso) continue;

        try {
          const resp = await fetch(`${FUNCTIONS_BASE}/send-orbit-campaign`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${SERVICE_KEY}`,
              "x-campaign-scheduler-token": CRON_TOKEN,
            },
            body: JSON.stringify({ campaign_id: c.id }),
          });
          const json = await resp.json().catch(() => ({}));
          const okResp = resp.ok && (json?.ok === true);
          if (okResp) resumed++;
          else errors++;
          results.push({ id: c.id, resumed: okResp, http: resp.status, pending });
          console.log(JSON.stringify({
            scope: "campaign_scheduler_resume", tick_id: tickId, campaign_id: c.id,
            empresa_id: c.empresa_id, ok: okResp, http: resp.status, pending,
          }));
        } catch (e: any) {
          errors++;
          results.push({ id: c.id, resumed: false, error: String(e?.message ?? e).slice(0, 300) });
        }
      }
    } catch (e: any) {
      console.error("auto_resume_error", e?.message ?? e);
    }

    // ── Auto-resume: campanhas 'pausada_por_limite' cujo tenant já tem cota do dia ──
    // Regra: só sources aprovadas + status=pausada_por_limite + pendentes > 0.
    // Não toca em 'pausada' (manual), reprovada, cancelada, concluída, enviando ou agendada.
    // Usa a MESMA função de cota do send-orbit-campaign (whatsapp-campaign-quota.ts).
    let resumed_limit = 0;
    try {
      const { data: pausadas } = await supabase
        .from("orbit_campaigns")
        .select("id, empresa_id, canal, aprovacao_status, status")
        .eq("status", "pausada_por_limite")
        .eq("aprovacao_status", "aprovada")
        .eq("canal", "whatsapp")
        .limit(20);

      for (const c of (pausadas ?? [])) {
        if (!c.empresa_id) continue;

        const { count: pending } = await supabase
          .from("orbit_campaign_recipients")
          .select("*", { count: "exact", head: true })
          .eq("campaign_id", c.id)
          .eq("status", "pendente");
        if (!pending || pending === 0) continue;

        const cfg = await loadCampaignSendingConfig(supabase, c.empresa_id);
        if (!cfg.enabled) {
          results.push({ id: c.id, resume_limit: false, reason: "rhythm_disabled" });
          continue;
        }

        const { sentCount, usageDate } = await loadCampaignDailyUsage(supabase, c.empresa_id);
        const { resume, effectiveLimit, remaining } = canResumePausadaPorLimite({
          config: cfg,
          dailySentCount: sentCount,
        });

        if (!resume) {
          results.push({
            id: c.id,
            resume_limit: false,
            reason: "still_over_limit",
            sent: sentCount, effective_limit: effectiveLimit, usage_date: usageDate,
          });
          continue;
        }

        // Claim idempotente: pausada_por_limite -> aprovada_para_envio
        const { data: claimedRow, error: claimErr } = await supabase
          .from("orbit_campaigns")
          .update({ status: "aprovada_para_envio" })
          .eq("id", c.id)
          .eq("status", "pausada_por_limite")
          .eq("aprovacao_status", "aprovada")
          .select("id")
          .maybeSingle();

        if (claimErr) {
          errors++;
          results.push({ id: c.id, resume_limit: false, error: `claim: ${claimErr.message}` });
          continue;
        }
        if (!claimedRow) {
          // Outro tick venceu a corrida.
          continue;
        }

        try {
          const resp = await fetch(`${FUNCTIONS_BASE}/send-orbit-campaign`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${SERVICE_KEY}`,
              "x-campaign-scheduler-token": CRON_TOKEN,
            },
            body: JSON.stringify({ campaign_id: c.id }),
          });
          const json = await resp.json().catch(() => ({}));
          const okResp = resp.ok && (json?.ok === true);
          if (okResp) resumed_limit++;
          else errors++;
          results.push({
            id: c.id, resume_limit: okResp, http: resp.status,
            sent: sentCount, effective_limit: effectiveLimit, remaining, pending,
          });
          console.log(JSON.stringify({
            scope: "campaign_scheduler_resume_limit", tick_id: tickId, campaign_id: c.id,
            empresa_id: c.empresa_id, ok: okResp, http: resp.status,
            sent: sentCount, effective_limit: effectiveLimit, remaining, pending,
          }));
        } catch (e: any) {
          errors++;
          const msg = String(e?.message ?? e).slice(0, 300);
          results.push({ id: c.id, resume_limit: false, error: msg });
          // Rollback do claim para permitir novo tick.
          await supabase
            .from("orbit_campaigns")
            .update({ status: "pausada_por_limite" })
            .eq("id", c.id)
            .eq("status", "aprovada_para_envio");
        }
      }
    } catch (e: any) {
      console.error("auto_resume_pausada_por_limite_error", e?.message ?? e);
    }

    const summary = { tick_id: tickId, claimed, dispatched, resumed, resumed_limit, errors, duration_ms: Date.now() - t0 };
    console.log(JSON.stringify({ scope: "campaign_scheduler_tick_summary", ...summary }));
    return new Response(JSON.stringify({ ok: true, data: { ...summary, results } }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("campaign-scheduler-tick fatal", e);
    return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e), tick_id: tickId }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
