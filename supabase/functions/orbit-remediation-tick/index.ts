// Separate remediation worker. It never calls the WhatsApp provider and never
// inserts an outbox item. Releases only kick the existing official schedulers;
// delivery is then verified asynchronously from the canonical outbox.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { checkEligibility } from "../_shared/orbit-whatsapp-outbox.ts";
import {
  buildFollowUpDescriptor,
  buildMeetingReminderDescriptor,
  fingerprintContent,
  fingerprintRecipient,
  sha256,
} from "../_shared/remediation-preflight.ts";
import {
  acceptDescriptor,
  type SanitizedIncidentDescriptor,
  sanitizeIncidentDescriptor,
} from "../_shared/remediation-policy.ts";
import { TENANTS } from "../_shared/remediation-playbooks.ts";
import {
  type DeliveryEvidence,
  type IncidentDescriptor,
  preflight,
  release,
  type ReleaseAdapter,
  type ReleaseState,
  type ReleaseValidation,
  verifyDelivery,
} from "../_shared/remediation-release.ts";
import type { MeetingReminderKind } from "../_shared/meeting-reminder-policy.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_TOKEN = Deno.env.get("SCHEDULER_CRON_TOKEN") ?? "";
const FUNCTIONS_BASE = `${SUPABASE_URL}/functions/v1`;
const WORKER = `remediator-${crypto.randomUUID().slice(0, 12)}`;
const TENANT_IDS = [TENANTS.bullink, TENANTS.viver];
const RELEASE_STATES = new Set<ReleaseState>([
  "prepared",
  "remediating",
  "ready",
  "enqueued",
  "verifying",
  "released",
  "expired",
  "canceled",
  "needs_approval",
  "failed",
]);

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const jsonHeaders = { "Content-Type": "application/json" };

type Json = Record<string, any>;

function safeError(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error);
  return value
    .replace(/[+]?\d[\d\s().-]{7,}/g, "[redacted]")
    .replace(/https?:\/\/\S+/gi, "[redacted]")
    .replace(/bearer\s+\S+/gi, "Bearer [redacted]")
    .slice(0, 160);
}

