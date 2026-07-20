// orbit-flow-go-live-reconcile v2
// Super-admin-only. Preview + apply + rollback do go-live de fluxos WhatsApp por empresa.
// - NUNCA envia mensagem real.
// - NUNCA altera envio_real_liberado nem outbox_adapter_enabled.
// - NUNCA reativa actions com enabled=false.
// - Apply/rollback são transacionais (RPCs SECURITY DEFINER service-role-only).
// - Smoke aceita SOMENTE service_role OU super_admin (anon → 403).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ok, fail, optionsResponse, ErrorCodes } from "../_shared/responses.ts";

const CONFIRM_TEXT = "LIBERAR FLUXOS FUTUROS";
const SAFE_FUTURE_WINDOW_SECONDS = 60 * 60;
const PREVIEW_HARD_LIMIT = 5000;
const DEFAULT_MAX_PER_MINUTE = 2;
const DEFAULT_DAILY_LIMIT = 50;

type Category =
  | "eligible_rebase"
  | "blocked_missing_real_out"
  | "blocked_replied"
  | "blocked_other_guard";

interface ClassifiedSnapshot {
  scheduled_id: string;
  prospect_id: string | null;
  action_id: string | null;
  original_scheduled_for: string;
  proposed_scheduled_for: string | null;
  category: Category;
  reason: string;
}

function isFollowUpCategory(cfg: any): boolean {
  const c = String(cfg?.category ?? "").toLowerCase();
  return c === "follow_up" || c === "followup" || c === "nutricao" || c === "nurture";
}

async function isSuperAdmin(supabase: SupabaseClient, token: string): Promise<{ user: any } | null> {
  try {
    const { data: userData, error } = await supabase.auth.getUser(token);
    if (error || !userData?.user) return null;
    const { data: role } = await supabase.from("user_roles")
      .select("role").eq("user_id", userData.user.id).eq("role", "super_admin").maybeSingle();
    return role ? { user: userData.user } : null;
  } catch {
    return null;
  }
}

/** Autorização: retorna { role, actorId } ou null. role ∈ 'service' | 'super_admin' */
async function authorize(supabase: SupabaseClient, req: Request): Promise<
  { role: "service" | "super_admin"; actorId: string } | null
> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return null;

  if (token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
    return { role: "service", actorId: "00000000-0000-0000-0000-000000000000" };
  }
  const sa = await isSuperAdmin(supabase, token);
  if (sa) return { role: "super_admin", actorId: sa.user.id };
  return null;
}

// ─── Preview / classification ───────────────────────────────────────
async function classifySnapshotWithContext(
  ctx: {
    prospectsById: Map<string, any>;
    conversasByProspect: Map<string, any[]>;
    handoffByProspect: Set<string>;
    meetingByProspect: Set<string>;
    dealsByProspect: Map<string, any[]>;
    terminalStages: Set<string>;
    lastRealOutByProspect: Map<string, string>;
    inByProspectAfter: Map<string, Set<string>>; // prospect_id -> set of conversas that have IN after lastRealOut
  },
  snap: any,
  action: any,
): Promise<ClassifiedSnapshot> {
  const cfg = action?.action_config ?? {};
  const base = {
    scheduled_id: snap.id,
    prospect_id: snap.prospect_id ?? null,
    action_id: snap.action_id ?? null,
    original_scheduled_for: snap.scheduled_for,
  };
  const isFollowUp = isFollowUpCategory(cfg);
  const cancelOnReply = cfg.cancel_on_reply === true;

  if (!snap.prospect_id) return { ...base, category: "blocked_other_guard", reason: "no_prospect", proposed_scheduled_for: null };
  const prospect = ctx.prospectsById.get(snap.prospect_id);
  if (!prospect) return { ...base, category: "blocked_other_guard", reason: "prospect_missing_or_cross_tenant", proposed_scheduled_for: null };
  if (prospect.deleted_at) return { ...base, category: "blocked_other_guard", reason: "prospect_deleted", proposed_scheduled_for: null };
  if (prospect.optout_whatsapp) return { ...base, category: "blocked_other_guard", reason: "optout_whatsapp", proposed_scheduled_for: null };

  const conversas = ctx.conversasByProspect.get(snap.prospect_id) ?? [];
  if (conversas.some((c: any) => c.human_talk || c.handoff_sent_at)) {
    return { ...base, category: "blocked_other_guard", reason: "handoff_or_human_talk", proposed_scheduled_for: null };
  }
  if (ctx.handoffByProspect.has(snap.prospect_id)) {
    return { ...base, category: "blocked_other_guard", reason: "handoff_registered", proposed_scheduled_for: null };
  }
  if (ctx.meetingByProspect.has(snap.prospect_id)) {
    return { ...base, category: "blocked_other_guard", reason: "future_meeting", proposed_scheduled_for: null };
  }
  const deals = ctx.dealsByProspect.get(snap.prospect_id) ?? [];
  if (deals.some((d: any) => d.etapa_id && ctx.terminalStages.has(d.etapa_id))) {
    return { ...base, category: "blocked_other_guard", reason: "deal_terminal_stage", proposed_scheduled_for: null };
  }

  const lastRealOutAt = ctx.lastRealOutByProspect.get(snap.prospect_id) ?? null;
  if (isFollowUp && !lastRealOutAt) {
    return { ...base, category: "blocked_missing_real_out", reason: "missing_prior_real_outbound", proposed_scheduled_for: null };
  }
  if (lastRealOutAt && ctx.inByProspectAfter.get(snap.prospect_id)?.size) {
    return { ...base, category: "blocked_replied", reason: "in_after_last_real_out", proposed_scheduled_for: null };
  }

  if (isFollowUp && cancelOnReply && lastRealOutAt) {
    const originalInterval = new Date(snap.scheduled_for).getTime() - new Date(snap.created_at).getTime();
    const safeInterval = Math.max(originalInterval, 0);
    let proposed = new Date(new Date(lastRealOutAt).getTime() + safeInterval);
    if (proposed.getTime() <= Date.now()) proposed = new Date(Date.now() + SAFE_FUTURE_WINDOW_SECONDS * 1000);
    return { ...base, category: "eligible_rebase", reason: "followup_with_real_out", proposed_scheduled_for: proposed.toISOString() };
  }
  return { ...base, category: "blocked_other_guard", reason: isFollowUp ? "missing_cancel_on_reply" : "non_followup_category", proposed_scheduled_for: null };
}

