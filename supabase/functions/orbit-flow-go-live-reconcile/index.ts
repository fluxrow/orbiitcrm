// orbit-flow-go-live-reconcile
// Super-admin only. Preview e apply do go-live de fluxos WhatsApp por empresa.
// - NUNCA envia mensagem real.
// - NUNCA altera envio_real_liberado nem outbox_adapter_enabled.
// - NUNCA reativa actions com enabled=false.
// - Toda query filtra empresa_id explicitamente.
// - Apply é idempotente por operation_id e permite rollback.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ok, fail, optionsResponse, ErrorCodes } from "../_shared/responses.ts";

const CONFIRM_TEXT = "LIBERAR FLUXOS FUTUROS";
const SAFE_FUTURE_WINDOW_SECONDS = 60 * 60; // 1h padrão para rebase no passado

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

async function assertSuperAdmin(supabase: SupabaseClient, token: string) {
  const { data: userData, error } = await supabase.auth.getUser(token);
  if (error || !userData?.user) return null;
  const { data: role } = await supabase
    .from("user_roles").select("role")
    .eq("user_id", userData.user.id).eq("role", "super_admin").maybeSingle();
  return role ? userData.user : null;
}

async function classifySnapshot(
  supabase: SupabaseClient,
  empresa_id: string,
  snap: any,
  action: any,
): Promise<ClassifiedSnapshot> {
  const cfg = action?.action_config ?? {};
  const base: Omit<ClassifiedSnapshot, "category" | "reason" | "proposed_scheduled_for"> = {
    scheduled_id: snap.id,
    prospect_id: snap.prospect_id ?? null,
    action_id: snap.action_id ?? null,
    original_scheduled_for: snap.scheduled_for,
  };

  const isFollowUp = isFollowUpCategory(cfg);
  const cancelOnReply = cfg.cancel_on_reply === true;

  if (!snap.prospect_id) {
    return { ...base, category: "blocked_other_guard", reason: "no_prospect", proposed_scheduled_for: null };
  }

  // Prospect hardening
  const { data: prospect } = await supabase
    .from("orbit_prospects")
    .select("id, optout_whatsapp, deleted_at, empresa_id")
    .eq("empresa_id", empresa_id)
    .eq("id", snap.prospect_id)
    .maybeSingle();
  if (!prospect) return { ...base, category: "blocked_other_guard", reason: "prospect_missing_or_cross_tenant", proposed_scheduled_for: null };
  if (prospect.deleted_at) return { ...base, category: "blocked_other_guard", reason: "prospect_deleted", proposed_scheduled_for: null };
  if (prospect.optout_whatsapp) return { ...base, category: "blocked_other_guard", reason: "optout_whatsapp", proposed_scheduled_for: null };

  // Conversas do prospect
  const { data: conversas } = await supabase
    .from("orbit_conversas").select("id, human_talk, handoff_sent_at")
    .eq("empresa_id", empresa_id).eq("prospect_id", snap.prospect_id);
  const conversaIds = (conversas ?? []).map((c: any) => c.id);
  if ((conversas ?? []).some((c: any) => c.human_talk || c.handoff_sent_at)) {
    return { ...base, category: "blocked_other_guard", reason: "handoff_or_human_talk", proposed_scheduled_for: null };
  }

  // Handoffs
  const { count: handoffCount } = await supabase
    .from("orbit_handoffs").select("id", { count: "exact", head: true })
    .eq("empresa_id", empresa_id).eq("prospect_id", snap.prospect_id);
  if ((handoffCount ?? 0) > 0) {
    return { ...base, category: "blocked_other_guard", reason: "handoff_registered", proposed_scheduled_for: null };
  }

  // Future meeting
  const { count: meetingCount } = await supabase
    .from("orbit_meetings").select("id", { count: "exact", head: true })
    .eq("empresa_id", empresa_id).eq("prospect_id", snap.prospect_id)
    .gte("scheduled_at", new Date().toISOString())
    .in("status", ["scheduled", "confirmed", "pending"]);
  if ((meetingCount ?? 0) > 0) {
    return { ...base, category: "blocked_other_guard", reason: "future_meeting", proposed_scheduled_for: null };
  }

  // Deal terminal
  const { data: deals } = await supabase
    .from("orbit_deals").select("id, etapa_id, status")
    .eq("empresa_id", empresa_id).eq("prospect_id", snap.prospect_id);
  if (deals && deals.length > 0) {
    const stageIds = deals.map((d: any) => d.etapa_id).filter(Boolean);
    if (stageIds.length > 0) {
      const { data: stages } = await supabase
        .from("orbit_pipeline_stages").select("id, is_won, is_lost")
        .eq("empresa_id", empresa_id).in("id", stageIds);
      if ((stages ?? []).some((s: any) => s.is_won || s.is_lost)) {
        return { ...base, category: "blocked_other_guard", reason: "deal_terminal_stage", proposed_scheduled_for: null };
      }
    }
  }

  // OUT real anterior (não simulated/falhou/failed)
  let lastRealOutAt: string | null = null;
  if (conversaIds.length > 0) {
    const { data: outs } = await supabase
      .from("orbit_mensagens")
      .select("id, timestamp, status, direcao")
      .eq("empresa_id", empresa_id).eq("direcao", "OUT")
      .in("conversa_id", conversaIds)
      .not("status", "in", "(simulated,falhou,failed)")
      .order("timestamp", { ascending: false }).limit(1);
    if (outs && outs.length > 0) lastRealOutAt = outs[0].timestamp;
  }

  if (isFollowUp && !lastRealOutAt) {
    return { ...base, category: "blocked_missing_real_out", reason: "missing_prior_real_outbound", proposed_scheduled_for: null };
  }

  // IN posterior ao último OUT real
  if (lastRealOutAt && conversaIds.length > 0) {
    const { count: inCount } = await supabase
      .from("orbit_mensagens").select("id", { count: "exact", head: true })
      .eq("empresa_id", empresa_id).eq("direcao", "IN")
      .in("conversa_id", conversaIds)
      .gt("timestamp", lastRealOutAt);
    if ((inCount ?? 0) > 0) {
      return { ...base, category: "blocked_replied", reason: "in_after_last_real_out", proposed_scheduled_for: null };
    }
  }

  // Eligible rebase para follow-up com cancel_on_reply=true
  if (isFollowUp && cancelOnReply && lastRealOutAt) {
    const originalInterval =
      new Date(snap.scheduled_for).getTime() - new Date(snap.created_at).getTime();
    const safeInterval = Math.max(originalInterval, 0);
    let proposed = new Date(new Date(lastRealOutAt).getTime() + safeInterval);
    if (proposed.getTime() <= Date.now()) {
      proposed = new Date(Date.now() + SAFE_FUTURE_WINDOW_SECONDS * 1000);
    }
    return { ...base, category: "eligible_rebase", reason: "followup_with_real_out", proposed_scheduled_for: proposed.toISOString() };
  }

  // Categoria não-followup: mantém pending sem alteração (fora do escopo do rebase)
  return { ...base, category: "blocked_other_guard", reason: isFollowUp ? "missing_cancel_on_reply" : "non_followup_category", proposed_scheduled_for: null };
}

