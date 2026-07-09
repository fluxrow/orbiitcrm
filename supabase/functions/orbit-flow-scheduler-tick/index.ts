// orbit-flow-scheduler-tick
// Cron worker que executa ações agendadas do scheduler.
// Autenticado via SCHEDULER_CRON_TOKEN (nunca aceita clientes).
// Para cada linha reclamada, delega ao orbit-flow-executor no modo single_action.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_TOKEN = Deno.env.get("SCHEDULER_CRON_TOKEN") ?? "";
const FUNCTIONS_BASE = `${SUPABASE_URL}/functions/v1`;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Exponencial: 1, 2, 4, 8, 16 min (cap 60min); depois → error final
const MAX_ATTEMPTS = 5;
function backoffSecondsFor(attempt: number): number {
  const mins = Math.min(60, Math.pow(2, Math.max(0, attempt - 1)));
  return Math.round(mins * 60);
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
  let claimed = 0, success = 0, errors = 0, rescheduled = 0, dead = 0;

  try {
    let body: any = {};
    try { body = await req.json(); } catch { /* empty */ }
    const batch = Math.max(1, Math.min(100, Number(body?.batch ?? 25)));

    const { data: rows, error: claimErr } = await supabase.rpc("claim_scheduled_actions", { _batch: batch });
    if (claimErr) throw new Error(claimErr.message);
    claimed = (rows ?? []).length;

    for (const row of (rows ?? []) as any[]) {
      const rowT0 = Date.now();
      try {
        const resp = await fetch(`${FUNCTIONS_BASE}/orbit-flow-executor`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
          body: JSON.stringify({ mode: "single_action", scheduled_id: row.id }),
        });
        const json = await resp.json().catch(() => ({}));
        const ok = resp.ok && (json?.ok === true || json?.data?.ok === true);
        const stepError = json?.data?.error ?? json?.error ?? (ok ? null : `HTTP ${resp.status}`);

        if (ok) {
          success++;
          await supabase.from("orbit_flow_scheduled_actions")
            .update({ status: "success", last_error: null, locked_at: null, locked_by: null })
            .eq("id", row.id);
        } else if (row.attempts >= MAX_ATTEMPTS) {
          dead++; errors++;
          await supabase.from("orbit_flow_scheduled_actions")
            .update({ status: "error", last_error: String(stepError || "max attempts").slice(0, 500), locked_at: null, locked_by: null })
            .eq("id", row.id);
        } else {
          rescheduled++;
          await supabase.rpc("reschedule_scheduled_action", {
            _id: row.id,
            _delay_seconds: backoffSecondsFor(row.attempts),
            _error: String(stepError || "erro").slice(0, 500),
          });
        }
        console.log(JSON.stringify({
          scope: "scheduler_tick", tick_id: tickId, scheduled_id: row.id,
          empresa_id: row.empresa_id, flow_id: row.flow_id, action_type: row.action_type,
          attempt: row.attempts, ok, duration_ms: Date.now() - rowT0,
        }));
      } catch (e: any) {
        errors++;
        const msg = String(e?.message ?? e).slice(0, 500);
        if (row.attempts >= MAX_ATTEMPTS) {
          dead++;
          await supabase.from("orbit_flow_scheduled_actions")
            .update({ status: "error", last_error: msg, locked_at: null, locked_by: null })
            .eq("id", row.id);
        } else {
          rescheduled++;
          await supabase.rpc("reschedule_scheduled_action", {
            _id: row.id, _delay_seconds: backoffSecondsFor(row.attempts), _error: msg,
          });
        }
      }
    }

    const summary = { tick_id: tickId, claimed, success, errors, rescheduled, dead, duration_ms: Date.now() - t0 };
    console.log(JSON.stringify({ scope: "scheduler_tick_summary", ...summary }));
    return new Response(JSON.stringify({ ok: true, data: summary }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("scheduler-tick fatal", e);
    return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e), tick_id: tickId }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