async function fetchContext(supabase: SupabaseClient, empresa_id: string, prospectIds: string[]) {
  const uniqueIds = Array.from(new Set(prospectIds.filter(Boolean)));
  const prospectsById = new Map<string, any>();
  const conversasByProspect = new Map<string, any[]>();
  const handoffByProspect = new Set<string>();
  const meetingByProspect = new Set<string>();
  const dealsByProspect = new Map<string, any[]>();
  const terminalStages = new Set<string>();
  const lastRealOutByProspect = new Map<string, string>();
  const inByProspectAfter = new Map<string, Set<string>>();
  if (uniqueIds.length === 0) {
    return { prospectsById, conversasByProspect, handoffByProspect, meetingByProspect, dealsByProspect, terminalStages, lastRealOutByProspect, inByProspectAfter };
  }
  const nowIso = new Date().toISOString();
  const [pR, cR, hR, mR, dR] = await Promise.all([
    supabase.from("orbit_prospects").select("id, optout_whatsapp, deleted_at, empresa_id").eq("empresa_id", empresa_id).in("id", uniqueIds),
    supabase.from("orbit_conversas").select("id, prospect_id, human_talk, handoff_sent_at").eq("empresa_id", empresa_id).in("prospect_id", uniqueIds),
    supabase.from("orbit_handoffs").select("prospect_id").eq("empresa_id", empresa_id).in("prospect_id", uniqueIds),
    supabase.from("orbit_meetings").select("prospect_id, scheduled_at, status").eq("empresa_id", empresa_id).in("prospect_id", uniqueIds).gte("scheduled_at", nowIso).in("status", ["scheduled", "confirmed", "pending"]),
    supabase.from("orbit_deals").select("id, prospect_id, etapa_id").eq("empresa_id", empresa_id).in("prospect_id", uniqueIds),
  ]);
  (pR.data ?? []).forEach((p: any) => prospectsById.set(p.id, p));
  (cR.data ?? []).forEach((c: any) => {
    const arr = conversasByProspect.get(c.prospect_id) ?? [];
    arr.push(c);
    conversasByProspect.set(c.prospect_id, arr);
  });
  (hR.data ?? []).forEach((h: any) => h.prospect_id && handoffByProspect.add(h.prospect_id));
  (mR.data ?? []).forEach((m: any) => m.prospect_id && meetingByProspect.add(m.prospect_id));
  (dR.data ?? []).forEach((d: any) => {
    const arr = dealsByProspect.get(d.prospect_id) ?? [];
    arr.push(d);
    dealsByProspect.set(d.prospect_id, arr);
  });
  const stageIds = Array.from(new Set(((dR.data ?? []).map((d: any) => d.etapa_id)).filter(Boolean)));
  if (stageIds.length) {
    const { data: stages } = await supabase.from("orbit_pipeline_stages")
      .select("id, is_won, is_lost").eq("empresa_id", empresa_id).in("id", stageIds);
    (stages ?? []).forEach((s: any) => { if (s.is_won || s.is_lost) terminalStages.add(s.id); });
  }
  // Last real OUT per prospect, and IN after
  const conversaIds = Array.from(new Set((cR.data ?? []).map((c: any) => c.id)));
  if (conversaIds.length) {
    const { data: outs } = await supabase.from("orbit_mensagens")
      .select("conversa_id, timestamp, status, direcao")
      .eq("empresa_id", empresa_id).eq("direcao", "OUT")
      .in("conversa_id", conversaIds)
      .not("status", "in", "(simulated,falhou,failed)")
      .order("timestamp", { ascending: false });
    const convToProspect = new Map<string, string>();
    (cR.data ?? []).forEach((c: any) => convToProspect.set(c.id, c.prospect_id));
    for (const o of outs ?? []) {
      const pid = convToProspect.get(o.conversa_id);
      if (!pid) continue;
      if (!lastRealOutByProspect.has(pid)) lastRealOutByProspect.set(pid, o.timestamp);
    }
    // INs after last real OUT
    for (const [pid, lastAt] of lastRealOutByProspect) {
      const pConvIds = (cR.data ?? []).filter((c: any) => c.prospect_id === pid).map((c: any) => c.id);
      if (!pConvIds.length) continue;
      const { data: ins } = await supabase.from("orbit_mensagens")
        .select("id, conversa_id")
        .eq("empresa_id", empresa_id).eq("direcao", "IN")
        .in("conversa_id", pConvIds).gt("timestamp", lastAt).limit(1);
      if ((ins ?? []).length) {
        const s = inByProspectAfter.get(pid) ?? new Set();
        s.add((ins ?? [])[0].conversa_id);
        inByProspectAfter.set(pid, s);
      }
    }
  }
  return { prospectsById, conversasByProspect, handoffByProspect, meetingByProspect, dealsByProspect, terminalStages, lastRealOutByProspect, inByProspectAfter };
}