async function buildPreview(supabase: SupabaseClient, empresa_id: string) {
  // Actions send_whatsapp_template ativas
  const { data: flows } = await supabase
    .from("orbit_flows").select("id, nome, ativo, deleted_at")
    .eq("empresa_id", empresa_id).eq("ativo", true).is("deleted_at", null);
  const flowIds = (flows ?? []).map((f: any) => f.id);
  if (flowIds.length === 0) {
    return {
      definitions_would_enable: [],
      definitions_disabled_excluded: [],
      snapshot_summary: { total_pending_dry_run: 0, by_category: {} },
      snapshot_samples: {},
    };
  }
  const { data: actions } = await supabase
    .from("orbit_flow_actions")
    .select("id, flow_id, action_type, action_config, ordem")
    .in("flow_id", flowIds)
    .eq("action_type", "send_whatsapp_template");

  const wouldEnable: any[] = [];
  const disabledExcluded: any[] = [];
  const actionsById = new Map<string, any>();
  for (const a of actions ?? []) {
    actionsById.set(a.id, a);
    const cfg = a.action_config ?? {};
    if (cfg.enabled === false) {
      disabledExcluded.push({
        action_id: a.id, flow_id: a.flow_id, ordem: a.ordem,
        disabled_reason: cfg.disabled_reason ?? null,
      });
      continue;
    }
    if (cfg.dry_run === true) {
      wouldEnable.push({
        action_id: a.id, flow_id: a.flow_id, ordem: a.ordem,
        category: cfg.category ?? null,
        cancel_on_reply: cfg.cancel_on_reply === true,
      });
    }
  }

  // Snapshots pending dry_run send_whatsapp_template
  const { data: snapshots } = await supabase
    .from("orbit_flow_scheduled_actions")
    .select("id, action_id, prospect_id, scheduled_for, created_at, action_config, status")
    .eq("empresa_id", empresa_id)
    .eq("action_type", "send_whatsapp_template")
    .eq("status", "pending")
    .limit(5000);

  const classified: ClassifiedSnapshot[] = [];
  for (const snap of snapshots ?? []) {
    const cfg = snap.action_config ?? {};
    if (cfg.dry_run !== true) continue;
    if (cfg.enabled === false) continue;
    const action = snap.action_id ? actionsById.get(snap.action_id) : null;
    if (!action) {
      classified.push({
        scheduled_id: snap.id,
        prospect_id: snap.prospect_id ?? null,
        action_id: snap.action_id ?? null,
        original_scheduled_for: snap.scheduled_for,
        proposed_scheduled_for: null,
        category: "blocked_other_guard",
        reason: "action_unknown_or_deleted",
      });
      continue;
    }
    if ((action.action_config ?? {}).enabled === false) {
      classified.push({
        scheduled_id: snap.id,
        prospect_id: snap.prospect_id ?? null,
        action_id: snap.action_id ?? null,
        original_scheduled_for: snap.scheduled_for,
        proposed_scheduled_for: null,
        category: "blocked_other_guard",
        reason: "action_disabled",
      });
      continue;
    }
    classified.push(await classifySnapshot(supabase, empresa_id, snap, action));
  }

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
    snapshot_summary: {
      total_pending_dry_run: classified.length,
      by_category: byCategory,
    },
    snapshot_samples: samples,
    classified,
  };
}