function recipientAuthority(row: Json): string | null {
  const value = row?.whatsapp ?? row?.telefone ?? null;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

async function loadTemplate(tenantId: string, templateId: string) {
  const { data, error } = await supabase.from("orbit_message_templates")
    .select("id,corpo_texto,imagem_url")
    .eq("empresa_id", tenantId)
    .eq("id", templateId)
    .maybeSingle();
  if (error || !data) return null;
  return data as Json;
}

async function loadProspect(tenantId: string, prospectId: string) {
  const { data, error } = await supabase.from("orbit_prospects")
    .select("id,empresa_id,whatsapp,telefone,optout_whatsapp,deleted_at")
    .eq("empresa_id", tenantId)
    .eq("id", prospectId)
    .maybeSingle();
  if (error || !data) return null;
  return data as Json;
}

async function resolveConversation(
  tenantId: string,
  prospectId: string,
  preferred?: string | null,
) {
  let query = supabase.from("orbit_conversas")
    .select("id,empresa_id,human_talk,human_user_id,status")
    .eq("empresa_id", tenantId)
    .eq("prospect_id", prospectId);
  if (preferred) query = query.eq("id", preferred);
  const { data } = await query.order("updated_at", { ascending: false }).limit(
    1,
  );
  return (data?.[0] as Json | undefined) ?? null;
}

function templateIdOf(config: Json): string | null {
  const value = config?.template_id;
  return typeof value === "string" && value ? value : null;
}

async function insertIncident(
  descriptor: IncidentDescriptor,
  incidentClass: "follow_up" | "meeting_reminder",
) {
  const enriched: SanitizedIncidentDescriptor = {
    ...descriptor,
    incidentClass,
    source: "preflight_scanner",
    remediationPlaybook: "official_outbox_release",
  };
  const sanitized = sanitizeIncidentDescriptor(enriched);
  const reasons = acceptDescriptor(sanitized, new Date());
  if (reasons.length) return { inserted: false, reason: reasons[0] };
  const { error } = await supabase.from("orbit_remediation_incidents").upsert({
    empresa_id: descriptor.tenantId,
    source: "preflight_scanner",
    descriptor_version: 1,
    entity_id: descriptor.entityId,
    event_id: descriptor.eventId,
    incident_class: incidentClass,
    release_kind: descriptor.kind,
    descriptor: sanitized,
    idempotency_key: descriptor.idempotencyKey,
    recipient_hash: descriptor.recipientHash,
    content_hash: descriptor.contentHash,
    canonical_link_hash: descriptor.canonicalLinkHash ?? null,
    scheduled_action_id: descriptor.scheduledActionId ?? null,
    flow_run_id: descriptor.flowRunId ?? null,
    preflight_at: descriptor.preflightAt,
    release_at: descriptor.releaseAt,
    release_deadline: descriptor.releaseDeadline,
    delivery_deadline: descriptor.deliveryDeadline,
    state: "queued",
    snapshot_before: {
      source: "preflight_scanner",
      descriptor_version: 1,
      release_kind: descriptor.kind,
    },
  }, {
    onConflict: "empresa_id,idempotency_key",
    ignoreDuplicates: true,
  });
  return { inserted: !error, reason: error ? safeError(error) : null };
}

async function scanFollowUps(now: Date, limit: number) {
  const lower = new Date(now.getTime() + 5 * 60_000).toISOString();
  const upper = new Date(now.getTime() + 15 * 60_000).toISOString();
  const { data, error } = await supabase.from("orbit_flow_scheduled_actions")
    .select(
      "id,empresa_id,run_id,flow_id,action_id,action_config,context,prospect_id,deal_id,scheduled_for,status",
    )
    .in("empresa_id", TENANT_IDS)
    .eq("status", "pending")
    .eq("action_type", "send_whatsapp_template")
    .gte("scheduled_for", lower)
    .lte("scheduled_for", upper)
    .order("scheduled_for", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`followup_scan_failed:${error.message}`);
  let queued = 0;
  let skipped = 0;
  for (const action of data ?? []) {
    const tenantId = String(action.empresa_id);
    const prospectId = String(action.prospect_id ?? "");
    const runId = String(action.run_id ?? "");
    const templateId = templateIdOf((action.action_config as Json) ?? {});
    if (!prospectId || !runId || !templateId) {
      skipped++;
      continue;
    }
    const [prospect, conversation, template] = await Promise.all([
      loadProspect(tenantId, prospectId),
      resolveConversation(
        tenantId,
        prospectId,
        (action.context as Json)?.payload?.conversa_id ?? null,
      ),
      loadTemplate(tenantId, templateId),
    ]);
    const authority = recipientAuthority(prospect ?? {});
    if (!prospect || !conversation || !template || !authority) {
      skipped++;
      continue;
    }
    const descriptor = await buildFollowUpDescriptor({
      tenantId,
      scheduledActionId: String(action.id),
      flowRunId: runId,
      prospectId,
      dealId: action.deal_id ? String(action.deal_id) : null,
      conversationId: String(conversation.id),
      templateId,
      scheduledFor: String(action.scheduled_for),
      recipientAuthority: authority,
      contentAuthority: {
        actionConfig: action.action_config,
        templateBody: template.corpo_texto,
        templateMedia: template.imagem_url,
      },
    }, now);
    if (!descriptor) {
      skipped++;
      continue;
    }
    const result = await insertIncident(descriptor, "follow_up");
    result.inserted ? queued++ : skipped++;
  }
  return { scanned: data?.length ?? 0, queued, skipped };
}

async function activeReminderDefinitions() {
  const { data: flows, error } = await supabase.from("orbit_flows")
    .select("id,empresa_id,trigger_type")
    .in("empresa_id", TENANT_IDS)
    .eq("ativo", true)
    .is("deleted_at", null)
    .in("trigger_type", [
      "meeting_reminder_24h",
      "meeting_reminder_1h",
      "meeting_reminder_5m",
    ]);
  if (error) throw new Error(`reminder_flow_scan_failed:${error.message}`);
  const definitions: Array<Json> = [];
  for (const flow of flows ?? []) {
    const { data: actions } = await supabase.from("orbit_flow_actions")
      .select("id,action_config")
      .eq("flow_id", flow.id)
      .eq("action_type", "send_whatsapp_template")
      .order("ordem", { ascending: true });
    const enabled = (actions ?? []).filter((action) =>
      (action.action_config as Json)?.enabled !== false &&
      (action.action_config as Json)?.dry_run !== true &&
      templateIdOf((action.action_config as Json) ?? {})
    );
    if (enabled.length !== 1) continue;
    definitions.push({
      tenantId: String(flow.empresa_id),
      flowId: String(flow.id),
      kind: String(flow.trigger_type),
      actionId: String(enabled[0].id),
      actionConfig: enabled[0].action_config,
      templateId: templateIdOf((enabled[0].action_config as Json) ?? {}),
    });
  }
  const counts = new Map<string, number>();
  for (const definition of definitions) {
    const key = `${definition.tenantId}|${definition.kind}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  // Ambiguous active definitions are never eligible for automatic release.
  return definitions.filter((definition) =>
    counts.get(`${definition.tenantId}|${definition.kind}`) === 1
  );
}

async function scanMeetingReminders(now: Date, limit: number) {
  const definitions = await activeReminderDefinitions();
  if (!definitions.length) return { scanned: 0, queued: 0, skipped: 0 };
  const upper = new Date(now.getTime() + 25 * 60 * 60_000).toISOString();
  const { data: meetings, error } = await supabase.from("orbit_meetings")
    .select(
      "id,empresa_id,deal_id,prospect_id,conversa_id,scheduled_at,meeting_url,status",
    )
    .in("empresa_id", TENANT_IDS)
    .eq("status", "scheduled")
    .gt("scheduled_at", now.toISOString())
    .lte("scheduled_at", upper)
    .order("scheduled_at", { ascending: true })
    .limit(limit);
  if (error) throw new Error(`meeting_scan_failed:${error.message}`);
  let queued = 0;
  let skipped = 0;
  for (const meeting of meetings ?? []) {
    const tenantId = String(meeting.empresa_id);
    const prospectId = String(meeting.prospect_id ?? "");
    if (!prospectId || !meeting.meeting_url || !meeting.conversa_id) {
      skipped++;
      continue;
    }
    const [prospect, conversation] = await Promise.all([
      loadProspect(tenantId, prospectId),
      resolveConversation(tenantId, prospectId, String(meeting.conversa_id)),
    ]);
    const authority = recipientAuthority(prospect ?? {});
    if (!prospect || !conversation || !authority) {
      skipped++;
      continue;
    }
    for (
      const definition of definitions.filter((d) => d.tenantId === tenantId)
    ) {
      const template = await loadTemplate(tenantId, definition.templateId);
      if (!template) {
        skipped++;
        continue;
      }
      const descriptor = await buildMeetingReminderDescriptor({
        tenantId,
        meetingId: String(meeting.id),
        prospectId,
        dealId: meeting.deal_id ? String(meeting.deal_id) : null,
        conversationId: String(conversation.id),
        templateId: definition.templateId,
        scheduledAt: String(meeting.scheduled_at),
        kind: definition.kind as MeetingReminderKind,
        recipientAuthority: authority,
        contentAuthority: {
          actionConfig: definition.actionConfig,
          templateBody: template.corpo_texto,
          templateMedia: template.imagem_url,
        },
        canonicalLinkAuthority: String(meeting.meeting_url),
      }, now);
      if (!descriptor) continue;
      const result = await insertIncident(descriptor, "meeting_reminder");
      result.inserted ? queued++ : skipped++;
    }
  }
  return { scanned: meetings?.length ?? 0, queued, skipped };
}

async function outboxRows(d: IncidentDescriptor) {
  let query = supabase.from("orbit_whatsapp_outbox")
    .select(
      "id,status,attempts,provider_message_id,empresa_id,scheduled_action_id,metadata",
    )
    .eq("empresa_id", d.tenantId);
  if (d.kind === "follow_up" && d.scheduledActionId) {
    query = query.eq("scheduled_action_id", d.scheduledActionId);
  } else if (d.meetingId) {
    query = query.eq("source_type", "meeting_confirmation")
      .eq("metadata->>meeting_id", d.meetingId)
      .eq("metadata->>reminder_kind", d.kind);
  } else {
    return [];
  }
  const { data } = await query.order("created_at", { ascending: true }).limit(
    2,
  );
  return (data ?? []) as Json[];
}

function deliveryEvidence(rows: Json[]): DeliveryEvidence {
  if (rows.length > 1) {
    return {
      status: "rejected",
      attempts: Math.max(...rows.map((r) => Number(r.attempts ?? 0))),
    };
  }
  const row = rows[0];
  if (!row) return { status: "pending", attempts: 0 };
  const raw = String(row.status ?? "pending");
  const status = raw === "sent"
    ? "sent"
    : ["processing", "sending"].includes(raw)
    ? "processing"
    : ["failed"].includes(raw)
    ? "failed"
    : ["canceled", "stale_canceled"].includes(raw)
    ? "canceled"
    : "pending";
  return {
    outboxId: String(row.id),
    status,
    attempts: Number(row.attempts ?? 0),
    providerMessageId: row.provider_message_id
      ? String(row.provider_message_id)
      : null,
  };
}

async function authoritativeFingerprint(d: IncidentDescriptor) {
  const prospect = d.prospectId
    ? await loadProspect(d.tenantId, d.prospectId)
    : null;
  const authority = recipientAuthority(prospect ?? {});
  if (!prospect || !authority) return null;
  if (d.kind === "follow_up" && d.scheduledActionId) {
    const { data: action } = await supabase.from("orbit_flow_scheduled_actions")
      .select(
        "id,empresa_id,run_id,status,action_config,prospect_id,deal_id,scheduled_for",
      )
      .eq("empresa_id", d.tenantId)
      .eq("id", d.scheduledActionId)
      .maybeSingle();
    if (!action) return null;
    const templateId = templateIdOf((action.action_config as Json) ?? {});
    const template = templateId
      ? await loadTemplate(d.tenantId, templateId)
      : null;
    if (!template || !templateId) return null;
    return {
      target: action as Json,
      prospect,
      recipientHash: await fingerprintRecipient(
        d.tenantId,
        d.prospectId!,
        authority,
      ),
      contentHash: await fingerprintContent(templateId, {
        actionConfig: action.action_config,
        templateBody: template.corpo_texto,
        templateMedia: template.imagem_url,
      }),
      linkHash: null,
      templateId,
      meeting: null,
    };
  }
  if (d.meetingId) {
    const { data: meeting } = await supabase.from("orbit_meetings")
      .select(
        "id,empresa_id,deal_id,prospect_id,conversa_id,scheduled_at,meeting_url,status",
      )
      .eq("empresa_id", d.tenantId)
      .eq("id", d.meetingId)
      .maybeSingle();
    if (!meeting?.meeting_url) return null;
    const definitions = await activeReminderDefinitions();
    const definition = definitions.find((item) =>
      item.tenantId === d.tenantId && item.kind === d.kind
    );
    if (!definition) return null;
    const template = await loadTemplate(d.tenantId, definition.templateId);
    if (!template) return null;
    return {
      target: meeting as Json,
      prospect,
      recipientHash: await fingerprintRecipient(
        d.tenantId,
        d.prospectId!,
        authority,
      ),
      contentHash: await fingerprintContent(definition.templateId, {
        actionConfig: definition.actionConfig,
        templateBody: template.corpo_texto,
        templateMedia: template.imagem_url,
      }),
      linkHash: await sha256(String(meeting.meeting_url)),
      templateId: definition.templateId,
      meeting: meeting as Json,
    };
  }
  return null;
}

function releaseAdapter(row: Json, d: IncidentDescriptor): ReleaseAdapter {
  let current = RELEASE_STATES.has(row.state as ReleaseState)
    ? row.state as ReleaseState
    : null;
  return {
    find: async () => current,
    save: async (_key, state, evidence) => {
      current = state;
      const { error } = await supabase.from("orbit_remediation_incidents")
        .update({
          state,
          outbox_id: evidence?.outboxId ?? row.outbox_id ?? null,
          lease_owner: null,
          lease_until: null,
          last_error_code:
            ["failed", "needs_approval", "expired", "canceled"].includes(state)
              ? state
              : null,
          snapshot_after: {
            state,
            delivery_status: evidence?.status ?? null,
            delivery_attempts: evidence?.attempts ?? null,
            provider_accepted: Boolean(evidence?.providerMessageId),
          },
        }).eq("id", row.id).eq("empresa_id", row.empresa_id);
      if (error) throw new Error(`incident_save_failed:${error.message}`);
      row.outbox_id = evidence?.outboxId ?? row.outbox_id ?? null;
    },
    revalidate: async (): Promise<ReleaseValidation> => {
      const authoritative = await authoritativeFingerprint(d);
      const rows = await outboxRows(d);
      const configResult = await supabase.from("orbit_whatsapp_sending_config")
        .select(
          "enabled,outbox_adapter_enabled,daily_limit,max_per_minute,batch_size,warmup_enabled",
        )
        .eq("empresa_id", d.tenantId)
        .maybeSingle();
      if (!authoritative) {
        return {
          eligible: false,
          consentCurrent: false,
          meetingFuture: false,
          tenantMatch: false,
          sameRecipient: false,
          sameTemplate: false,
          sameContent: false,
          sameLink: false,
          adapterReady: false,
          withinQuotaCadence: false,
          providerNotAccepted: rows.every((item) => !item.provider_message_id),
          noDuplicate: rows.length <= 1,
        };
      }
      const target = authoritative.target;
      const eligibility = await checkEligibility(supabase, {
        empresa_id: d.tenantId,
        prospect_id: d.prospectId ?? null,
        conversa_id: d.conversationId,
        deal_id: d.dealId ?? null,
        flow_run_id: d.flowRunId ?? null,
        scheduled_action_id: d.scheduledActionId ?? null,
        source_type: d.kind === "follow_up"
          ? "flow_followup"
          : "meeting_confirmation",
        source_id: d.meetingId ?? d.scheduledActionId ?? d.eventId,
        meeting_id: d.meetingId ?? null,
        idempotency_scope: d.meetingId ? d.kind : null,
      });
      const config = configResult.data as Json | null;
      const meetingFuture = authoritative.meeting
        ? authoritative.meeting.status === "scheduled" &&
          Date.parse(String(authoritative.meeting.scheduled_at)) > Date.now()
        : true;
      const targetUsable = d.kind === "follow_up"
        ? ["pending", "processing", "success"].includes(String(target.status))
        : meetingFuture;
      return {
        eligible: eligibility.eligible && targetUsable,
        consentCurrent: true,
        meetingFuture,
        tenantMatch: String(target.empresa_id) === d.tenantId &&
          String(authoritative.prospect.empresa_id) === d.tenantId,
        sameRecipient: authoritative.recipientHash === d.recipientHash,
        sameTemplate: authoritative.templateId === d.templateId,
        sameContent: authoritative.contentHash === d.contentHash,
        sameLink: d.kind === "follow_up" ||
          authoritative.linkHash === d.canonicalLinkHash,
        adapterReady: config?.enabled === true &&
          config?.outbox_adapter_enabled === true,
        withinQuotaCadence: Number(config?.daily_limit ?? 0) > 0 &&
          Number(config?.max_per_minute ?? 0) > 0 &&
          Number(config?.batch_size ?? 0) > 0,
        providerNotAccepted: rows.every((item) => !item.provider_message_id),
        noDuplicate: rows.length <= 1,
      };
    },
    enqueueOfficialOnce: async () => {
      const existing = await outboxRows(d);
      if (existing.length) return deliveryEvidence(existing);
      let response: Response;
      if (d.kind === "follow_up") {
        response = await fetch(`${FUNCTIONS_BASE}/orbit-flow-scheduler-tick`, {
          method: "POST",
          headers: { ...jsonHeaders, Authorization: `Bearer ${CRON_TOKEN}` },
          body: JSON.stringify({ batch: 100, trigger: "remediation_release" }),
        });
      } else if (d.kind.startsWith("meeting_reminder_")) {
        response = await fetch(`${FUNCTIONS_BASE}/orbit-meeting-scheduler`, {
          method: "POST",
          headers: { ...jsonHeaders, Authorization: `Bearer ${SERVICE_KEY}` },
          body: JSON.stringify({ trigger: "remediation_release" }),
        });
      } else {
        return { status: "rejected", attempts: 0 };
      }
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.ok === false) {
        return { status: "failed", attempts: 0 };
      }
      return deliveryEvidence(await outboxRows(d));
    },
    inspectOfficialDelivery: async () => deliveryEvidence(await outboxRows(d)),
  };
}

async function processIncident(row: Json, mode: string, now: Date) {
  const descriptor = row.descriptor as SanitizedIncidentDescriptor;
  const reasons = acceptDescriptor(descriptor, now);
  if (reasons.length) {
    await supabase.from("orbit_remediation_incidents").update({
      state: reasons.includes("window_expired") ? "expired" : "needs_approval",
      last_error_code: reasons[0],
      lease_owner: null,
      lease_until: null,
    }).eq("id", row.id).eq("empresa_id", row.empresa_id);
    return reasons[0];
  }
  const d = descriptor as IncidentDescriptor;
  const adapter = releaseAdapter(row, d);
  if (row.state === "queued") await preflight(d, adapter, now);
  if (mode !== "auto_release") {
    if (Date.parse(d.deliveryDeadline) <= now.getTime()) {
      await adapter.save(d.idempotencyKey, "expired");
      return "shadow_expired";
    }
    await adapter.save(d.idempotencyKey, "prepared");
    return "shadow_prepared";
  }
  if (["enqueued", "verifying"].includes(String(row.state))) {
    return await verifyDelivery(d, row.outbox_id ?? undefined, adapter, now);
  }
  return await release(d, adapter, now);
}

async function runTick(batch: number) {
  const now = new Date();
  const [followUps, reminders] = await Promise.all([
    scanFollowUps(now, batch),
    scanMeetingReminders(now, batch),
  ]);
  const { data: claimed, error } = await supabase.rpc(
    "claim_orbit_remediation_incidents",
    { _worker: WORKER, _batch: batch },
  );
  if (error) throw new Error(`incident_claim_failed:${error.message}`);
  const outcomes: Record<string, number> = {};
  for (const row of (claimed ?? []) as Json[]) {
    try {
      const { data: approval } = await supabase
        .from("orbit_remediation_class_approvals")
        .select("mode,approved,expires_at")
        .eq("empresa_id", row.empresa_id)
        .eq("incident_class", row.incident_class)
        .maybeSingle();
      const mode =
        approval?.mode === "auto_release" && approval?.approved === true &&
          (!approval?.expires_at ||
            Date.parse(approval.expires_at) > now.getTime())
          ? "auto_release"
          : "shadow";
      const outcome = String(await processIncident(row, mode, now));
      outcomes[outcome] = (outcomes[outcome] ?? 0) + 1;
    } catch (error) {
      const code = safeError(error);
      outcomes.worker_error = (outcomes.worker_error ?? 0) + 1;
      await supabase.from("orbit_remediation_incidents").update({
        state: "failed",
        last_error_code: code,
        lease_owner: null,
        lease_until: null,
      }).eq("id", row.id).eq("empresa_id", row.empresa_id);
    }
  }
  return {
    worker: WORKER,
    mode: "tenant_class_controlled",
    scanning: { followUps, reminders },
    claimed: claimed?.length ?? 0,
    outcomes,
  };
}

Deno.serve(async (request) => {
  const auth = request.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!CRON_TOKEN || token !== CRON_TOKEN) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: jsonHeaders,
    });
  }
  let body: Json = {};
  try {
    body = await request.json();
  } catch {
    // Empty cron body is valid.
  }
  const batch = Math.max(1, Math.min(100, Number(body.batch ?? 25)));
  try {
    const data = await runTick(batch);
    console.log(JSON.stringify({ scope: "remediation_tick", ...data }));
    return new Response(JSON.stringify({ ok: true, data }), {
      status: 200,
      headers: jsonHeaders,
    });
  } catch (error) {
    const code = safeError(error);
    console.error(JSON.stringify({ scope: "remediation_tick_failed", code }));
    return new Response(JSON.stringify({ ok: false, error: code }), {
      status: 500,
      headers: jsonHeaders,
    });
  }
});