/** Escalona proposed_scheduled_for respeitando max_per_minute e daily_limit. */
function stagger(
  eligible: ClassifiedSnapshot[],
  cfg: { max_per_minute: number; daily_limit: number },
): ClassifiedSnapshot[] {
  const spacing = Math.ceil(60000 / Math.max(1, cfg.max_per_minute));
  const sorted = [...eligible].sort((a, b) =>
    new Date(a.proposed_scheduled_for!).getTime() - new Date(b.proposed_scheduled_for!).getTime()
  );
  let cursor = Date.now();
  const countByDay: Record<string, number> = {};
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  const nextDayNine = (d: Date) => {
    const n = new Date(d);
    n.setUTCDate(n.getUTCDate() + 1);
    n.setUTCHours(12, 0, 0, 0); // 09:00 America/Sao_Paulo ≈ 12:00 UTC
    return n;
  };
  for (const s of sorted) {
    let candidate = Math.max(new Date(s.proposed_scheduled_for!).getTime(), cursor, Date.now() + 60_000);
    let cd = new Date(candidate);
    // eslint-disable-next-line no-constant-condition
    while ((countByDay[dayKey(cd)] ?? 0) >= cfg.daily_limit) {
      cd = nextDayNine(cd);
    }
    s.proposed_scheduled_for = cd.toISOString();
    countByDay[dayKey(cd)] = (countByDay[dayKey(cd)] ?? 0) + 1;
    cursor = cd.getTime() + spacing;
  }
  return sorted;
}

