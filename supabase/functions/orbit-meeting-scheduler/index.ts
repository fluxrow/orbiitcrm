// orbit-meeting-scheduler
// Cron-driven scheduler that emits meeting_reminder_24h / meeting_reminder_1h
// events into orbit_flow_events. Idempotent via dedupe_key (meeting_id + kind).

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

type ReminderKind = "meeting_reminder_24h" | "meeting_reminder_1h";

const WINDOWS: Array<{ kind: ReminderKind; offsetMs: number; toleranceMs: number }> = [
  { kind: "meeting_reminder_24h", offsetMs: 24 * 60 * 60 * 1000, toleranceMs: 10 * 60 * 1000 },
  { kind: "meeting_reminder_1h", offsetMs: 60 * 60 * 1000, toleranceMs: 10 * 60 * 1000 },
];

async function emitForWindow(kind: ReminderKind, offsetMs: number, toleranceMs: number) {
  const now = Date.now();
  const lower = new Date(now + offsetMs - toleranceMs).toISOString();
  const upper = new Date(now + offsetMs + toleranceMs).toISOString();

  const { data: meetings, error } = await supabase
    .from("orbit_meetings")
    .select("id, empresa_id, deal_id, prospect_id, conversa_id, scheduled_at, titulo, meeting_url, duration_minutes")
    .eq("status", "scheduled")
    .gte("scheduled_at", lower)
    .lte("scheduled_at", upper)
    .limit(500);

  if (error) {
    console.error(`[${kind}] query error`, error);
    return { kind, emitted: 0, skipped: 0, error: error.message };
  }

  let emitted = 0;
  let skipped = 0;

  for (const m of meetings ?? []) {
    const dedupe_key = `${m.id}:${kind}`;
    const payload = {
      meeting_id: m.id,
      deal_id: m.deal_id,
      prospect_id: m.prospect_id,
      conversa_id: m.conversa_id,
      scheduled_at: m.scheduled_at,
      titulo: m.titulo,
      meeting_url: m.meeting_url,
      duration_minutes: m.duration_minutes,
      reminder_kind: kind,
    };

    const { error: insErr } = await supabase.from("orbit_flow_events").insert({
      empresa_id: m.empresa_id,
      event_type: kind,
      entity_type: "meeting",
      entity_id: m.id,
      payload,
      dedupe_key,
    });

    if (insErr) {
      // unique violation = already emitted -> idempotent skip
      if (String(insErr.code) === "23505" || String(insErr.message).includes("duplicate")) {
        skipped++;
        continue;
      }
      console.error(`[${kind}] insert error`, insErr);
      continue;
    }
    emitted++;
  }

  return { kind, scanned: meetings?.length ?? 0, emitted, skipped };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const results = [];
    for (const w of WINDOWS) {
      results.push(await emitForWindow(w.kind, w.offsetMs, w.toleranceMs));
    }

    const totalEmitted = results.reduce((acc, r) => acc + (r.emitted ?? 0), 0);

    // Kick the dispatcher to process the new events immediately (cron also covers it).
    if (totalEmitted > 0) {
      fetch(`${FUNCTIONS_BASE}/orbit-flow-dispatcher`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({ trigger: "meeting-scheduler" }),
      }).catch((e) => console.error("dispatcher invoke error", e));
    }

    return new Response(
      JSON.stringify({ ok: true, data: { results, totalEmitted }, error: null }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("scheduler error", e);
    return new Response(
      JSON.stringify({ ok: false, data: null, error: String((e as any)?.message ?? e) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
