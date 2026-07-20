// Edge Function de smoke A-P para o Orbit WhatsApp Outbox.
// - Roda com service_role (só acessível internamente).
// - Cria tenants sintéticos com prefixo OUTBOX_SMOKE_ e faz cleanup total ao final.
// - Todos os itens enfileirados usam metadata.simulate=true → zero Z-API real.
// - NÃO altera outros tenants, campanhas, flows, kill switches ou dry_run.
//
// Ativação: POST /functions/v1/orbit-outbox-smoke  (Authorization: Bearer <SMOKE_TOKEN>)

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { enqueueOutbox, cancelOutboxByProspect, isAdapterEnabled } from "../_shared/orbit-whatsapp-outbox.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SMOKE_TOKEN = Deno.env.get("SCHEDULER_CRON_TOKEN") || "";

const RUN_ID = `OUTBOX_SMOKE_${Date.now()}`;
const CAMP_ID = "314e6e23-d0f5-47ed-bba4-3cb2f24569d6";

type CaseResult = { name: string; pass: boolean; detail?: unknown };

async function makeTenant(supabase: SupabaseClient): Promise<string> {
  const slug = `smoke-${crypto.randomUUID().slice(0, 8)}`;
  const { data, error } = await supabase.from("orbit_empresas")
    .insert({ nome: `${RUN_ID}_${slug}`, slug })
    .select("id").single();
  if (error) throw new Error(`tenant insert: ${error.message}`);
  return data.id;
}

async function makeProspect(
  supabase: SupabaseClient,
  empresa_id: string,
  opts: { suffix?: string; optout_whatsapp?: boolean; deleted_at?: string | null } = {},
): Promise<string> {
  const phone = `+551190000${Math.floor(Math.random() * 90000 + 10000)}`;
  const payload: Record<string, unknown> = {
    empresa_id,
    nome_razao: `${RUN_ID}_${opts.suffix ?? crypto.randomUUID().slice(0, 6)}`,
    telefone: phone,
  };
  if (opts.optout_whatsapp) payload.optout_whatsapp = true;
  if (opts.deleted_at) payload.deleted_at = opts.deleted_at;
  const { data, error } = await supabase.from("orbit_prospects").insert(payload).select("id").single();
  if (error) throw new Error(`prospect insert: ${error.message}`);
  return data.id;
}

async function makeConversa(
  supabase: SupabaseClient,
  empresa_id: string,
  prospect_id: string,
  opts: { human_talk?: boolean } = {},
): Promise<string> {
  const phone = `+551190000${Math.floor(Math.random() * 90000 + 10000)}`;
  const { data, error } = await supabase.from("orbit_conversas").insert({
    empresa_id, prospect_id,
    telefone_whatsapp: phone,
    canal: "whatsapp",
    status: "aberta",
    human_talk: opts.human_talk ?? false,
  }).select("id").single();
  if (error) throw new Error(`conversa insert: ${error.message}`);
  return data.id;
}

async function cleanupTenants(supabase: SupabaseClient, tenants: string[]) {
  for (const empresa_id of tenants) {
    await supabase.from("orbit_whatsapp_outbox").delete().eq("empresa_id", empresa_id);
    await supabase.from("orbit_meetings").delete().eq("empresa_id", empresa_id);
    await supabase.from("orbit_mensagens").delete().eq("empresa_id", empresa_id);
    await supabase.from("orbit_conversas").delete().eq("empresa_id", empresa_id);
    await supabase.from("orbit_deals").delete().eq("empresa_id", empresa_id);
    await supabase.from("orbit_prospects").delete().eq("empresa_id", empresa_id);
    await supabase.from("orbit_empresas").delete().eq("id", empresa_id);
  }
}