async function buildPreview(supabase: SupabaseClient, empresa_id: string) {
  const { data: flows } = await supabase.from("orbit_flows")
    .select("id").eq("empresa_id", empresa_id).eq("ativo", true).is("deleted_at", null);
  const flowIds = (flows ?? []).map((f: any) => f.id);
  if (!flowIds.length) {
    return {
      definitions_would_enable: [], definitions_disabled_excluded: [],
      snapshot_summary: { total_pending_dry_run: 0, by_category: {} },
      snapshot_samples: {}, classified: [], truncated: false, partial: false,
    };
  }
  const { data: actions } = await supabase.from("orbit_flow_actions")
    .select("id, flow_id, action_type, action_config, ordem")
    .in("flow_id", flowIds).eq("action_type", "send_whatsapp_template");
  const actionsById = new Map<string, any>();
  const wouldEnable: any[] = [];
  const disabledExcluded: any[] = [];
  for (const a of actions ?? []) {
    actionsById.set(a.id, a);
    const cfg = a.action_config ?? {};
    if (cfg.enabled === false) {
      disabledExcluded.push({ action_id: a.id, flow_id: a.flow_id, ordem: a.ordem, disabled_reason: cfg.disabled_reason ?? null });
      continue;
    }
    if (cfg.dry_run === true) {
      wouldEnable.push({ action_id: a.id, flow_id: a.flow_id, ordem: a.ordem, category: cfg.category ?? null, cancel_on_reply: cfg.cancel_on_reply === true });
    }
  }

  const { data: snapshots } = await supabase.from("orbit_flow_scheduled_actions")
    .select("id, action_id, prospect_id, scheduled_for, created_at, action_config, status")
    .eq("empresa_id", empresa_id).eq("action_type", "send_whatsapp_template").eq("status", "pending")
    .limit(PREVIEW_HARD_LIMIT + 1);
  const rows = snapshots ?? [];
  const truncated = rows.length > PREVIEW_HARD_LIMIT;
  const workRows = truncated ? rows.slice(0, PREVIEW_HARD_LIMIT) : rows;

  const prospectIds = workRows.map((s: any) => s.prospect_id).filter(Boolean);
  const ctx = await fetchContext(supabase, empresa_id, prospectIds);

  const classified: ClassifiedSnapshot[] = [];
  for (const snap of workRows) {
    const cfg = snap.action_config ?? {};
    if (cfg.dry_run !== true) continue;
    if (cfg.enabled === false) continue;
    const action = snap.action_id ? actionsById.get(snap.action_id) : null;
    if (!action) {
      classified.push({ scheduled_id: snap.id, prospect_id: snap.prospect_id ?? null, action_id: snap.action_id ?? null, original_scheduled_for: snap.scheduled_for, proposed_scheduled_for: null, category: "blocked_other_guard", reason: "action_unknown_or_deleted" });
      continue;
    }
    if ((action.action_config ?? {}).enabled === false) {
      classified.push({ scheduled_id: snap.id, prospect_id: snap.prospect_id ?? null, action_id: snap.action_id ?? null, original_scheduled_for: snap.scheduled_for, proposed_scheduled_for: null, category: "blocked_other_guard", reason: "action_disabled" });
      continue;
    }
    classified.push(await classifySnapshotWithContext(ctx, snap, action));
  }

  // Escalonamento respeitando ritmo
  const { data: sendCfg } = await supabase.from("orbit_whatsapp_sending_config")
    .select("max_per_minute, daily_limit").eq("empresa_id", empresa_id).maybeSingle();
  const rhythm = {
    max_per_minute: sendCfg?.max_per_minute ?? DEFAULT_MAX_PER_MINUTE,
    daily_limit: sendCfg?.daily_limit ?? DEFAULT_DAILY_LIMIT,
  };
  const eligible = classified.filter(c => c.category === "eligible_rebase" && c.proposed_scheduled_for);
  stagger(eligible, rhythm);

  const byCategory: Record<string, number> = {};
  const samples: Record<string, ClassifiedSnapshot[]> = {};
  for (const c of classified) {
    byCategory[c.category] = (byCategory[c.category] ?? 0) + 1;
    if (!samples[c.category]) samples[c.category] = [];
    if (samples[c.category].length < 5) samples[c.category].push(c);
  }
  return {
    definitions_would_enable: wouldEnable,
    definitions_disabled_excluded: disabledExcluded,
    snapshot_summary: { total_pending_dry_run: classified.length, by_category: byCategory },
    snapshot_samples: samples,
    rhythm,
    truncated,
    partial: false,
    classified,
  };
}

async function applyReconcile(
  supabase: SupabaseClient,
  empresa_id: string,
  performed_by: string,
  operation_id: string,
) {
  const preview = await buildPreview(supabase, empresa_id);
  if (preview.truncated) return { error: "preview_truncated_refuse_apply" };
  const actionsPayload = preview.definitions_would_enable.map((d: any) => ({ action_id: d.action_id }));
  const snapshotsPayload = (preview.classified ?? [])
    .filter((c: ClassifiedSnapshot) => c.category === "eligible_rebase" && c.proposed_scheduled_for)
    .map((c: ClassifiedSnapshot) => ({ scheduled_id: c.scheduled_id, proposed_scheduled_for: c.proposed_scheduled_for }));

  const performedByFinal = performed_by === "00000000-0000-0000-0000-000000000000" ? null : performed_by;
  const { data, error } = await supabase.rpc("orbit_flow_go_live_apply_v2", {
    p_operation_id: operation_id,
    p_empresa_id: empresa_id,
    p_performed_by: performedByFinal,
    p_actions: actionsPayload,
    p_snapshots: snapshotsPayload,
  });
  if (error) return { error: error.message };
  return data;
}

