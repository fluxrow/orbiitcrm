// orbit-meeting-scheduler
// Cron-driven scheduler that emits meeting_reminder_24h / 1h / 15m / 5m
// events into orbit_flow_events. Idempotent via dedupe_key (meeting_id + kind).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  MEETING_REMINDER_WINDOWS,
  evaluateViverMorningReminder,
  isViverMorningWindow,
  type MeetingReminderKind,
} from "../_shared/meeting-reminder-policy.ts";
import { VIVER_EMPRESA_ID } from "../_shared/viver-meeting-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FUNCTIONS_BASE = `${SUPABASE_URL}/functions/v1`;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function emitForWindow(
  kind: MeetingReminderKind,
  offsetMs: number,
  toleranceMs: number,
) {
  const now = Date.now();
  const lower = new Date(now + offsetMs - toleranceMs).toISOString();
  const upper = new Date(now + offsetMs + toleranceMs).toISOString();

  const { data: meetings, error } = await supabase
    .from("orbit_meetings")
    .select(
      "id, empresa_id, deal_id, prospect_id, conversa_id, scheduled_at, titulo, meeting_url, duration_minutes, metadata",
    )
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
      meeting_kind: typeof m.metadata?.meeting_kind === "string"
        ? m.metadata.meeting_kind
        : null,
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
      if (
        String(insErr.code) === "23505" ||
        String(insErr.message).includes("duplicate")
      ) {
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

async function emitViverMorning() {
  const kind: MeetingReminderKind = "meeting_reminder_morning";
  const now = new Date();
  // Avoid a database scan except during the narrow São Paulo morning window.
  if (!isViverMorningWindow(now, "emit")) {
    return { kind, scanned: 0, emitted: 0, skipped: 0 };
  }

  let scanned = 0;
  let emitted = 0;
  let skipped = 0;
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data: meetings, error } = await supabase
      .from("orbit_meetings")
      .select("id, empresa_id, deal_id, prospect_id, conversa_id, scheduled_at, created_at, titulo, meeting_url, duration_minutes, metadata")
      .eq("empresa_id", VIVER_EMPRESA_ID)
      .in("status", ["scheduled", "rescheduled"])
      .gte("scheduled_at", now.toISOString())
      .lte("scheduled_at", new Date(now.getTime() + 12 * 60 * 60_000).toISOString())
      .order("scheduled_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) {
      console.error(`[${kind}] query error`, error);
      return { kind, scanned, emitted, skipped, error: error.message };
    }
    scanned += meetings?.length ?? 0;
    for (const m of meetings ?? []) {
      const allowed = evaluateViverMorningReminder({
        scheduledAt: m.scheduled_at,
        createdAt: m.created_at,
        meetingKind: typeof m.metadata?.meeting_kind === "string"
          ? m.metadata.meeting_kind
          : null,
      }, now, "emit");
      if (!allowed.allowed) {
        skipped++;
        continue;
      }
      const dedupe_key = `${m.id}:${kind}:${m.scheduled_at}`;
      const { error: insErr } = await supabase.from("orbit_flow_events").insert({
        empresa_id: VIVER_EMPRESA_ID,
        event_type: kind,
        entity_type: "meeting",
        entity_id: m.id,
        payload: {
          meeting_id: m.id,
          deal_id: m.deal_id,
          prospect_id: m.prospect_id,
          conversa_id: m.conversa_id,
          scheduled_at: m.scheduled_at,
          titulo: m.titulo,
          meeting_url: m.meeting_url,
          duration_minutes: m.duration_minutes,
          reminder_kind: kind,
          meeting_kind: m.metadata?.meeting_kind ?? null,
        },
        dedupe_key,
      });
      if (insErr) {
        if (String(insErr.code) === "23505" || String(insErr.message).includes("duplicate")) {
          skipped++;
          continue;
        }
        console.error(`[${kind}] insert error`, insErr);
        continue;
      }
      emitted++;
    }
    if ((meetings?.length ?? 0) < pageSize) break;
  }
  return { kind, scanned, emitted, skipped };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const results = [];
    for (const w of MEETING_REMINDER_WINDOWS) {
      results.push(await emitForWindow(w.kind, w.offsetMs, w.toleranceMs));
    }
    results.push(await emitViverMorning());

    const totalEmitted = results.reduce((acc, r) => acc + (r.emitted ?? 0), 0);

    // Kick the dispatcher to process the new events immediately (cron also covers it).
    if (totalEmitted > 0) {
      fetch(`${FUNCTIONS_BASE}/orbit-flow-dispatcher`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({ trigger: "meeting-scheduler" }),
      }).catch((e) => console.error("dispatcher invoke error", e));
    }

    return new Response(
      JSON.stringify({
        ok: true,
        data: { results, totalEmitted },
        error: null,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (e) {
    console.error("scheduler error", e);
    return new Response(
      JSON.stringify({
        ok: false,
        data: null,
        error: String((e as any)?.message ?? e),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