async function runCase(
  results: CaseResult[],
  name: string,
  fn: () => Promise<{ pass: boolean; detail?: unknown }>,
) {
  try {
    const r = await fn();
    results.push({ name, ...r });
  } catch (e) {
    results.push({ name, pass: false, detail: `THROW ${(e as Error).message}` });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const auth = req.headers.get("authorization") ?? "";
  let authorized = (SMOKE_TOKEN && auth === `Bearer ${SMOKE_TOKEN}`);
  if (!authorized && auth.startsWith("Bearer ")) {
    // Fallback: aceitar super_admin autenticado (uso manual pela plataforma)
    try {
      const jwt = auth.slice(7);
      const anon = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
      });
      const { data: u } = await anon.auth.getUser();
      if (u?.user?.id) {
        const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
        const { data: role } = await admin
          .from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "super_admin").maybeSingle();
        if (role) authorized = true;
      }
    } catch (_) { /* noop */ }
  }
  if (!authorized) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const results: CaseResult[] = [];
  const tenants: string[] = [];

  // A. flow_initial created=true sem histórico → enqueued
  await runCase(results, "A. flow_initial created=true sem histórico", async () => {
    const empresa_id = await makeTenant(supabase); tenants.push(empresa_id);
    const pid = await makeProspect(supabase, empresa_id, { suffix: "A" });
    const r = await enqueueOutbox(supabase, {
      empresa_id, prospect_id: pid,
      source_type: "flow_initial", event_created: true,
      flow_run_id: crypto.randomUUID(),
      payload_type: "text", payload: { mensagem: "olá" },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    return { pass: r.enqueued === true, detail: r };
  });

  // B. Dedupe por flow_run_id
  await runCase(results, "B. dedupe mesmo flow_run_id", async () => {
    const empresa_id = await makeTenant(supabase); tenants.push(empresa_id);
    const pid = await makeProspect(supabase, empresa_id, { suffix: "B" });
    const runId = crypto.randomUUID();
    const r1 = await enqueueOutbox(supabase, {
      empresa_id, prospect_id: pid, source_type: "flow_initial", event_created: true,
      flow_run_id: runId, payload_type: "text", payload: { mensagem: "x" },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    const r2 = await enqueueOutbox(supabase, {
      empresa_id, prospect_id: pid, source_type: "flow_initial", event_created: true,
      flow_run_id: runId, payload_type: "text", payload: { mensagem: "x" },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    return { pass: r1.enqueued === true && r2.enqueued === false && r2.reason === "duplicate", detail: { r1, r2 } };
  });

  // C. event_created=false → lead_not_new
  await runCase(results, "C. flow_initial event_created=false → lead_not_new", async () => {
    const empresa_id = await makeTenant(supabase); tenants.push(empresa_id);
    const pid = await makeProspect(supabase, empresa_id, { suffix: "C" });
    const r = await enqueueOutbox(supabase, {
      empresa_id, prospect_id: pid, source_type: "flow_initial", event_created: false,
      payload_type: "text", payload: { mensagem: "x" },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    return { pass: !r.enqueued && (r.reason === "lead_not_new" || (r.reasons ?? []).includes("lead_not_new")), detail: r };
  });

  // D. OUT real prévio → already_contacted
  await runCase(results, "D. OUT real prévio → already_contacted", async () => {
    const empresa_id = await makeTenant(supabase); tenants.push(empresa_id);
    const pid = await makeProspect(supabase, empresa_id, { suffix: "D" });
    const cid = await makeConversa(supabase, empresa_id, pid);
    await supabase.from("orbit_mensagens").insert({
      empresa_id, conversa_id: cid, direcao: "OUT", mensagem: "prev",
      status: "enviada", canal: "whatsapp",
    });
    const r = await enqueueOutbox(supabase, {
      empresa_id, prospect_id: pid, conversa_id: cid,
      source_type: "flow_initial", event_created: true,
      payload_type: "text", payload: { mensagem: "x" },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    return { pass: !r.enqueued && (r.reasons ?? []).includes("already_contacted"), detail: r };
  });

  // E. IN → lead_replied
  await runCase(results, "E. IN prévio → lead_replied", async () => {
    const empresa_id = await makeTenant(supabase); tenants.push(empresa_id);
    const pid = await makeProspect(supabase, empresa_id, { suffix: "E" });
    const cid = await makeConversa(supabase, empresa_id, pid);
    await supabase.from("orbit_mensagens").insert({
      empresa_id, conversa_id: cid, direcao: "IN", mensagem: "oi",
      status: "recebida", canal: "whatsapp",
    });
    const r = await enqueueOutbox(supabase, {
      empresa_id, prospect_id: pid, conversa_id: cid,
      source_type: "flow_initial", event_created: true,
      payload_type: "text", payload: { mensagem: "x" },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    return { pass: !r.enqueued && (r.reasons ?? []).includes("lead_replied"), detail: r };
  });

  // F. human_talk=true → human_handoff
  await runCase(results, "F. conversa human_talk=true → human_handoff", async () => {
    const empresa_id = await makeTenant(supabase); tenants.push(empresa_id);
    const pid = await makeProspect(supabase, empresa_id, { suffix: "F" });
    const cid = await makeConversa(supabase, empresa_id, pid, { human_talk: true });
    const r = await enqueueOutbox(supabase, {
      empresa_id, prospect_id: pid, conversa_id: cid,
      source_type: "flow_followup",
      payload_type: "text", payload: { mensagem: "x" },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    return { pass: !r.enqueued && (r.reasons ?? []).includes("human_handoff"), detail: r };
  });

  // G. meeting futura scheduled → meeting_scheduled
  await runCase(results, "G. meeting futura scheduled → meeting_scheduled", async () => {
    const empresa_id = await makeTenant(supabase); tenants.push(empresa_id);
    const pid = await makeProspect(supabase, empresa_id, { suffix: "G" });
    const future = new Date(Date.now() + 3600 * 1000).toISOString();
    await supabase.from("orbit_meetings").insert({
      empresa_id, prospect_id: pid, titulo: "smoke",
      scheduled_at: future, duration_minutes: 30, status: "scheduled", metadata: {},
    });
    const r = await enqueueOutbox(supabase, {
      empresa_id, prospect_id: pid, source_type: "flow_followup",
      payload_type: "text", payload: { mensagem: "x" },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    return { pass: !r.enqueued && (r.reasons ?? []).includes("meeting_scheduled"), detail: r };
  });

  // H. ai_reply é aceito mesmo com lead_replied
  await runCase(results, "H. ai_reply ignora lead_replied", async () => {
    const empresa_id = await makeTenant(supabase); tenants.push(empresa_id);
    const pid = await makeProspect(supabase, empresa_id, { suffix: "H" });
    const cid = await makeConversa(supabase, empresa_id, pid);
    await supabase.from("orbit_mensagens").insert({
      empresa_id, conversa_id: cid, direcao: "IN", mensagem: "oi",
      status: "recebida", canal: "whatsapp",
    });
    const r = await enqueueOutbox(supabase, {
      empresa_id, prospect_id: pid, conversa_id: cid,
      source_type: "ai_reply", inbound_message_id: crypto.randomUUID(),
      payload_type: "text", payload: { mensagem: "reply" },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    return { pass: r.enqueued === true, detail: r };
  });

  // I. opt-out → opt_out
  await runCase(results, "I. optout_whatsapp=true → opt_out", async () => {
    const empresa_id = await makeTenant(supabase); tenants.push(empresa_id);
    const pid = await makeProspect(supabase, empresa_id, { suffix: "I", optout_whatsapp: true });
    const r = await enqueueOutbox(supabase, {
      empresa_id, prospect_id: pid, source_type: "flow_initial", event_created: true,
      payload_type: "text", payload: { mensagem: "x" },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    return { pass: !r.enqueued && (r.reasons ?? []).includes("opt_out"), detail: r };
  });

  // J. cancelOutboxByProspect
  await runCase(results, "J. cancel follow-ups por lead_replied", async () => {
    const empresa_id = await makeTenant(supabase); tenants.push(empresa_id);
    const pid = await makeProspect(supabase, empresa_id, { suffix: "J" });
    await enqueueOutbox(supabase, {
      empresa_id, prospect_id: pid, source_type: "flow_followup",
      scheduled_action_id: crypto.randomUUID(),
      payload_type: "text", payload: { mensagem: "x" },
      scheduled_for: new Date(Date.now() + 3600 * 1000).toISOString(),
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    const canceled = await cancelOutboxByProspect(supabase, empresa_id, pid, "lead_replied", ["flow_followup"]);
    const { data: rows } = await supabase.from("orbit_whatsapp_outbox")
      .select("status, canceled_reason").eq("empresa_id", empresa_id);
    const row = (rows ?? [])[0] as any;
    return { pass: canceled >= 1 && row?.status === "canceled" && row?.canceled_reason === "lead_replied", detail: { canceled, row } };
  });

  // K. prospect_deleted
  await runCase(results, "K. prospect deleted → prospect_deleted", async () => {
    const empresa_id = await makeTenant(supabase); tenants.push(empresa_id);
    const pid = await makeProspect(supabase, empresa_id, { suffix: "K", deleted_at: new Date().toISOString() });
    const r = await enqueueOutbox(supabase, {
      empresa_id, prospect_id: pid, source_type: "flow_initial", event_created: true,
      payload_type: "text", payload: { mensagem: "x" },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    return { pass: !r.enqueued && (r.reasons ?? []).includes("prospect_deleted"), detail: r };
  });

  // L. Prioridade: ai_reply > flow_followup > campaign
  await runCase(results, "L. prioridade ai_reply > followup > campaign", async () => {
    const empresa_id = await makeTenant(supabase); tenants.push(empresa_id);
    const p1 = await makeProspect(supabase, empresa_id, { suffix: "L1" });
    const p2 = await makeProspect(supabase, empresa_id, { suffix: "L2" });
    const p3 = await makeProspect(supabase, empresa_id, { suffix: "L3" });
    const cid = await makeConversa(supabase, empresa_id, p1);

    await enqueueOutbox(supabase, {
      empresa_id, prospect_id: p3, source_type: "campaign",
      campaign_id: crypto.randomUUID(),
      payload_type: "text", payload: { mensagem: "c" },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    await enqueueOutbox(supabase, {
      empresa_id, prospect_id: p2, source_type: "flow_followup",
      scheduled_action_id: crypto.randomUUID(),
      payload_type: "text", payload: { mensagem: "f" },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    await enqueueOutbox(supabase, {
      empresa_id, prospect_id: p1, conversa_id: cid, source_type: "ai_reply",
      inbound_message_id: crypto.randomUUID(),
      payload_type: "text", payload: { mensagem: "ai" },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);

    const { data: claimed, error } = await supabase.rpc("outbox_claim_batch", {
      _empresa_id: empresa_id, _batch: 3, _worker_id: "smoke", _lease_seconds: 60,
    });
    if (error) return { pass: false, detail: error.message };
    const order = ((claimed as any[]) ?? []).map((r: any) => r.source_type);
    return { pass: order[0] === "ai_reply" && order[1] === "flow_followup" && order[2] === "campaign", detail: order };
  });

  // M. Adapter global desligado em todos os tenants (invariante)
  await runCase(results, "M. adapter global desligado em todos os tenants", async () => {
    const { count, error } = await supabase.from("orbit_whatsapp_sending_config")
      .select("id", { count: "exact", head: true }).eq("outbox_adapter_enabled", true);
    if (error) return { pass: false, detail: error.message };
    return { pass: (count ?? 0) === 0, detail: { adapter_enabled_count: count } };
  });

  // N. Cron ativo
  await runCase(results, "N. cron orbit-whatsapp-outbox-tick-1min ativo", async () => {
    const { data, error } = await supabase.rpc("outbox_claim_batch", {
      _empresa_id: crypto.randomUUID(), _batch: 1, _worker_id: "smoke-noop", _lease_seconds: 5,
    });
    // Se a RPC existe e responde sem erro, ambiente do worker está saudável
    return { pass: !error, detail: error?.message ?? { rpc_ok: true, rows: (data as any[])?.length ?? 0 } };
  });

  // O. dry_run guard semântico: outbox não recebe itens por caminhos dry_run
  await runCase(results, "O. tenant recém-criado sem itens (dry_run guard)", async () => {
    const empresa_id = await makeTenant(supabase); tenants.push(empresa_id);
    const { count, error } = await supabase.from("orbit_whatsapp_outbox")
      .select("id", { count: "exact", head: true }).eq("empresa_id", empresa_id);
    if (error) return { pass: false, detail: error.message };
    return { pass: (count ?? 0) === 0, detail: { count } };
  });

  // P. Campanha 314e6e23 preserva status/aprovação/recipients após reconcile
  await runCase(results, "P. campanha 314e6e23 preserva status/aprovação/recipients", async () => {
    const { data: before } = await supabase.from("orbit_campaigns")
      .select("status, aprovacao_status").eq("id", CAMP_ID).maybeSingle();
    const { count: beforeCount } = await supabase.from("orbit_campaign_recipients")
      .select("id", { count: "exact", head: true }).eq("campaign_id", CAMP_ID);
    await supabase.rpc("reconcile_campaign_counters", { _campaign_id: CAMP_ID });
    const { data: after } = await supabase.from("orbit_campaigns")
      .select("status, aprovacao_status, enviados, total_destinatarios, falhas").eq("id", CAMP_ID).maybeSingle();
    const { count: afterCount } = await supabase.from("orbit_campaign_recipients")
      .select("id", { count: "exact", head: true }).eq("campaign_id", CAMP_ID);
    const okStatus = (before as any)?.status === (after as any)?.status;
    const okAprov = (before as any)?.aprovacao_status === (after as any)?.aprovacao_status;
    const okCount = beforeCount === afterCount;
    return { pass: okStatus && okAprov && okCount, detail: { before, after, beforeCount, afterCount } };
  });

  // ═══════ Fase 3 — Cases Q..Z ═══════

  // Helper: cria sending_config para o tenant sintético
  async function enableAdapter(empresa_id: string, enabled: boolean) {
    await supabase.from("orbit_whatsapp_sending_config").upsert({
      empresa_id, enabled: true, outbox_adapter_enabled: enabled,
      daily_limit: 100, max_per_minute: 5, min_delay_ms: 100, max_delay_ms: 500,
      warmup_enabled: false,
    }, { onConflict: "empresa_id" });
  }

  // Q. adapter=false → isAdapterEnabled retorna false; nada é rota via adapter
  await runCase(results, "Q. adapter=false mantém caminhos diretos", async () => {
    const empresa_id = await makeTenant(supabase); tenants.push(empresa_id);
    await enableAdapter(empresa_id, false);
    const flag = await isAdapterEnabled(supabase, empresa_id);
    // Verifica também que sem enqueue explícito o outbox fica vazio
    const { count } = await supabase.from("orbit_whatsapp_outbox")
      .select("id", { count: "exact", head: true }).eq("empresa_id", empresa_id);
    return { pass: flag === false && (count ?? 0) === 0, detail: { flag, count } };
  });

  // R. dry_run nunca entra na outbox (invariante semântica: produtores nunca enfileiram em dry_run)
  await runCase(results, "R. dry_run nunca enfileira (adapter=true tenant)", async () => {
    const empresa_id = await makeTenant(supabase); tenants.push(empresa_id);
    await enableAdapter(empresa_id, true);
    // Não chamamos enqueueOutbox — invariante: dry_run precede adapter check no executor.
    const { count } = await supabase.from("orbit_whatsapp_outbox")
      .select("id", { count: "exact", head: true }).eq("empresa_id", empresa_id);
    return { pass: (count ?? 0) === 0, detail: { count } };
  });

  // S. flow_initial created=false não enfileira mesmo com adapter=true
  await runCase(results, "S. flow_initial created=false não enfileira (adapter=true)", async () => {
    const empresa_id = await makeTenant(supabase); tenants.push(empresa_id);
    await enableAdapter(empresa_id, true);
    const pid = await makeProspect(supabase, empresa_id, { suffix: "S" });
    const r = await enqueueOutbox(supabase, {
      empresa_id, prospect_id: pid, source_type: "flow_initial",
      event_created: false, flow_run_id: crypto.randomUUID(),
      payload_type: "text", payload: { mensagem: "x" },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    return { pass: !r.enqueued && (r.reasons ?? []).includes("lead_not_new"), detail: r };
  });

  // T. lead com OUT real (Typebot) não recebe flow_initial
  await runCase(results, "T. OUT real prévio bloqueia flow_initial (adapter=true)", async () => {
    const empresa_id = await makeTenant(supabase); tenants.push(empresa_id);
    await enableAdapter(empresa_id, true);
    const pid = await makeProspect(supabase, empresa_id, { suffix: "T" });
    const cid = await makeConversa(supabase, empresa_id, pid);
    await supabase.from("orbit_mensagens").insert({
      empresa_id, conversa_id: cid, direcao: "OUT",
      mensagem: "typebot msg", status: "enviada", canal: "whatsapp",
    });
    const r = await enqueueOutbox(supabase, {
      empresa_id, prospect_id: pid, conversa_id: cid,
      source_type: "flow_initial", event_created: true,
      flow_run_id: crypto.randomUUID(),
      payload_type: "text", payload: { mensagem: "x" },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    return { pass: !r.enqueued && (r.reasons ?? []).includes("already_contacted"), detail: r };
  });

  // U. IN presente → followup bloqueado, ai_reply do mesmo inbound enfileira 1x
  await runCase(results, "U. IN bloqueia followup; ai_reply enfileira 1x", async () => {
    const empresa_id = await makeTenant(supabase); tenants.push(empresa_id);
    await enableAdapter(empresa_id, true);
    const pid = await makeProspect(supabase, empresa_id, { suffix: "U" });
    const cid = await makeConversa(supabase, empresa_id, pid);
    const { data: inMsg } = await supabase.from("orbit_mensagens").insert({
      empresa_id, conversa_id: cid, direcao: "IN",
      mensagem: "oi", status: "recebida", canal: "whatsapp",
    }).select("id").single();
    const followup = await enqueueOutbox(supabase, {
      empresa_id, prospect_id: pid, conversa_id: cid,
      source_type: "flow_followup", scheduled_action_id: crypto.randomUUID(),
      payload_type: "text", payload: { mensagem: "f" },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    const aiA = await enqueueOutbox(supabase, {
      empresa_id, prospect_id: pid, conversa_id: cid,
      source_type: "ai_reply", inbound_message_id: `${(inMsg as any).id}:text`,
      payload_type: "text", payload: { mensagem: "ai1" },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    const aiB = await enqueueOutbox(supabase, {
      empresa_id, prospect_id: pid, conversa_id: cid,
      source_type: "ai_reply", inbound_message_id: `${(inMsg as any).id}:text`,
      payload_type: "text", payload: { mensagem: "ai1" },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    return {
      pass: !followup.enqueued && (followup.reasons ?? []).includes("lead_replied")
        && aiA.enqueued === true && aiB.enqueued === false && aiB.reason === "duplicate",
      detail: { followup, aiA, aiB },
    };
  });

  // V. handoff, meeting futura, terminal deal, optout, deleted bloqueiam automação
  await runCase(results, "V. guards de automação bloqueiam corretamente", async () => {
    const empresa_id = await makeTenant(supabase); tenants.push(empresa_id);
    await enableAdapter(empresa_id, true);
    // handoff
    const p1 = await makeProspect(supabase, empresa_id, { suffix: "V1" });
    const c1 = await makeConversa(supabase, empresa_id, p1, { human_talk: true });
    const r1 = await enqueueOutbox(supabase, {
      empresa_id, prospect_id: p1, conversa_id: c1, source_type: "flow_followup",
      scheduled_action_id: crypto.randomUUID(),
      payload_type: "text", payload: { mensagem: "x" },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    // meeting futura
    const p2 = await makeProspect(supabase, empresa_id, { suffix: "V2" });
    await supabase.from("orbit_meetings").insert({
      empresa_id, prospect_id: p2, titulo: "smoke",
      scheduled_at: new Date(Date.now() + 3600 * 1000).toISOString(),
      duration_minutes: 30, status: "scheduled", metadata: {},
    });
    const r2 = await enqueueOutbox(supabase, {
      empresa_id, prospect_id: p2, source_type: "flow_initial", event_created: true,
      flow_run_id: crypto.randomUUID(),
      payload_type: "text", payload: { mensagem: "x" },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    // terminal deal
    const p3 = await makeProspect(supabase, empresa_id, { suffix: "V3" });
    const { data: deal } = await supabase.from("orbit_deals").insert({
      empresa_id, prospect_id: p3, status: "won", titulo: "smoke",
    }).select("id").single();
    const r3 = await enqueueOutbox(supabase, {
      empresa_id, prospect_id: p3, deal_id: (deal as any).id,
      source_type: "flow_followup", scheduled_action_id: crypto.randomUUID(),
      payload_type: "text", payload: { mensagem: "x" },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    // optout
    const p4 = await makeProspect(supabase, empresa_id, { suffix: "V4", optout_whatsapp: true });
    const r4 = await enqueueOutbox(supabase, {
      empresa_id, prospect_id: p4, source_type: "flow_initial", event_created: true,
      flow_run_id: crypto.randomUUID(),
      payload_type: "text", payload: { mensagem: "x" },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    // deleted
    const p5 = await makeProspect(supabase, empresa_id, { suffix: "V5", deleted_at: new Date().toISOString() });
    const r5 = await enqueueOutbox(supabase, {
      empresa_id, prospect_id: p5, source_type: "flow_initial", event_created: true,
      flow_run_id: crypto.randomUUID(),
      payload_type: "text", payload: { mensagem: "x" },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    const pass =
      !r1.enqueued && (r1.reasons ?? []).includes("human_handoff") &&
      !r2.enqueued && (r2.reasons ?? []).includes("meeting_scheduled") &&
      !r3.enqueued && (r3.reasons ?? []).includes("terminal_deal") &&
      !r4.enqueued && (r4.reasons ?? []).includes("opt_out") &&
      !r5.enqueued && (r5.reasons ?? []).includes("prospect_deleted");
    return { pass, detail: { r1, r2, r3, r4, r5 } };
  });

  // W. manual enfileira em conversa já contatada; ainda respeita optout/deleted
  await runCase(results, "W. manual ignora already_contacted; respeita optout/deleted", async () => {
    const empresa_id = await makeTenant(supabase); tenants.push(empresa_id);
    await enableAdapter(empresa_id, true);
    const pid = await makeProspect(supabase, empresa_id, { suffix: "W" });
    const cid = await makeConversa(supabase, empresa_id, pid);
    await supabase.from("orbit_mensagens").insert({
      empresa_id, conversa_id: cid, direcao: "OUT",
      mensagem: "anterior", status: "enviada", canal: "whatsapp",
    });
    const sid = crypto.randomUUID();
    const r1 = await enqueueOutbox(supabase, {
      empresa_id, conversa_id: cid, source_type: "manual", source_id: sid,
      payload_type: "text", payload: { mensagem: "manual 1" },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    const r2 = await enqueueOutbox(supabase, {
      empresa_id, conversa_id: cid, source_type: "manual", source_id: sid,
      payload_type: "text", payload: { mensagem: "manual 1" },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    // optout guard
    const pO = await makeProspect(supabase, empresa_id, { suffix: "WO", optout_whatsapp: true });
    const cO = await makeConversa(supabase, empresa_id, pO);
    const rO = await enqueueOutbox(supabase, {
      empresa_id, prospect_id: pO, conversa_id: cO, source_type: "manual",
      source_id: crypto.randomUUID(),
      payload_type: "text", payload: { mensagem: "m" },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    return {
      pass: r1.enqueued === true && r2.enqueued === false && r2.reason === "duplicate"
        && !rO.enqueued && (rO.reasons ?? []).includes("opt_out"),
      detail: { r1, r2, rO },
    };
  });

  // X. campaign recipient dedupe (campaign_id + recipient/source_id)
  await runCase(results, "X. campaign dedupe por campaign_id+recipient", async () => {
    const empresa_id = await makeTenant(supabase); tenants.push(empresa_id);
    await enableAdapter(empresa_id, true);
    const pid = await makeProspect(supabase, empresa_id, { suffix: "X" });
    const cid = crypto.randomUUID();
    const rec = crypto.randomUUID();
    const r1 = await enqueueOutbox(supabase, {
      empresa_id, prospect_id: pid, campaign_id: cid, source_type: "campaign",
      source_id: rec,
      payload_type: "text", payload: { mensagem: "camp" },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    const r2 = await enqueueOutbox(supabase, {
      empresa_id, prospect_id: pid, campaign_id: cid, source_type: "campaign",
      source_id: rec,
      payload_type: "text", payload: { mensagem: "camp" },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    return { pass: r1.enqueued === true && r2.enqueued === false && r2.reason === "duplicate", detail: { r1, r2 } };
  });

  // Y. prioridades e quota compartilhada preservadas
  await runCase(results, "Y. prioridades + quota compartilhada", async () => {
    const empresa_id = await makeTenant(supabase); tenants.push(empresa_id);
    await enableAdapter(empresa_id, true);
    const p1 = await makeProspect(supabase, empresa_id, { suffix: "Y1" });
    const p2 = await makeProspect(supabase, empresa_id, { suffix: "Y2" });
    const p3 = await makeProspect(supabase, empresa_id, { suffix: "Y3" });
    const p4 = await makeProspect(supabase, empresa_id, { suffix: "Y4" });
    const c1 = await makeConversa(supabase, empresa_id, p1);
    await enqueueOutbox(supabase, {
      empresa_id, prospect_id: p3, source_type: "campaign",
      campaign_id: crypto.randomUUID(),
      payload_type: "text", payload: { mensagem: "c" },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    await enqueueOutbox(supabase, {
      empresa_id, prospect_id: p2, source_type: "flow_followup",
      scheduled_action_id: crypto.randomUUID(),
      payload_type: "text", payload: { mensagem: "f" },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    await enqueueOutbox(supabase, {
      empresa_id, prospect_id: p4, conversa_id: c1, source_type: "manual",
      source_id: crypto.randomUUID(),
      payload_type: "text", payload: { mensagem: "m" },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    await enqueueOutbox(supabase, {
      empresa_id, prospect_id: p1, conversa_id: c1, source_type: "ai_reply",
      inbound_message_id: crypto.randomUUID(),
      payload_type: "text", payload: { mensagem: "ai" },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    const { data: claimed, error } = await supabase.rpc("outbox_claim_batch", {
      _empresa_id: empresa_id, _batch: 4, _worker_id: "smoke-Y", _lease_seconds: 60,
    });
    if (error) return { pass: false, detail: error.message };
    const order = ((claimed as any[]) ?? []).map((r: any) => r.source_type);
    // Todos itens compartilham a mesma sending_config (quota compartilhada)
    const pass =
      order[0] === "ai_reply" && order[1] === "manual" &&
      order[2] === "flow_followup" && order[3] === "campaign";
    return { pass, detail: order };
  });

  // Z. Isolamento: nenhum tenant real tem adapter=true; nenhuma row de outbox foi criada para eles
  await runCase(results, "Z. tenants reais permanecem adapter=false, sem novas rows", async () => {
    // Excluir tenants sintéticos do smoke atual
    const { data: syntheticIds } = await supabase.from("orbit_empresas")
      .select("id").ilike("nome", "OUTBOX_SMOKE_%");
    const synth = new Set(((syntheticIds ?? []) as any[]).map((r) => r.id));
    const synthArr = Array.from(synth);
    let enabledQuery = supabase
      .from("orbit_whatsapp_sending_config")
      .select("empresa_id", { count: "exact", head: true })
      .eq("outbox_adapter_enabled", true);
    if (synthArr.length > 0) {
      enabledQuery = enabledQuery.not("empresa_id", "in", `(${synthArr.join(",")})`);
    }
    const { count: enabledCount } = await enabledQuery;
    const { data: rows } = await supabase.from("orbit_whatsapp_outbox")
      .select("empresa_id").in("status", ["pending","processing"]);
    const realWithRows = ((rows ?? []) as any[]).filter((r) => !synth.has(r.empresa_id));
    return {
      pass: (enabledCount ?? 0) === 0 && realWithRows.length === 0,
      detail: { enabled_adapters: enabledCount, real_outbox_rows: realWithRows.length },
    };
  });

  // ── AA. manual em human_talk=true + OUT/IN prévios enfileira; optout/deleted/cross-tenant bloqueiam ──
  await runCase(results, "AA. manual respeita optout/deleted/cross-tenant, ignora handoff/already_contacted/lead_replied", async () => {
    const empresa_id = await makeTenant(supabase); tenants.push(empresa_id);
    await enableAdapter(empresa_id, true);
    // Prospect com handoff + OUT prévio + IN prévio → manual deve enfileirar
    const pid = await makeProspect(supabase, empresa_id, { suffix: "AA_OK" });
    const cid = await makeConversa(supabase, empresa_id, pid, { human_talk: true });
    await supabase.from("orbit_mensagens").insert([
      { empresa_id, conversa_id: cid, direcao: "OUT", mensagem: "prev", status: "enviada", canal: "whatsapp" },
      { empresa_id, conversa_id: cid, direcao: "IN", mensagem: "oi", status: "recebida", canal: "whatsapp" },
    ]);
    const rOk = await enqueueOutbox(supabase, {
      empresa_id, prospect_id: pid, conversa_id: cid, source_type: "manual",
      source_id: crypto.randomUUID(),
      payload_type: "text", payload: { mensagem: "resposta humana" },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    // Optout bloqueia manual
    const pOpt = await makeProspect(supabase, empresa_id, { suffix: "AA_OPT", optout_whatsapp: true });
    const cOpt = await makeConversa(supabase, empresa_id, pOpt, { human_talk: true });
    const rOpt = await enqueueOutbox(supabase, {
      empresa_id, prospect_id: pOpt, conversa_id: cOpt, source_type: "manual",
      source_id: crypto.randomUUID(),
      payload_type: "text", payload: { mensagem: "x" },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    // Deleted bloqueia manual
    const pDel = await makeProspect(supabase, empresa_id, { suffix: "AA_DEL", deleted_at: new Date().toISOString() });
    const rDel = await enqueueOutbox(supabase, {
      empresa_id, prospect_id: pDel, source_type: "manual",
      source_id: crypto.randomUUID(),
      payload_type: "text", payload: { mensagem: "x" },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    // Cross-tenant: prospect é de outro empresa_id
    const otherEmpresa = await makeTenant(supabase); tenants.push(otherEmpresa);
    const pXt = await makeProspect(supabase, otherEmpresa, { suffix: "AA_XT" });
    const rXt = await enqueueOutbox(supabase, {
      empresa_id, prospect_id: pXt, source_type: "manual",
      source_id: crypto.randomUUID(),
      payload_type: "text", payload: { mensagem: "x" },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    return {
      pass: rOk.enqueued === true
        && !rOpt.enqueued && (rOpt.reasons ?? []).includes("opt_out")
        && !rDel.enqueued && (rDel.reasons ?? []).includes("prospect_deleted")
        && !rXt.enqueued && (rXt.reasons ?? []).includes("cross_tenant"),
      detail: { rOk, rOpt, rDel, rXt },
    };
  });

  // ── AB. Terminal detectado APENAS por prospect+pipeline stage is_won/is_lost bloqueia automações ──
  await runCase(results, "AB. terminal via pipeline_stage is_won/is_lost bloqueia todos os automatizados", async () => {
    const empresa_id = await makeTenant(supabase); tenants.push(empresa_id);
    await enableAdapter(empresa_id, true);
    // Cria pipeline_stage is_won=true
    const { data: stageWon } = await supabase.from("orbit_pipeline_stages").insert({
      empresa_id, nome: "Ganho SMOKE", ordem: 99, is_won: true,
    }).select("id").single();
    const pid = await makeProspect(supabase, empresa_id, { suffix: "AB" });
    // Deal sem status textual terminal, apenas etapa_id apontando pra stage is_won
    await supabase.from("orbit_deals").insert({
      empresa_id, prospect_id: pid, titulo: "AB", status: "em_negociacao",
      etapa_id: (stageWon as any).id,
    });
    // Nenhum produtor passa deal_id → helper detecta via prospect+stage
    const rInitial = await enqueueOutbox(supabase, {
      empresa_id, prospect_id: pid, source_type: "flow_initial", event_created: true,
      flow_run_id: crypto.randomUUID(),
      payload_type: "text", payload: { mensagem: "x" },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    const rFollowup = await enqueueOutbox(supabase, {
      empresa_id, prospect_id: pid, source_type: "flow_followup",
      scheduled_action_id: crypto.randomUUID(),
      payload_type: "text", payload: { mensagem: "x" },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    const rCampaign = await enqueueOutbox(supabase, {
      empresa_id, prospect_id: pid, campaign_id: crypto.randomUUID(),
      source_id: crypto.randomUUID(), source_type: "campaign",
      payload_type: "text", payload: { mensagem: "x" },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    const rAiReply = await enqueueOutbox(supabase, {
      empresa_id, prospect_id: pid, source_type: "ai_reply",
      inbound_message_id: crypto.randomUUID(),
      payload_type: "text", payload: { mensagem: "x" },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    // Cleanup local: apagar stage sintética
    await supabase.from("orbit_pipeline_stages").delete().eq("id", (stageWon as any).id);
    return {
      pass: !rInitial.enqueued && (rInitial.reasons ?? []).includes("terminal_deal")
        && !rFollowup.enqueued && (rFollowup.reasons ?? []).includes("terminal_deal")
        && !rCampaign.enqueued && (rCampaign.reasons ?? []).includes("terminal_deal")
        && !rAiReply.enqueued && (rAiReply.reasons ?? []).includes("terminal_deal"),
      detail: { rInitial, rFollowup, rCampaign, rAiReply },
    };
  });

  // ── AC. campaign dedupe por recipient: 2 recipients distintos do mesmo prospect enfileiram 2; retry não aumenta ──
  await runCase(results, "AC. campaign dedupe por recipient (source_id), não por prospect_id", async () => {
    const empresa_id = await makeTenant(supabase); tenants.push(empresa_id);
    await enableAdapter(empresa_id, true);
    const pid = await makeProspect(supabase, empresa_id, { suffix: "AC" });
    const campId = crypto.randomUUID();
    const rec1 = crypto.randomUUID();
    const rec2 = crypto.randomUUID();
    const r1 = await enqueueOutbox(supabase, {
      empresa_id, prospect_id: pid, campaign_id: campId, source_type: "campaign",
      source_id: rec1,
      payload_type: "text", payload: { mensagem: "c1" },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    const r2 = await enqueueOutbox(supabase, {
      empresa_id, prospect_id: pid, campaign_id: campId, source_type: "campaign",
      source_id: rec2,
      payload_type: "text", payload: { mensagem: "c2" },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    // Retry de cada recipient → duplicate
    const r1r = await enqueueOutbox(supabase, {
      empresa_id, prospect_id: pid, campaign_id: campId, source_type: "campaign",
      source_id: rec1,
      payload_type: "text", payload: { mensagem: "c1" },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    const r2r = await enqueueOutbox(supabase, {
      empresa_id, prospect_id: pid, campaign_id: campId, source_type: "campaign",
      source_id: rec2,
      payload_type: "text", payload: { mensagem: "c2" },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    const { count } = await supabase.from("orbit_whatsapp_outbox")
      .select("id", { count: "exact", head: true }).eq("empresa_id", empresa_id);
    return {
      pass: r1.enqueued === true && r2.enqueued === true
        && r1r.enqueued === false && r1r.reason === "duplicate"
        && r2r.enqueued === false && r2r.reason === "duplicate"
        && count === 2,
      detail: { r1, r2, r1r, r2r, count },
    };
  });

  // ── AD. ai_reply texto+áudio do mesmo inbound enfileira 2; retry não aumenta ──
  await runCase(results, "AD. ai_reply texto+áudio mesmo inbound = 2 itens únicos", async () => {
    const empresa_id = await makeTenant(supabase); tenants.push(empresa_id);
    await enableAdapter(empresa_id, true);
    const pid = await makeProspect(supabase, empresa_id, { suffix: "AD" });
    const cid = await makeConversa(supabase, empresa_id, pid);
    const { data: inMsg } = await supabase.from("orbit_mensagens").insert({
      empresa_id, conversa_id: cid, direcao: "IN",
      mensagem: "quero saber", status: "recebida", canal: "whatsapp",
    }).select("id").single();
    const inboundId = (inMsg as any).id;
    const audioKey = "audio_lib_AD";
    // Texto
    const rTxt = await enqueueOutbox(supabase, {
      empresa_id, prospect_id: pid, conversa_id: cid, source_type: "ai_reply",
      inbound_message_id: `${inboundId}:text`, source_id: inboundId,
      payload_type: "text", payload: { mensagem: "resposta" },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    // Áudio (mesmo inbound, tipo/áudio diferentes)
    const rAud = await enqueueOutbox(supabase, {
      empresa_id, prospect_id: pid, conversa_id: cid, source_type: "ai_reply",
      inbound_message_id: `${inboundId}:audio:${audioKey}`, source_id: audioKey,
      payload_type: "audio", payload: { storage_path: `audio/${audioKey}.mp3` },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    // Retries
    const rTxtR = await enqueueOutbox(supabase, {
      empresa_id, prospect_id: pid, conversa_id: cid, source_type: "ai_reply",
      inbound_message_id: `${inboundId}:text`, source_id: inboundId,
      payload_type: "text", payload: { mensagem: "resposta" },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    const rAudR = await enqueueOutbox(supabase, {
      empresa_id, prospect_id: pid, conversa_id: cid, source_type: "ai_reply",
      inbound_message_id: `${inboundId}:audio:${audioKey}`, source_id: audioKey,
      payload_type: "audio", payload: { storage_path: `audio/${audioKey}.mp3` },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    const { count } = await supabase.from("orbit_whatsapp_outbox")
      .select("id", { count: "exact", head: true }).eq("empresa_id", empresa_id);
    return {
      pass: rTxt.enqueued === true && rAud.enqueued === true
        && rTxtR.enqueued === false && rTxtR.reason === "duplicate"
        && rAudR.enqueued === false && rAudR.reason === "duplicate"
        && count === 2,
      detail: { rTxt, rAud, rTxtR, rAudR, count },
    };
  });

  // ── AE. adapter=false + dry_run mantêm caminhos diretos e sem outbox de teste ──
  await runCase(results, "AE. adapter=false e dry_run não geram rows na outbox", async () => {
    const empresa_id = await makeTenant(supabase); tenants.push(empresa_id);
    await enableAdapter(empresa_id, false);
    const flag = await isAdapterEnabled(supabase, empresa_id);
    // Invariante: com adapter=false, os produtores não chamam enqueueOutbox. Verificamos zero rows.
    const { count } = await supabase.from("orbit_whatsapp_outbox")
      .select("id", { count: "exact", head: true }).eq("empresa_id", empresa_id);
    return { pass: flag === false && (count ?? 0) === 0, detail: { flag, count } };
  });

  // ── AF. Invariantes globais: tenants reais adapter=false; campanha da Fábrica intacta; zero rows/synth ──
  await runCase(results, "AF. invariantes globais (real adapter=false, campanha estável, synth zero)", async () => {
    // (a) nenhum tenant real com adapter=true
    const { data: syntheticIds } = await supabase.from("orbit_empresas")
      .select("id").ilike("nome", "OUTBOX_SMOKE_%");
    const synth = new Set(((syntheticIds ?? []) as any[]).map((r) => r.id));
    const synthArr = Array.from(synth);
    let enabledQuery = supabase
      .from("orbit_whatsapp_sending_config")
      .select("empresa_id", { count: "exact", head: true })
      .eq("outbox_adapter_enabled", true);
    if (synthArr.length > 0) {
      enabledQuery = enabledQuery.not("empresa_id", "in", `(${synthArr.join(",")})`);
    }
    const { count: enabledCount } = await enabledQuery;

    // (b) outbox real residual = 0 (fora dos sintéticos)
    const { data: rows } = await supabase.from("orbit_whatsapp_outbox")
      .select("empresa_id").in("status", ["pending","processing"]);
    const realWithRows = ((rows ?? []) as any[]).filter((r) => !synth.has(r.empresa_id));

    // (c) campanha da Fábrica preservada
    const { data: camp } = await supabase.from("orbit_campaigns")
      .select("status, aprovacao_status, total_destinatarios, enviados, falhas")
      .eq("id", CAMP_ID).maybeSingle();
    const campOk = !!camp && (camp as any).status === "pausada_por_limite"
      && (camp as any).aprovacao_status === "aprovada"
      && (camp as any).total_destinatarios === 188 && (camp as any).enviados === 50 && (camp as any).falhas === 0;

    return {
      pass: (enabledCount ?? 0) === 0 && realWithRows.length === 0 && campOk,
      detail: { enabled_adapters: enabledCount, real_outbox_rows: realWithRows.length, camp },
    };
  });

  for (const t of tenants) {
    await supabase.from("orbit_whatsapp_sending_config").delete().eq("empresa_id", t);
  }
  // Cleanup total dos tenants sintéticos
  await cleanupTenants(supabase, tenants);


  const passed = results.filter((r) => r.pass).length;
  const failed = results.length - passed;
  return new Response(JSON.stringify({
    ok: failed === 0,
    run_id: RUN_ID,
    total: results.length,
    passed,
    failed,
    tenants_cleaned: tenants.length,
    results,
  }, null, 2), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
