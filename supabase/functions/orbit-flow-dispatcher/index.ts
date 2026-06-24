// orbit-flow-dispatcher
// Reads pending events from orbit_flow_events, matches against active flows,
// creates flow runs, and invokes the executor. Runs on cron (1 min) and on demand.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FUNCTIONS_BASE = `${SUPABASE_URL}/functions/v1`;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

type Json = Record<string, unknown>;

function matchesConditions(condicoes: Json, payload: Json, triggerConfig: Json, eventType: string): boolean {
  if (!condicoes || Object.keys(condicoes).length === 0) {
    // still check trigger_config restrictions (e.g. to_stage_id for deal_stage_changed)
  }
  // deal_stage_changed: trigger_config may carry to_stage_id or to_stage_name
  if (eventType === "deal_stage_changed") {
    const toId = triggerConfig?.to_stage_id;
    if (toId && payload?.to_stage_id !== toId) return false;
  }
  // generic condition filters
  const c = condicoes ?? {};
  if (c.pipeline_stage_id && payload?.to_stage_id !== c.pipeline_stage_id) return false;
  if (c.origem && payload?.origem !== c.origem) return false;
  if (typeof c.valor_estimado_min === "number" && Number(payload?.valor_estimado ?? 0) < c.valor_estimado_min) return false;
  if (typeof c.valor_estimado_max === "number" && Number(payload?.valor_estimado ?? 0) > c.valor_estimado_max) return false;
  return true;
}

async function processEvent(event: any) {
  // anti-loop: skip events emitted by a flow action
  if (event.payload?.triggered_by_flow_id) {
    await supabase.from("orbit_flow_events").update({ processed: true, processed_at: new Date().toISOString() }).eq("id", event.id);
    return { event_id: event.id, skipped: "triggered_by_flow" };
  }

  const { data: flows, error: flowsErr } = await supabase
    .from("orbit_flows")
    .select("*")
    .eq("empresa_id", event.empresa_id)
    .eq("trigger_type", event.event_type)
    .eq("ativo", true)
    .is("deleted_at", null);

  if (flowsErr) {
    console.error("flows query error", flowsErr);
    return { event_id: event.id, error: flowsErr.message };
  }

  const matched: string[] = [];
  for (const flow of flows ?? []) {
    if (!matchesConditions(flow.condicoes, event.payload, flow.trigger_config, event.event_type)) continue;

    // rate limit: max 50 runs per flow per hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count } = await supabase
      .from("orbit_flow_runs")
      .select("id", { count: "exact", head: true })
      .eq("flow_id", flow.id)
      .gte("created_at", oneHourAgo);
    if ((count ?? 0) >= 50) {
      console.warn("rate limit exceeded for flow", flow.id);
      continue;
    }

    const { data: run, error: runErr } = await supabase
      .from("orbit_flow_runs")
      .insert({
        flow_id: flow.id,
        event_id: event.id,
        empresa_id: event.empresa_id,
        entity_type: event.entity_type,
        entity_id: event.entity_id,
        status: "pending",
        context: { payload: event.payload, trigger_config: flow.trigger_config },
      })
      .select("id")
      .maybeSingle();

    if (runErr) {
      // unique conflict means already enqueued — fine
      if (!String(runErr.message).includes("duplicate")) console.error("run insert error", runErr);
      continue;
    }
    if (run?.id) {
      matched.push(run.id);
      // fire-and-forget executor
      fetch(`${FUNCTIONS_BASE}/orbit-flow-executor`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({ run_id: run.id }),
      }).catch((e) => console.error("executor invoke error", e));
    }
  }

  await supabase.from("orbit_flow_events").update({ processed: true, processed_at: new Date().toISOString() }).eq("id", event.id);
  return { event_id: event.id, matched_runs: matched.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { data: events, error } = await supabase
      .from("orbit_flow_events")
      .select("*")
      .eq("processed", false)
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) throw error;
    if (!events || events.length === 0) {
      return new Response(JSON.stringify({ ok: true, data: { processed: 0 }, error: null }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results = [];
    for (const ev of events) results.push(await processEvent(ev));

    return new Response(JSON.stringify({ ok: true, data: { processed: events.length, results }, error: null }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("dispatcher error", e);
    return new Response(JSON.stringify({ ok: false, data: null, error: String(e?.message ?? e) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