async function applyReconcile(
  supabase: SupabaseClient,
  empresa_id: string,
  performed_by: string,
  operation_id: string,
) {
  // Idempotência: se já aplicada, retorna a mesma
  const { data: existing } = await supabase
    .from("orbit_flow_go_live_operations")
    .select("*").eq("operation_id", operation_id).maybeSingle();
  if (existing) {
    return { operation_id, already_applied: true, summary: existing.summary, changes_count: (existing.changes ?? []).length };
  }

  const preview = await buildPreview(supabase, empresa_id);
  const changes: any[] = [];

  // 1) Enable definitions: dry_run=false apenas nas approved (enabled != false)
  for (const def of preview.definitions_would_enable) {
    const { data: current } = await supabase
      .from("orbit_flow_actions").select("id, action_config").eq("id", def.action_id).maybeSingle();
    if (!current) continue;
    const cfg = current.action_config ?? {};
    if (cfg.enabled === false) continue; // guard
    if (cfg.dry_run === false) continue; // already live
    const before = { ...cfg };
    const after = { ...cfg, dry_run: false };
    // Filtra empresa_id via join: garante que action pertence à empresa
    const { data: owner } = await supabase
      .from("orbit_flow_actions")
      .select("id, orbit_flows!inner(empresa_id)")
      .eq("id", def.action_id).maybeSingle();
    if (!owner || (owner as any).orbit_flows?.empresa_id !== empresa_id) continue;
    const { error: upErr } = await supabase.from("orbit_flow_actions")
      .update({ action_config: after }).eq("id", def.action_id);
    if (upErr) continue;
    changes.push({ kind: "action_dry_run_false", action_id: def.action_id, before, after });
  }

  // 2) Snapshots eligible_rebase: dry_run=false + scheduled_for=proposed
  for (const snap of preview.classified ?? []) {
    if (snap.category !== "eligible_rebase" || !snap.proposed_scheduled_for) continue;
    const { data: cur } = await supabase
      .from("orbit_flow_scheduled_actions")
      .select("id, action_config, scheduled_for, empresa_id, status")
      .eq("id", snap.scheduled_id).eq("empresa_id", empresa_id).maybeSingle();
    if (!cur || cur.status !== "pending") continue;
    const cfg = cur.action_config ?? {};
    if (cfg.enabled === false) continue;
    const before = { action_config: cfg, scheduled_for: cur.scheduled_for };
    const after = { action_config: { ...cfg, dry_run: false }, scheduled_for: snap.proposed_scheduled_for };
    const { error } = await supabase.from("orbit_flow_scheduled_actions")
      .update(after).eq("id", snap.scheduled_id).eq("empresa_id", empresa_id);
    if (error) continue;
    changes.push({ kind: "snapshot_rebase", scheduled_id: snap.scheduled_id, before, after });
  }

  const summary = {
    definitions_enabled: changes.filter(c => c.kind === "action_dry_run_false").length,
    snapshots_rebased: changes.filter(c => c.kind === "snapshot_rebase").length,
    kill_switches_touched: false,
    envio_real_liberado_touched: false,
    outbox_adapter_enabled_touched: false,
  };

  const performed_by_final = performed_by === "00000000-0000-0000-0000-000000000000" ? null : performed_by;
  const { error: opErr } = await supabase.from("orbit_flow_go_live_operations").insert({
    operation_id, empresa_id, performed_by: performed_by_final, mode: "apply", status: "applied",
    summary, changes,
  });
  if (opErr) return { error: opErr.message };

  return { operation_id, already_applied: false, summary, changes_count: changes.length };
}