async function rollbackOperation(supabase: SupabaseClient, operation_id: string, rolled_back_by: string) {
  const rbBy = rolled_back_by === "00000000-0000-0000-0000-000000000000" ? null : rolled_back_by;
  const { data, error } = await supabase.rpc("orbit_flow_go_live_rollback_v2", {
    p_operation_id: operation_id, p_rolled_back_by: rbBy,
  });
  if (error) return { error: error.message };
  return data;
}

// ─── Smoke E2E (super_admin OR service_role) ───────────────────────
async function runInternalSmoke(supabase: SupabaseClient, actorId: string) {
  const RUN_ID = `RECONCILE_SMOKE_${Date.now()}`;
  const results: Array<{ name: string; pass: boolean; detail?: any }> = [];
  const record = (name: string, pass: boolean, detail?: any) => results.push({ name, pass, detail });

  const mkEmpresa = async () => {
    const slug = `rec-${crypto.randomUUID().slice(0, 8)}`;
    const { data, error } = await supabase.from("orbit_empresas")
      .insert({ nome: `${RUN_ID}_${slug}`, slug }).select("id").single();
    if (error) throw new Error(`empresa: ${error.message}`);
    return data.id as string;
  };

  const empresa_id = await mkEmpresa().catch((e) => {
    record("tenant_create", false, e.message);
    return null;
  });
  if (!empresa_id) return { run_id: RUN_ID, results };
  let empresaB: string | null = null;

  const cleanup = async (emp: string) => {
    const flowIds = ((await supabase.from("orbit_flows").select("id").eq("empresa_id", emp)).data ?? []).map((r: any) => r.id);
    await supabase.from("orbit_flow_go_live_operations").delete().eq("empresa_id", emp);
    await supabase.from("orbit_flow_scheduled_actions").delete().eq("empresa_id", emp);
    if (flowIds.length) await supabase.from("orbit_flow_actions").delete().in("flow_id", flowIds);
    await supabase.from("orbit_flow_runs").delete().eq("empresa_id", emp);
    await supabase.from("orbit_flows").delete().eq("empresa_id", emp);
    await supabase.from("orbit_mensagens").delete().eq("empresa_id", emp);
    await supabase.from("orbit_conversas").delete().eq("empresa_id", emp);
    await supabase.from("orbit_meetings").delete().eq("empresa_id", emp);
    await supabase.from("orbit_handoffs").delete().eq("empresa_id", emp);
    await supabase.from("orbit_deals").delete().eq("empresa_id", emp);
    await supabase.from("orbit_pipeline_stages").delete().eq("empresa_id", emp);
    await supabase.from("orbit_prospects").delete().eq("empresa_id", emp);
    await supabase.from("orbit_empresas").delete().eq("id", emp);
  };

  try {
    const chk = <T,>(step: string, r: { data: T | null; error: any }): T => {
      if (r.error || !r.data) throw new Error(`${step}: ${r.error?.message ?? "no data"}`);
      return r.data;
    };
    const mkFlow = async (emp: string, cfg: any) => {
      const flow = chk("flows", await supabase.from("orbit_flows").insert({
        empresa_id: emp, nome: `${RUN_ID}_${crypto.randomUUID().slice(0, 6)}`,
        trigger_type: "lead_recebido", trigger_config: {}, condicoes: [], ativo: true,
      }).select("id").single());
      const action = chk("actions", await supabase.from("orbit_flow_actions").insert({
        flow_id: (flow as any).id, ordem: 1, action_type: "send_whatsapp_template",
        action_config: { dry_run: true, category: "follow_up", cancel_on_reply: true, ...cfg },
        delay_seconds: 0,
      }).select("id").single());
      return { flow_id: (flow as any).id as string, action_id: (action as any).id as string };
    };
    const mkProspect = async (emp: string, opts: any = {}) => {
      const r = chk("prospect", await supabase.from("orbit_prospects").insert({
        empresa_id: emp, nome_razao: `${RUN_ID}_p_${crypto.randomUUID().slice(0, 6)}`,
        telefone: `+55119${Math.floor(Math.random() * 1e8)}`,
        origem_lead: "smoke", tipo: "pessoa", origem_contato: "IMPORTACAO", ...opts,
      }).select("id").single());
      return (r as any).id as string;
    };
    const mkConversa = async (emp: string, pid: string, opts: any = {}) => {
      const r = chk("conversa", await supabase.from("orbit_conversas").insert({
        empresa_id: emp, prospect_id: pid,
        telefone_whatsapp: `+55119${Math.floor(Math.random() * 1e8)}`,
        canal: "whatsapp", status: "aberta", human_talk: false, ...opts,
      }).select("id").single());
      return (r as any).id as string;
    };
    const insertMsg = async (emp: string, cid: string, direcao: "IN"|"OUT", status: string, offsetMs = 0) => {
      const r = await supabase.from("orbit_mensagens").insert({
        empresa_id: emp, conversa_id: cid, direcao, status,
        mensagem: `${RUN_ID}_${direcao}_${status}`, canal: "whatsapp",
        timestamp: new Date(Date.now() + offsetMs).toISOString(),
      });
      if (r.error) throw new Error(r.error.message);
    };
    const mkSnap = async (emp: string, flow_id: string, action_id: string, prospect_id: string, cfg: any = {}, delayMs = 86400000) => {
      const run = chk("run", await supabase.from("orbit_flow_runs").insert({
        empresa_id: emp, flow_id, status: "pending", context: {},
      }).select("id").single());
      const r = chk("snap", await supabase.from("orbit_flow_scheduled_actions").insert({
        empresa_id: emp, flow_id, action_id, action_type: "send_whatsapp_template",
        action_config: { dry_run: true, category: "follow_up", cancel_on_reply: true, ...cfg },
        context: {}, run_id: (run as any).id, ordem: 1, prospect_id,
        scheduled_for: new Date(Date.now() + delayMs).toISOString(),
        status: "pending", attempts: 0,
      }).select("id").single());
      return (r as any).id as string;
    };

    const enabled = await mkFlow(empresa_id, {});
    const disabled = await mkFlow(empresa_id, { enabled: false, disabled_reason: "test_disabled" });

    // Prospects individuais para cada guard
    const pNoOut = await mkProspect(empresa_id);
    const pWithOut = await mkProspect(empresa_id);
    const pWithOutAndIn = await mkProspect(empresa_id);
    const pOnlySimulated = await mkProspect(empresa_id);
    const pFutureMeeting = await mkProspect(empresa_id);
    const pHandoff = await mkProspect(empresa_id);
    const pOptOut = await mkProspect(empresa_id, { optout_whatsapp: true });
    const pDeleted = await mkProspect(empresa_id, { deleted_at: new Date().toISOString() });
    const pTerminal = await mkProspect(empresa_id);

    const cOut = await mkConversa(empresa_id, pWithOut);
    await insertMsg(empresa_id, cOut, "OUT", "enviada", -3600 * 1000);
    const cReplied = await mkConversa(empresa_id, pWithOutAndIn);
    await insertMsg(empresa_id, cReplied, "OUT", "enviada", -7200 * 1000);
    await insertMsg(empresa_id, cReplied, "IN", "recebida", -3600 * 1000);
    const cSim = await mkConversa(empresa_id, pOnlySimulated);
    await insertMsg(empresa_id, cSim, "OUT", "simulated", -3600 * 1000);

    await supabase.from("orbit_meetings").insert({
      empresa_id, prospect_id: pFutureMeeting, titulo: "future",
      scheduled_at: new Date(Date.now() + 86400000).toISOString(), status: "scheduled",
    });
    await supabase.from("orbit_handoffs").insert({ empresa_id, prospect_id: pHandoff, status: "sent" });

    // Terminal stage + deal
    const stage = chk("stage", await supabase.from("orbit_pipeline_stages").insert({
      empresa_id, nome: "Ganho", ordem: 1, is_won: true, is_lost: false, ativo: true,
    }).select("id").single());
    await supabase.from("orbit_deals").insert({
      empresa_id, prospect_id: pTerminal, etapa_id: (stage as any).id,
      nome: "d", status: "aberto",
    });

    const snapMissing = await mkSnap(empresa_id, enabled.flow_id, enabled.action_id, pNoOut);
    const snapEligible = await mkSnap(empresa_id, enabled.flow_id, enabled.action_id, pWithOut);
    const snapReplied = await mkSnap(empresa_id, enabled.flow_id, enabled.action_id, pWithOutAndIn);
    const snapSimulated = await mkSnap(empresa_id, enabled.flow_id, enabled.action_id, pOnlySimulated);
    const snapMeeting = await mkSnap(empresa_id, enabled.flow_id, enabled.action_id, pFutureMeeting);
    const snapHandoff = await mkSnap(empresa_id, enabled.flow_id, enabled.action_id, pHandoff);
    const snapOptOut = await mkSnap(empresa_id, enabled.flow_id, enabled.action_id, pOptOut);
    const snapDeleted = await mkSnap(empresa_id, enabled.flow_id, enabled.action_id, pDeleted);
    const snapTerminal = await mkSnap(empresa_id, enabled.flow_id, enabled.action_id, pTerminal);
    const snapDisabled = await mkSnap(empresa_id, disabled.flow_id, disabled.action_id, pWithOut, { enabled: false });

    // Cross-tenant real: cria empresa B, e insere um snapshot em A apontando p/ prospect de B
    empresaB = await mkEmpresa();
    const pB = await mkProspect(empresaB);
    // Inserir snapshot em A com prospect_id de B (viola isolamento se não bloqueado)
    const runX = chk("runX", await supabase.from("orbit_flow_runs").insert({
      empresa_id, flow_id: enabled.flow_id, status: "pending", context: {},
    }).select("id").single());
    const snapCross = chk("snapCross", await supabase.from("orbit_flow_scheduled_actions").insert({
      empresa_id, flow_id: enabled.flow_id, action_id: enabled.action_id,
      action_type: "send_whatsapp_template",
      action_config: { dry_run: true, category: "follow_up", cancel_on_reply: true },
      context: {}, run_id: (runX as any).id, ordem: 1, prospect_id: pB,
      scheduled_for: new Date(Date.now() + 86400000).toISOString(),
      status: "pending", attempts: 0,
    }).select("id").single());

    // A. PREVIEW
    const preview = await buildPreview(supabase, empresa_id);
    const bySid = new Map<string, ClassifiedSnapshot>((preview.classified ?? []).map((c: ClassifiedSnapshot) => [c.scheduled_id, c]));
    record("preview_defs_would_enable_1", preview.definitions_would_enable.length === 1);
    record("preview_defs_disabled_excluded_1", preview.definitions_disabled_excluded.length === 1);
    record("preview_not_truncated", preview.truncated === false);
    record("guard_missing_real_out", bySid.get(snapMissing)?.category === "blocked_missing_real_out");
    record("guard_missing_real_out_simulated", bySid.get(snapSimulated)?.category === "blocked_missing_real_out");
    record("guard_replied", bySid.get(snapReplied)?.category === "blocked_replied");
    record("guard_future_meeting", bySid.get(snapMeeting)?.reason === "future_meeting");
    record("guard_handoff", bySid.get(snapHandoff)?.reason === "handoff_registered");
    record("guard_optout", bySid.get(snapOptOut)?.reason === "optout_whatsapp");
    record("guard_deleted", bySid.get(snapDeleted)?.reason === "prospect_deleted");
    record("guard_terminal_stage", bySid.get(snapTerminal)?.reason === "deal_terminal_stage");
    record("guard_cross_tenant_real", bySid.get((snapCross as any).id)?.reason === "prospect_missing_or_cross_tenant");
    record("guard_disabled_snap_excluded", !bySid.has(snapDisabled));
    record("eligible_1", bySid.get(snapEligible)?.category === "eligible_rebase");
    // Staggering: proposto no futuro
    const eSnapClass = bySid.get(snapEligible);
    record("stagger_future_only", !!eSnapClass?.proposed_scheduled_for && new Date(eSnapClass!.proposed_scheduled_for!).getTime() > Date.now());

    // B. APPLY (transacional + idempotente)
    const opId = `${RUN_ID}_op1`;
    const apply1 = await applyReconcile(supabase, empresa_id, actorId, opId);
    record("apply_ok", (apply1 as any).already_applied === false && (apply1 as any).summary?.definitions_enabled === 1 && (apply1 as any).summary?.snapshots_rebased === 1, apply1);
    record("apply_no_kill_switch", (apply1 as any).summary?.envio_real_liberado_touched === false && (apply1 as any).summary?.outbox_adapter_enabled_touched === false);

    const apply2 = await applyReconcile(supabase, empresa_id, actorId, opId);
    record("apply_idempotent", (apply2 as any).already_applied === true, apply2);

    // operation_id cross-tenant → falha
    const crossApply = await applyReconcile(supabase, empresaB, actorId, opId);
    record("apply_operation_cross_tenant_rejected", !!(crossApply as any).error);

    const { data: eAction } = await supabase.from("orbit_flow_actions").select("action_config").eq("id", enabled.action_id).single();
    record("action_promoted", (eAction as any)?.action_config?.dry_run === false);
    const { data: dAction } = await supabase.from("orbit_flow_actions").select("action_config").eq("id", disabled.action_id).single();
    record("action_disabled_untouched", (dAction as any)?.action_config?.enabled === false && (dAction as any)?.action_config?.dry_run !== false);
    const { data: eSnap } = await supabase.from("orbit_flow_scheduled_actions").select("action_config").eq("id", snapEligible).single();
    record("snap_promoted", (eSnap as any)?.action_config?.dry_run === false);

    // C. Atomic rollback drift → rollback_conflict
    // Mutar action promovida para simular drift
    await supabase.from("orbit_flow_actions")
      .update({ action_config: { dry_run: false, category: "follow_up", cancel_on_reply: true, drift_marker: true } })
      .eq("id", enabled.action_id);
    const rbConflict = await rollbackOperation(supabase, opId, actorId);
    record("rollback_conflict_detected", !!(rbConflict as any).error && String((rbConflict as any).error).includes("rollback_conflict"), rbConflict);
    // Restaurar exato after para permitir rollback normal
    await supabase.from("orbit_flow_actions")
      .update({ action_config: (apply1 as any).summary
        ? { ...(eAction as any).action_config, dry_run: false }
        : { dry_run: false, category: "follow_up", cancel_on_reply: true } })
      .eq("id", enabled.action_id);
    // Restaurar corretamente: reconstruir "after" exato (dry_run:false + resto do before)
    // Simplesmente busca again do apply1.changes seria ideal; usamos apply1 result:
    const { data: opRow } = await supabase.from("orbit_flow_go_live_operations")
      .select("changes").eq("operation_id", opId).single();
    const chActionAfter = (opRow?.changes ?? []).find((c: any) => c.kind === "action_dry_run_false")?.after;
    if (chActionAfter) {
      await supabase.from("orbit_flow_actions").update({ action_config: chActionAfter }).eq("id", enabled.action_id);
    }
    const rbOk = await rollbackOperation(supabase, opId, actorId);
    record("rollback_ok", !((rbOk as any).error), rbOk);
    const { data: rAction } = await supabase.from("orbit_flow_actions").select("action_config").eq("id", enabled.action_id).single();
    record("action_reverted", (rAction as any)?.action_config?.dry_run === true);
    const { data: rSnap } = await supabase.from("orbit_flow_scheduled_actions").select("action_config").eq("id", snapEligible).single();
    record("snap_reverted", (rSnap as any)?.action_config?.dry_run === true);

    // D. Rollback registers rolled_back_by (nullable ok for service token)
    const { data: opAfter } = await supabase.from("orbit_flow_go_live_operations")
      .select("status, rolled_back_at").eq("operation_id", opId).single();
    record("rollback_status_recorded", (opAfter as any)?.status === "rolled_back" && !!(opAfter as any)?.rolled_back_at);
  } catch (e: any) {
    record("smoke_exception", false, e?.message ?? String(e));
  } finally {
    await cleanup(empresa_id);
    if (empresaB) await cleanup(empresaB);
  }

  const passed = results.filter(r => r.pass).length;
  return { run_id: RUN_ID, empresa_id_synthetic: empresa_id, total: results.length, passed, failed: results.length - passed, results };
}

