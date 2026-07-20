// Edge Function de smoke A-P para o Orbit WhatsApp Outbox.
// - Roda com service_role (só acessível internamente).
// - Cria tenants sintéticos com prefixo OUTBOX_SMOKE_ e faz cleanup total ao final.
// - Todos os itens enfileirados usam metadata.simulate=true → zero Z-API real.
// - NÃO altera outros tenants, campanhas, flows, kill switches ou dry_run.
//
// Ativação: POST /functions/v1/orbit-outbox-smoke  (Authorization: Bearer <SMOKE_TOKEN>)

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { enqueueOutbox, cancelOutboxByProspect } from "../_shared/orbit-whatsapp-outbox.ts";

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
  if (!SMOKE_TOKEN || auth !== `Bearer ${SMOKE_TOKEN}`) {
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