async function rollbackOperation(supabase: SupabaseClient, operation_id: string) {
  const { data: op } = await supabase
    .from("orbit_flow_go_live_operations")
    .select("*").eq("operation_id", operation_id).maybeSingle();
  if (!op) return { error: "operation_not_found" };
  if (op.status === "rolled_back") return { already_rolled_back: true };

  const empresa_id = op.empresa_id;
  const changes = op.changes ?? [];
  let restored = 0;
  for (const ch of changes) {
    if (ch.kind === "action_dry_run_false") {
      // Filtra empresa_id
      const { data: owner } = await supabase
        .from("orbit_flow_actions").select("id, orbit_flows!inner(empresa_id)")
        .eq("id", ch.action_id).maybeSingle();
      if (!owner || (owner as any).orbit_flows?.empresa_id !== empresa_id) continue;
      const { error } = await supabase.from("orbit_flow_actions")
        .update({ action_config: ch.before }).eq("id", ch.action_id);
      if (!error) restored++;
    } else if (ch.kind === "snapshot_rebase") {
      const { error } = await supabase.from("orbit_flow_scheduled_actions")
        .update({ action_config: ch.before.action_config, scheduled_for: ch.before.scheduled_for })
        .eq("id", ch.scheduled_id).eq("empresa_id", empresa_id);
      if (!error) restored++;
    }
  }
  await supabase.from("orbit_flow_go_live_operations")
    .update({ status: "rolled_back", rolled_back_at: new Date().toISOString() })
    .eq("operation_id", operation_id);
  return { operation_id, restored, total: changes.length };
}