// ─── HTTP handler ───────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse(req);
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return fail(ErrorCodes.UNAUTHORIZED, "Missing Authorization", 401, undefined, req);
    }

    const auth = await authorize(supabase, req);
    if (!auth) {
      return fail(ErrorCodes.UNAUTHORIZED, "Apenas super_admin ou service_role", 403, undefined, req);
    }

    const body = await req.json().catch(() => ({}));
    const mode = String(body?.mode ?? "preview");

    // Todos os modes exigem super_admin OU service_role — já validado por authorize().
    if (mode === "smoke") {
      const result = await runInternalSmoke(supabase, auth.actorId);
      return ok(result, {}, req);
    }
    if (mode === "rollback") {
      const operation_id = body?.operation_id as string | undefined;
      if (!operation_id) return fail(ErrorCodes.VALIDATION_ERROR, "operation_id obrigatório", 400, undefined, req);
      return ok(await rollbackOperation(supabase, operation_id, auth.actorId), {}, req);
    }
    const empresa_id = body?.empresa_id as string | undefined;
    if (!empresa_id) return fail(ErrorCodes.VALIDATION_ERROR, "empresa_id obrigatório", 400, undefined, req);

    if (mode === "preview") {
      const preview = await buildPreview(supabase, empresa_id);
      const { classified: _drop, ...safe } = preview as any;
      return ok(safe, {}, req);
    }
    if (mode === "apply") {
      const confirm = String(body?.confirm_text ?? "");
      const authorized = body?.authorized === true;
      const operation_id = String(body?.operation_id ?? "");
      if (confirm !== CONFIRM_TEXT) return fail(ErrorCodes.VALIDATION_ERROR, `Confirme com "${CONFIRM_TEXT}"`, 400, undefined, req);
      if (!authorized) return fail(ErrorCodes.VALIDATION_ERROR, "Autorização obrigatória", 400, undefined, req);
      if (!operation_id || operation_id.length < 8) return fail(ErrorCodes.VALIDATION_ERROR, "operation_id inválido", 400, undefined, req);
      return ok(await applyReconcile(supabase, empresa_id, auth.actorId, operation_id), {}, req);
    }
    return fail(ErrorCodes.VALIDATION_ERROR, "mode inválido", 400, undefined, req);
  } catch (e: any) {
    return fail(ErrorCodes.VALIDATION_ERROR, e?.message ?? "erro", 500, undefined, req);
  }
});
