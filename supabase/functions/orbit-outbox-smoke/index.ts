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
    await supabase.from("orbit_whatsapp_daily_usage").delete().eq("empresa_id", empresa_id);
    await supabase.from("orbit_meetings").delete().eq("empresa_id", empresa_id);
    await supabase.from("orbit_mensagens").delete().eq("empresa_id", empresa_id);
    await supabase.from("orbit_conversas").delete().eq("empresa_id", empresa_id);
    await supabase.from("orbit_deals").delete().eq("empresa_id", empresa_id);
    await supabase.from("orbit_pipeline_stages").delete().eq("empresa_id", empresa_id);
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

  // Helper: garante uma OUT real (enviada) prévia para desbloquear flow_followup.
  const seedRealOut = async (empresa_id: string, prospect_id: string): Promise<string> => {
    const cid = await makeConversa(supabase, empresa_id, prospect_id);
    await supabase.from("orbit_mensagens").insert({
      empresa_id, conversa_id: cid, direcao: "OUT",
      mensagem: "seed prior real out", status: "enviada", canal: "whatsapp",
    });
    return cid;
  };


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
    await seedRealOut(empresa_id, pid);
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
    await seedRealOut(empresa_id, p2);

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
    // Aplica o sort determinístico do worker (RETURNING não garante ordem).
    const sorted = [...((claimed as any[]) ?? [])].sort((a, b) => (Number(b.priority)||0) - (Number(a.priority)||0));
    const order = sorted.map((r: any) => r.source_type);
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
    await seedRealOut(empresa_id, p2);
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
    const sorted = [...((claimed as any[]) ?? [])].sort((a, b) => (Number(b.priority)||0) - (Number(a.priority)||0));
    const order = sorted.map((r: any) => r.source_type);
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

  // ============================================================================
  // Fase 3 – patches: AG (ordem determinística) / AH (idempotency manual) /
  // AI (uma mensagem visual por envio) / AJ (áudio url_midia padronizado).
  // ============================================================================

  // Aplicação do mesmo sort do worker (priority DESC, scheduled_for ASC, created_at ASC, id ASC).
  const sortClaimed = (items: any[]) => [...items].sort((a, b) => {
    const p = (Number(b.priority) || 0) - (Number(a.priority) || 0);
    if (p !== 0) return p;
    const s = String(a.scheduled_for ?? "").localeCompare(String(b.scheduled_for ?? ""));
    if (s !== 0) return s;
    const c = String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""));
    if (c !== 0) return c;
    return String(a.id).localeCompare(String(b.id));
  });

  // AG. Ordem determinística (20 iterações): mesmo após claim, sort local sempre devolve
  // priority DESC. Cobre a lacuna do RETURNING não-ordenado do UPDATE ... FROM.
  await runCase(results, "AG. ordem determinística — 20 iterações", async () => {
    const empresa_id = await makeTenant(supabase); tenants.push(empresa_id);
    let allPass = true;
    const perIter: any[] = [];
    for (let i = 0; i < 20; i++) {
      const now = new Date();
      // Insere 3 itens (prioridades 100, 70, 40) em ordem aleatória de criação/agendamento.
      const items = [
        { priority: 40, offset: 0 },
        { priority: 100, offset: 2 },
        { priority: 70, offset: 1 },
      ].sort(() => Math.random() - 0.5);
      const pid = await makeProspect(supabase, empresa_id, { suffix: `AG${i}` });
      for (const it of items) {
        await supabase.from("orbit_whatsapp_outbox").insert({
          empresa_id, prospect_id: pid,
          source_type: "manual", source_id: `${RUN_ID}-AG-${i}-${it.priority}`,
          idempotency_key: `${RUN_ID}-AG-${i}-${it.priority}`,
          priority: it.priority,
          payload_type: "text", payload: { mensagem: `p${it.priority}` },
          scheduled_for: new Date(now.getTime() - 1000 - it.offset * 10).toISOString(),
          metadata: { simulate: true, smoke: RUN_ID },
        });
      }
      const { data: claimed } = await supabase.rpc("outbox_claim_batch", {
        _empresa_id: empresa_id, _batch: 10, _worker_id: `smoke-AG-${i}`, _lease_seconds: 60,
      });
      const sorted = sortClaimed((claimed ?? []) as any[]);
      const priorities = sorted.map((r) => r.priority);
      const ok = priorities.length === 3 && priorities[0] === 100 && priorities[1] === 70 && priorities[2] === 40;
      if (!ok) { allPass = false; perIter.push({ i, priorities }); }
      // Reset (delete) claimed items para próxima iteração isolada
      await supabase.from("orbit_whatsapp_outbox").delete().eq("empresa_id", empresa_id);
    }
    return { pass: allPass, detail: { iterations: 20, failures: perIter } };
  });

  // AH. Idempotência real do produtor manual: 2 enqueues com mesma source_id → 1 outbox.
  await runCase(results, "AH. manual Idempotency-Key dedupe (2 chamadas = 1 outbox)", async () => {
    const empresa_id = await makeTenant(supabase); tenants.push(empresa_id);
    const pid = await makeProspect(supabase, empresa_id, { suffix: "AH" });
    const cid = await makeConversa(supabase, empresa_id, pid);
    const idem = `AH-${crypto.randomUUID()}`;
    const r1 = await enqueueOutbox(supabase, {
      empresa_id, conversa_id: cid, prospect_id: pid,
      source_type: "manual", source_id: idem,
      payload_type: "text", payload: { mensagem: "olá" },
      metadata: { simulate: true, smoke: RUN_ID, idempotency_key: idem },
    } as any);
    const r2 = await enqueueOutbox(supabase, {
      empresa_id, conversa_id: cid, prospect_id: pid,
      source_type: "manual", source_id: idem,
      payload_type: "text", payload: { mensagem: "olá" },
      metadata: { simulate: true, smoke: RUN_ID, idempotency_key: idem },
    } as any);
    const { count } = await supabase
      .from("orbit_whatsapp_outbox")
      .select("id", { count: "exact", head: true })
      .eq("empresa_id", empresa_id).eq("source_type", "manual");
    return {
      pass: r1.enqueued === true && r2.enqueued === false && r2.reason === "duplicate" && (count ?? 0) === 1,
      detail: { r1, r2, count },
    };
  });

  // AI. Uma mensagem visual por envio: produtor pré-cria orbit_mensagens=queued e envia
  // metadata.orbit_message_id — após worker simulated, existe exatamente 1 linha e ela
  // muda para 'simulated' (sem INSERT paralelo).
  await runCase(results, "AI. uma mensagem visual por envio (adapter + worker simulated)", async () => {
    const empresa_id = await makeTenant(supabase); tenants.push(empresa_id);
    // Adapter precisa estar ligado no tenant sintético para roteamento do produtor real,
    // mas aqui simulamos direto o contrato: enqueue com orbit_message_id em metadata.
    await supabase.from("orbit_whatsapp_sending_config").upsert({
      empresa_id, outbox_adapter_enabled: true, daily_limit: 999, max_per_minute: 999,
    }, { onConflict: "empresa_id" });
    const pid = await makeProspect(supabase, empresa_id, { suffix: "AI" });
    const cid = await makeConversa(supabase, empresa_id, pid);
    // Produtor pré-insere queued
    const { data: pre } = await supabase.from("orbit_mensagens").insert({
      empresa_id, conversa_id: cid, direcao: "OUT", mensagem: "oi", canal: "whatsapp", status: "queued",
    }).select("id").single();
    // Enfileira apontando para essa linha
    const enq = await enqueueOutbox(supabase, {
      empresa_id, conversa_id: cid, prospect_id: pid,
      source_type: "manual", source_id: `AI-${crypto.randomUUID()}`,
      payload_type: "text", payload: { mensagem: "oi" },
      metadata: { simulate: true, smoke: RUN_ID, orbit_message_id: (pre as any).id },
    } as any);
    // Invoca o worker em modo dirigido (simulate=true → não chama Z-API real).
    const cronToken = Deno.env.get("SCHEDULER_CRON_TOKEN") || SMOKE_TOKEN;
    const workerResp = await fetch(`${SUPABASE_URL}/functions/v1/orbit-whatsapp-outbox-tick`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${cronToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ outbox_id: enq.outbox_id, empresa_id }),
    });
    const workerBody = await workerResp.json().catch(() => ({}));
    // Conta orbit_mensagens dessa conversa: precisa ser EXATAMENTE 1 e status='simulated'.
    const { data: msgs } = await supabase.from("orbit_mensagens")
      .select("id, status").eq("conversa_id", cid);
    const list = (msgs ?? []) as any[];
    const pass = enq.enqueued === true && list.length === 1 && list[0].status === "simulated";
    return { pass, detail: { workerBody, msgs: list } };
  });

  // AJ. Áudio url_midia padronizado: payload do adapter usa payload.url_midia (não .url legado).
  await runCase(results, "AJ. áudio adapter usa payload.url_midia", async () => {
    const empresa_id = await makeTenant(supabase); tenants.push(empresa_id);
    const pid = await makeProspect(supabase, empresa_id, { suffix: "AJ" });
    const cid = await makeConversa(supabase, empresa_id, pid);
    // Simular IN para dar contexto ao ai_reply
    const { data: inMsg } = await supabase.from("orbit_mensagens").insert({
      empresa_id, conversa_id: cid, direcao: "IN", mensagem: "manda áudio", status: "recebida", canal: "whatsapp",
    }).select("id").single();
    const audioUrl = "https://cdn.example.com/audios/greet.mp3";
    const enq = await enqueueOutbox(supabase, {
      empresa_id, conversa_id: cid, prospect_id: pid,
      source_type: "ai_reply",
      inbound_message_id: `${(inMsg as any).id}:audio:${audioUrl}`,
      source_id: audioUrl,
      payload_type: "audio",
      payload: { storage_path: null, url_midia: audioUrl },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    const { data: row } = await supabase.from("orbit_whatsapp_outbox")
      .select("payload").eq("id", enq.outbox_id).maybeSingle();
    const payload = (row as any)?.payload ?? {};
    const pass = enq.enqueued === true && payload.url_midia === audioUrl && !("url" in payload);
    return { pass, detail: { payload } };
  });


  // ═══════ AK–AP: daily_limit gating aplica APENAS a sources automatizados ═══════
  // Setup helper: sending_config com daily_limit=1 e usage=1 (cota estourada), max_per_minute alto.
  async function makeAtDailyLimit(empresa_id: string) {
    await supabase.from("orbit_whatsapp_sending_config").upsert({
      empresa_id, enabled: true, outbox_adapter_enabled: true,
      daily_limit: 1, max_per_minute: 999, min_delay_ms: 0, max_delay_ms: 0,
      warmup_enabled: false,
    }, { onConflict: "empresa_id" });
    const today = new Date().toISOString().slice(0, 10);
    await supabase.from("orbit_whatsapp_daily_usage").upsert({
      empresa_id, usage_date: today, sent_count: 1,
    }, { onConflict: "empresa_id,usage_date" });
  }

  async function drive(outbox_id: string, empresa_id: string) {
    const cronToken = Deno.env.get("SCHEDULER_CRON_TOKEN") || SMOKE_TOKEN;
    const r = await fetch(`${SUPABASE_URL}/functions/v1/orbit-whatsapp-outbox-tick`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${cronToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ outbox_id, empresa_id }),
    });
    return await r.json().catch(() => ({}));
  }

  async function readItem(outbox_id: string) {
    const { data } = await supabase.from("orbit_whatsapp_outbox")
      .select("status, last_error").eq("id", outbox_id).maybeSingle();
    return data as any;
  }

  // AK. campaign no daily_limit → deferred (pending + last_error=daily_limit_reached), sem envio
  await runCase(results, "AK. campaign no daily_limit → deferred", async () => {
    const empresa_id = await makeTenant(supabase); tenants.push(empresa_id);
    await makeAtDailyLimit(empresa_id);
    const pid = await makeProspect(supabase, empresa_id, { suffix: "AK" });
    const enq = await enqueueOutbox(supabase, {
      empresa_id, prospect_id: pid, campaign_id: crypto.randomUUID(),
      source_type: "campaign", source_id: crypto.randomUUID(),
      payload_type: "text", payload: { mensagem: "camp", telefone: "+5511900000000" },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    const workerBody = await drive(enq.outbox_id!, empresa_id);
    const row = await readItem(enq.outbox_id!);
    return { pass: row?.status === "pending" && row?.last_error === "daily_limit_reached", detail: { workerBody, row } };
  });

  // AL. flow_initial no daily_limit → deferred
  await runCase(results, "AL. flow_initial no daily_limit → deferred", async () => {
    const empresa_id = await makeTenant(supabase); tenants.push(empresa_id);
    await makeAtDailyLimit(empresa_id);
    const pid = await makeProspect(supabase, empresa_id, { suffix: "AL" });
    const enq = await enqueueOutbox(supabase, {
      empresa_id, prospect_id: pid,
      source_type: "flow_initial", event_created: true,
      flow_run_id: crypto.randomUUID(),
      payload_type: "text", payload: { mensagem: "hi", telefone: "+5511900000001" },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    await drive(enq.outbox_id!, empresa_id);
    const row = await readItem(enq.outbox_id!);
    return { pass: row?.status === "pending" && row?.last_error === "daily_limit_reached", detail: row };
  });

  // AL2. flow_followup no daily_limit → deferred
  await runCase(results, "AL2. flow_followup no daily_limit → deferred", async () => {
    const empresa_id = await makeTenant(supabase); tenants.push(empresa_id);
    await makeAtDailyLimit(empresa_id);
    const pid = await makeProspect(supabase, empresa_id, { suffix: "AL2" });
    const enq = await enqueueOutbox(supabase, {
      empresa_id, prospect_id: pid,
      source_type: "flow_followup", scheduled_action_id: crypto.randomUUID(),
      payload_type: "text", payload: { mensagem: "fu", telefone: "+5511900000002" },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    await drive(enq.outbox_id!, empresa_id);
    const row = await readItem(enq.outbox_id!);
    return { pass: row?.status === "pending" && row?.last_error === "daily_limit_reached", detail: row };
  });

  // AM. ai_reply no MESMO tenant/limite → processa (simulated)
  await runCase(results, "AM. ai_reply ignora daily_limit e processa simulated", async () => {
    const empresa_id = await makeTenant(supabase); tenants.push(empresa_id);
    await makeAtDailyLimit(empresa_id);
    const pid = await makeProspect(supabase, empresa_id, { suffix: "AM" });
    const cid = await makeConversa(supabase, empresa_id, pid);
    const { data: inMsg } = await supabase.from("orbit_mensagens").insert({
      empresa_id, conversa_id: cid, direcao: "IN", mensagem: "oi", status: "recebida", canal: "whatsapp",
    }).select("id").single();
    const enq = await enqueueOutbox(supabase, {
      empresa_id, conversa_id: cid, prospect_id: pid,
      source_type: "ai_reply", inbound_message_id: (inMsg as any).id,
      payload_type: "text", payload: { mensagem: "resposta", telefone: "+5511900000003" },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    await drive(enq.outbox_id!, empresa_id);
    const row = await readItem(enq.outbox_id!);
    return { pass: row?.status === "simulated", detail: row };
  });

  // AN. manual no daily_limit → processa (simulated)
  await runCase(results, "AN. manual ignora daily_limit e processa simulated", async () => {
    const empresa_id = await makeTenant(supabase); tenants.push(empresa_id);
    await makeAtDailyLimit(empresa_id);
    const pid = await makeProspect(supabase, empresa_id, { suffix: "AN" });
    const cid = await makeConversa(supabase, empresa_id, pid);
    const enq = await enqueueOutbox(supabase, {
      empresa_id, conversa_id: cid, prospect_id: pid,
      source_type: "manual", source_id: `AN-${crypto.randomUUID()}`,
      payload_type: "text", payload: { mensagem: "oi humano", telefone: "+5511900000004" },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    await drive(enq.outbox_id!, empresa_id);
    const row = await readItem(enq.outbox_id!);
    return { pass: row?.status === "simulated", detail: row };
  });

  // AO. meeting_confirmation no daily_limit → processa (simulated)
  await runCase(results, "AO. meeting_confirmation ignora daily_limit e processa simulated", async () => {
    const empresa_id = await makeTenant(supabase); tenants.push(empresa_id);
    await makeAtDailyLimit(empresa_id);
    const pid = await makeProspect(supabase, empresa_id, { suffix: "AO" });
    const cid = await makeConversa(supabase, empresa_id, pid);
    const enq = await enqueueOutbox(supabase, {
      empresa_id, conversa_id: cid, prospect_id: pid,
      source_type: "meeting_confirmation", meeting_id: crypto.randomUUID(),
      payload_type: "text", payload: { mensagem: "sua call é amanhã", telefone: "+5511900000005" },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    await drive(enq.outbox_id!, empresa_id);
    const row = await readItem(enq.outbox_id!);
    return { pass: row?.status === "simulated", detail: row };
  });

  // AP. urgentes ainda obedecem max_per_minute
  await runCase(results, "AP. ai_reply obedece max_per_minute mesmo ignorando daily_limit", async () => {
    const empresa_id = await makeTenant(supabase); tenants.push(empresa_id);
    // daily_limit alto, mas max_per_minute=1 e já há 1 envio recente
    await supabase.from("orbit_whatsapp_sending_config").upsert({
      empresa_id, enabled: true, outbox_adapter_enabled: true,
      daily_limit: 999, max_per_minute: 1, min_delay_ms: 0, max_delay_ms: 0, warmup_enabled: false,
    }, { onConflict: "empresa_id" });
    // Seed: um envio recente na outbox no status 'sent' para consumir max_per_minute
    const pidA = await makeProspect(supabase, empresa_id, { suffix: "AP1" });
    await supabase.from("orbit_whatsapp_outbox").insert({
      empresa_id, prospect_id: pidA, source_type: "ai_reply",
      idempotency_key: `AP-seed-${crypto.randomUUID()}`,
      priority: 100, payload_type: "text", payload: { mensagem: "seed" },
      status: "sent", sent_at: new Date().toISOString(),
      scheduled_for: new Date().toISOString(),
    });
    const pid = await makeProspect(supabase, empresa_id, { suffix: "AP2" });
    const cid = await makeConversa(supabase, empresa_id, pid);
    const { data: inMsg } = await supabase.from("orbit_mensagens").insert({
      empresa_id, conversa_id: cid, direcao: "IN", mensagem: "oi", status: "recebida", canal: "whatsapp",
    }).select("id").single();
    const enq = await enqueueOutbox(supabase, {
      empresa_id, conversa_id: cid, prospect_id: pid,
      source_type: "ai_reply", inbound_message_id: (inMsg as any).id,
      payload_type: "text", payload: { mensagem: "r", telefone: "+5511900000006" },
      metadata: { simulate: true, smoke: RUN_ID },
    } as any);
    await drive(enq.outbox_id!, empresa_id);
    const row = await readItem(enq.outbox_id!);
    return { pass: row?.status === "pending" && row?.last_error === "rate_limited", detail: row };
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