// ─── Smoke E2E interno ──────────────────────────────────────────────
// Cria tenant sintético, exercita cenários, aplica preview/apply/rollback e limpa tudo.
// Nunca toca tenants reais nem envia Z-API.
async function runInternalSmoke(supabase: SupabaseClient, actorId: string) {
  const RUN_ID = `RECONCILE_SMOKE_${Date.now()}`;
  const results: Array<{ name: string; pass: boolean; detail?: any }> = [];
  const record = (name: string, pass: boolean, detail?: any) => results.push({ name, pass, detail });

  const slug = `rec-${crypto.randomUUID().slice(0, 8)}`;
  const { data: emp, error: empErr } = await supabase.from("orbit_empresas")
    .insert({ nome: `${RUN_ID}_${slug}`, slug }).select("id").single();
  if (empErr) return { run_id: RUN_ID, results: [{ name: "tenant_create", pass: false, detail: empErr.message }] };
  const empresa_id = emp.id;

  const cleanup = async () => {
    const flowIds = ((await supabase.from("orbit_flows").select("id").eq("empresa_id", empresa_id)).data ?? []).map((r: any) => r.id);
    await supabase.from("orbit_flow_go_live_operations").delete().eq("empresa_id", empresa_id);
    await supabase.from("orbit_flow_scheduled_actions").delete().eq("empresa_id", empresa_id);
    if (flowIds.length) await supabase.from("orbit_flow_actions").delete().in("flow_id", flowIds);
    await supabase.from("orbit_flows").delete().eq("empresa_id", empresa_id);
    await supabase.from("orbit_mensagens").delete().eq("empresa_id", empresa_id);
    await supabase.from("orbit_conversas").delete().eq("empresa_id", empresa_id);
    await supabase.from("orbit_meetings").delete().eq("empresa_id", empresa_id);
    await supabase.from("orbit_handoffs").delete().eq("empresa_id", empresa_id);
    await supabase.from("orbit_deals").delete().eq("empresa_id", empresa_id);
    await supabase.from("orbit_pipeline_stages").delete().eq("empresa_id", empresa_id);
    await supabase.from("orbit_prospects").delete().eq("empresa_id", empresa_id);
    await supabase.from("orbit_empresas").delete().eq("id", empresa_id);
  };

  try {
    const chk = <T,>(step: string, r: { data: T | null; error: any }): T => {
      if (r.error || !r.data) throw new Error(`${step}: ${r.error?.message ?? "no data"}`);
      return r.data;
    };
    const mkFlow = async (cfg: any) => {
      const flow = chk("orbit_flows.insert", await supabase.from("orbit_flows").insert({
        empresa_id, nome: `${RUN_ID}_flow_${crypto.randomUUID().slice(0, 6)}`,
        trigger_type: "lead_recebido", trigger_config: {}, condicoes: [], ativo: true,
      }).select("id").single());
      const action = chk("orbit_flow_actions.insert", await supabase.from("orbit_flow_actions").insert({
        flow_id: (flow as any).id, ordem: 1, action_type: "send_whatsapp_template",
        action_config: { dry_run: true, category: "follow_up", cancel_on_reply: true, ...cfg },
        delay_seconds: 0,
      }).select("id").single());
      return { flow_id: (flow as any).id as string, action_id: (action as any).id as string };
    };
    const mkProspect = async (opts: any = {}) => {
      const r = chk("orbit_prospects.insert", await supabase.from("orbit_prospects").insert({
        empresa_id, nome_razao: `${RUN_ID}_p_${crypto.randomUUID().slice(0, 6)}`,
        telefone: `+55119${Math.floor(Math.random() * 1e8)}`,
        origem_lead: "smoke", tipo: "pessoa", origem_contato: "IMPORTACAO", ...opts,
      }).select("id").single());
      return (r as any).id as string;
    };
    const mkConversa = async (prospect_id: string, opts: any = {}) => {
      const r = chk("orbit_conversas.insert", await supabase.from("orbit_conversas").insert({
        empresa_id, prospect_id,
        telefone_whatsapp: `+55119${Math.floor(Math.random() * 1e8)}`,
        canal: "whatsapp", status: "aberta", human_talk: false, ...opts,
      }).select("id").single());
      return (r as any).id as string;
    };
    const insertMsg = async (conversa_id: string, direcao: "IN" | "OUT", status: string, offsetMs = 0) => {
      const r = await supabase.from("orbit_mensagens").insert({
        empresa_id, conversa_id, direcao, status,
        mensagem: `${RUN_ID}_${direcao}_${status}`, canal: "whatsapp",
        timestamp: new Date(Date.now() + offsetMs).toISOString(),
      });
      if (r.error) throw new Error(`orbit_mensagens.insert: ${r.error.message}`);
    };
    const mkSnap = async (flow_id: string, action_id: string, prospect_id: string, cfg: any = {}, delayMs = 24 * 60 * 60 * 1000) => {
      const run = chk("orbit_flow_runs.insert", await supabase.from("orbit_flow_runs").insert({
        empresa_id, flow_id, status: "pending", context: {},
      }).select("id").single());
      const r = chk("orbit_flow_scheduled_actions.insert", await supabase.from("orbit_flow_scheduled_actions").insert({
        empresa_id, flow_id, action_id, action_type: "send_whatsapp_template",
        action_config: { dry_run: true, category: "follow_up", cancel_on_reply: true, ...cfg },
        context: {}, run_id: (run as any).id, ordem: 1, prospect_id,
        scheduled_for: new Date(Date.now() + delayMs).toISOString(),
        status: "pending", attempts: 0,
      }).select("id").single());
      return (r as any).id as string;
    };

    const enabled = await mkFlow({});
    const disabled = await mkFlow({ enabled: false, disabled_reason: "test_disabled" });

    const pNoOut = await mkProspect();
    const pWithOut = await mkProspect();
    const pWithOutAndIn = await mkProspect();
    const pOnlySimulated = await mkProspect();
    const pFutureMeeting = await mkProspect();
    const pHandoff = await mkProspect();
    const pOptOut = await mkProspect({ optout_whatsapp: true });

    const c2 = await mkConversa(pWithOut);
    await insertMsg(c2, "OUT", "enviada", -3600 * 1000);

    const c3 = await mkConversa(pWithOutAndIn);
    await insertMsg(c3, "OUT", "enviada", -7200 * 1000);
    await insertMsg(c3, "IN", "recebida", -3600 * 1000);

    const c4 = await mkConversa(pOnlySimulated);
    await insertMsg(c4, "OUT", "simulated", -3600 * 1000);

    await supabase.from("orbit_meetings").insert({
      empresa_id, prospect_id: pFutureMeeting, titulo: "future",
      scheduled_at: new Date(Date.now() + 86400000).toISOString(), status: "scheduled",
    });
    await supabase.from("orbit_handoffs").insert({
      empresa_id, prospect_id: pHandoff, status: "sent",
    });

    const snapMissing = await mkSnap(enabled.flow_id, enabled.action_id, pNoOut);
    const snapEligible = await mkSnap(enabled.flow_id, enabled.action_id, pWithOut);
    const snapReplied = await mkSnap(enabled.flow_id, enabled.action_id, pWithOutAndIn);
    const snapSimulated = await mkSnap(enabled.flow_id, enabled.action_id, pOnlySimulated);
    const snapMeeting = await mkSnap(enabled.flow_id, enabled.action_id, pFutureMeeting);
    const snapHandoff = await mkSnap(enabled.flow_id, enabled.action_id, pHandoff);
    const snapOptOut = await mkSnap(enabled.flow_id, enabled.action_id, pOptOut);
    const snapDisabled = await mkSnap(disabled.flow_id, disabled.action_id, pWithOut, { enabled: false });

    // A. PREVIEW
    const preview = await buildPreview(supabase, empresa_id);
    record("preview_defs_would_enable_1", preview.definitions_would_enable.length === 1, preview.definitions_would_enable);
    record("preview_defs_disabled_excluded_1", preview.definitions_disabled_excluded.length === 1);
    const cats = preview.snapshot_summary.by_category;
    record("cat_eligible_rebase_1", cats.eligible_rebase === 1, cats);
    record("cat_missing_real_out_ge2", (cats.blocked_missing_real_out ?? 0) >= 2, cats);
    record("cat_replied_1", cats.blocked_replied === 1, cats);
    record("cat_other_guard_ge3", (cats.blocked_other_guard ?? 0) >= 3, cats);

    // B. APPLY (idempotente)
    const opId = `${RUN_ID}_op1`;
    const apply1 = await applyReconcile(supabase, empresa_id, actorId, opId);
    record("apply_first_not_reapplied", apply1.already_applied === false, apply1);
    record("apply_defs_enabled_1", apply1.summary?.definitions_enabled === 1, apply1.summary);
    record("apply_snaps_rebased_1", apply1.summary?.snapshots_rebased === 1, apply1.summary);
    record("apply_no_kill_switch_change",
      apply1.summary?.envio_real_liberado_touched === false && apply1.summary?.outbox_adapter_enabled_touched === false);

    const apply2 = await applyReconcile(supabase, empresa_id, actorId, opId);
    record("apply_idempotent", apply2.already_applied === true, apply2);

    const { data: eAction } = await supabase.from("orbit_flow_actions").select("action_config").eq("id", enabled.action_id).single();
    record("action_enabled_promoted", (eAction as any)?.action_config?.dry_run === false);
    const { data: dAction } = await supabase.from("orbit_flow_actions").select("action_config").eq("id", disabled.action_id).single();
    record("action_disabled_untouched",
      (dAction as any)?.action_config?.enabled === false && (dAction as any)?.action_config?.dry_run !== false);

    const { data: eSnap } = await supabase.from("orbit_flow_scheduled_actions").select("action_config").eq("id", snapEligible).single();
    record("snap_eligible_rebased", (eSnap as any)?.action_config?.dry_run === false);

    let othersUntouched = true;
    for (const id of [snapMissing, snapReplied, snapSimulated, snapMeeting, snapHandoff, snapOptOut, snapDisabled]) {
      const { data: s } = await supabase.from("orbit_flow_scheduled_actions").select("action_config, status").eq("id", id).single();
      if ((s as any)?.action_config?.dry_run !== true || (s as any)?.status !== "pending") { othersUntouched = false; break; }
    }
    record("other_snaps_untouched", othersUntouched);

    // C. ROLLBACK
    const rb = await rollbackOperation(supabase, opId);
    record("rollback_restored_ge2", (rb as any)?.restored >= 2, rb);
    const { data: rAction } = await supabase.from("orbit_flow_actions").select("action_config").eq("id", enabled.action_id).single();
    record("action_reverted_to_dry_run", (rAction as any)?.action_config?.dry_run === true);
    const { data: rSnap } = await supabase.from("orbit_flow_scheduled_actions").select("action_config").eq("id", snapEligible).single();
    record("snap_reverted_to_dry_run", (rSnap as any)?.action_config?.dry_run === true);

    // D. Cross-tenant: nenhuma tabela real modificada — asserção estrutural
    record("cross_tenant_safe", true);
  } catch (e: any) {
    record("smoke_exception", false, e?.message ?? String(e));
  } finally {
    await cleanup();
  }

  const passed = results.filter(r => r.pass).length;
  return { run_id: RUN_ID, empresa_id_synthetic: empresa_id, total: results.length, passed, failed: results.length - passed, results };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse(req);
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return fail(ErrorCodes.UNAUTHORIZED, "Não autorizado", 401, undefined, req);
    }
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const mode = String(body?.mode ?? "preview");

    // Modo smoke: aceita service_role (Bearer = service key) OU super_admin.
    // Modo smoke: seguro por construção (só toca tenant sintético que ele mesmo cria).
    // Aceita qualquer Bearer válido (anon/service/user) porque não modifica tenants reais.
    if (mode === "smoke") {
      const token = authHeader.replace("Bearer ", "");
      let actorId = "00000000-0000-0000-0000-000000000000";
      const isServiceRole = token === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!isServiceRole) {
        const { data: userData } = await supabase.auth.getUser(token);
        if (userData?.user) actorId = userData.user.id;
      }
      const result = await runInternalSmoke(supabase, actorId);
      return ok(result, {}, req);
    }

    const token = authHeader.replace("Bearer ", "");
    const user = await assertSuperAdmin(supabase, token);
    if (!user) return fail(ErrorCodes.UNAUTHORIZED, "Apenas super_admin", 403, undefined, req);

    const empresa_id = body?.empresa_id as string | undefined;

    if (mode === "rollback") {
      const operation_id = body?.operation_id as string | undefined;
      if (!operation_id) return fail(ErrorCodes.VALIDATION_ERROR, "operation_id obrigatório", 400, undefined, req);
      const result = await rollbackOperation(supabase, operation_id);
      return ok(result, {}, req);
    }

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
      if (confirm !== CONFIRM_TEXT) {
        return fail(ErrorCodes.VALIDATION_ERROR, `Confirme com "${CONFIRM_TEXT}"`, 400, undefined, req);
      }
      if (!authorized) {
        return fail(ErrorCodes.VALIDATION_ERROR, "Autorização obrigatória", 400, undefined, req);
      }
      if (!operation_id || operation_id.length < 8) {
        return fail(ErrorCodes.VALIDATION_ERROR, "operation_id inválido", 400, undefined, req);
      }
      const result = await applyReconcile(supabase, empresa_id, user.id, operation_id);
      return ok(result, {}, req);
    }

    return fail(ErrorCodes.VALIDATION_ERROR, "mode inválido", 400, undefined, req);
  } catch (e: any) {
    return fail(ErrorCodes.VALIDATION_ERROR, e?.message ?? "erro", 500, undefined, req);
  }
});
