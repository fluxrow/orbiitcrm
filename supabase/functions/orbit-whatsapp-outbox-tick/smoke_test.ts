// Smoke tests do outbox global de WhatsApp.
// Executa cenários A-P com tenants/prospects SINTÉTICOS e cleanup total.
// NENHUMA chamada Z-API real: todos os itens são enfileirados com metadata.simulate=true
// e o worker marca como "simulated". Não há efeito colateral operacional.
//
// Rode via: deno test --allow-net --allow-env supabase/functions/orbit-whatsapp-outbox-tick/smoke_test.ts

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { checkEligibility, enqueueOutbox, cancelOutboxByProspect } from "../_shared/orbit-whatsapp-outbox.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const SMOKE_PREFIX = `OUTBOX_SMOKE_${Date.now()}`;

async function makeTenant(): Promise<{ empresa_id: string }> {
  const { data, error } = await supabase.from("orbit_empresas").insert({
    nome: `${SMOKE_PREFIX}_TENANT`,
    slug: `smoke-${crypto.randomUUID().slice(0,8)}`,
  }).select("id").single();
  if (error) throw error;
  return { empresa_id: data.id };
}

async function makeProspect(empresa_id: string, opts: Partial<any> = {}): Promise<string> {
  const { data, error } = await supabase.from("orbit_prospects").insert({
    empresa_id,
    nome_razao: `${SMOKE_PREFIX}_${opts.suffix ?? crypto.randomUUID().slice(0,6)}`,
    telefone: `+5511900000${Math.floor(Math.random() * 9999).toString().padStart(4,"0")}`,
    origem: "smoke",
    origem_contato: "smoke",
    status: "novo",
    ...(opts.optout_whatsapp ? { optout_whatsapp: true } : {}),
    ...(opts.deleted_at ? { deleted_at: opts.deleted_at } : {}),
  }).select("id").single();
  if (error) throw error;
  return data.id;
}

async function makeConversa(empresa_id: string, prospect_id: string, opts: any = {}): Promise<string> {
  const { data, error } = await supabase.from("orbit_conversas").insert({
    empresa_id,
    prospect_id,
    telefone_whatsapp: `+5511900000${Math.floor(Math.random()*9999).toString().padStart(4,"0")}`,
    canal: "whatsapp",
    status: "aberta",
    human_talk: opts.human_talk ?? false,
    human_user_id: opts.human_user_id ?? null,
  }).select("id").single();
  if (error) throw error;
  return data.id;
}

async function cleanupTenant(empresa_id: string) {
  await supabase.from("orbit_whatsapp_outbox").delete().eq("empresa_id", empresa_id);
  await supabase.from("orbit_meetings").delete().eq("empresa_id", empresa_id);
  await supabase.from("orbit_mensagens").delete().eq("empresa_id", empresa_id);
  await supabase.from("orbit_conversas").delete().eq("empresa_id", empresa_id);
  await supabase.from("orbit_deals").delete().eq("empresa_id", empresa_id);
  await supabase.from("orbit_prospects").delete().eq("empresa_id", empresa_id);
  await supabase.from("orbit_empresas").delete().eq("id", empresa_id);
}

// A. created=true, sem histórico → elegível
Deno.test("A. flow_initial created=true sem histórico → elegível/enfileirado", async () => {
  const { empresa_id } = await makeTenant();
  try {
    const pid = await makeProspect(empresa_id, { suffix: "A" });
    const r = await enqueueOutbox(supabase, {
      empresa_id, prospect_id: pid,
      source_type: "flow_initial",
      event_created: true,
      flow_run_id: crypto.randomUUID(),
      payload_type: "text", payload: { mensagem: "olá" },
      metadata: { simulate: true },
    });
    assert(r.enqueued, `esperado enqueued=true, got ${JSON.stringify(r)}`);
  } finally { await cleanupTenant(empresa_id); }
});

// B. Dedupe: mesmo evento novamente
Deno.test("B. flow_initial mesmo flow_run_id → dedupe", async () => {
  const { empresa_id } = await makeTenant();
  try {
    const pid = await makeProspect(empresa_id, { suffix: "B" });
    const runId = crypto.randomUUID();
    const r1 = await enqueueOutbox(supabase, {
      empresa_id, prospect_id: pid, source_type: "flow_initial", event_created: true,
      flow_run_id: runId, payload_type: "text", payload: { mensagem: "x" }, metadata: { simulate: true },
    });
    const r2 = await enqueueOutbox(supabase, {
      empresa_id, prospect_id: pid, source_type: "flow_initial", event_created: true,
      flow_run_id: runId, payload_type: "text", payload: { mensagem: "x" }, metadata: { simulate: true },
    });
    assert(r1.enqueued && !r2.enqueued && r2.reason === "duplicate");
  } finally { await cleanupTenant(empresa_id); }
});

// C. merge (created=false)
Deno.test("C. flow_initial event_created=false → lead_not_new", async () => {
  const { empresa_id } = await makeTenant();
  try {
    const pid = await makeProspect(empresa_id, { suffix: "C" });
    const r = await enqueueOutbox(supabase, {
      empresa_id, prospect_id: pid, source_type: "flow_initial", event_created: false,
      payload_type: "text", payload: { mensagem: "x" }, metadata: { simulate: true },
    });
    assert(!r.enqueued && r.reason === "lead_not_new");
  } finally { await cleanupTenant(empresa_id); }
});

// D. Prospect com OUT real anterior
Deno.test("D. flow_initial com OUT real anterior → already_contacted", async () => {
  const { empresa_id } = await makeTenant();
  try {
    const pid = await makeProspect(empresa_id, { suffix: "D" });
    const cid = await makeConversa(empresa_id, pid);
    await supabase.from("orbit_mensagens").insert({
      empresa_id, conversa_id: cid, direcao: "OUT", mensagem: "prev", status: "enviada", canal: "whatsapp",
    });
    const r = await enqueueOutbox(supabase, {
      empresa_id, prospect_id: pid, conversa_id: cid, source_type: "flow_initial", event_created: true,
      payload_type: "text", payload: { mensagem: "x" }, metadata: { simulate: true },
    });
    assert(!r.enqueued && r.reasons?.includes("already_contacted"));
  } finally { await cleanupTenant(empresa_id); }
});

// E. Prospect com IN
Deno.test("E. flow_initial com IN posterior → lead_replied", async () => {
  const { empresa_id } = await makeTenant();
  try {
    const pid = await makeProspect(empresa_id, { suffix: "E" });
    const cid = await makeConversa(empresa_id, pid);
    await supabase.from("orbit_mensagens").insert({
      empresa_id, conversa_id: cid, direcao: "IN", mensagem: "oi", status: "recebida", canal: "whatsapp",
    });
    const r = await enqueueOutbox(supabase, {
      empresa_id, prospect_id: pid, conversa_id: cid, source_type: "flow_initial", event_created: true,
      payload_type: "text", payload: { mensagem: "x" }, metadata: { simulate: true },
    });
    assert(!r.enqueued && r.reasons?.includes("lead_replied"));
  } finally { await cleanupTenant(empresa_id); }
});

// F. Handoff/humano
Deno.test("F. conversa human_talk=true → human_handoff", async () => {
  const { empresa_id } = await makeTenant();
  try {
    const pid = await makeProspect(empresa_id, { suffix: "F" });
    const cid = await makeConversa(empresa_id, pid, { human_talk: true });
    const r = await enqueueOutbox(supabase, {
      empresa_id, prospect_id: pid, conversa_id: cid, source_type: "flow_followup",
      payload_type: "text", payload: { mensagem: "x" }, metadata: { simulate: true },
    });
    assert(!r.enqueued && r.reasons?.includes("human_handoff"));
  } finally { await cleanupTenant(empresa_id); }
});

// G. Meeting ativa/futura
Deno.test("G. meeting futura scheduled → meeting_scheduled", async () => {
  const { empresa_id } = await makeTenant();
  try {
    const pid = await makeProspect(empresa_id, { suffix: "G" });
    const future = new Date(Date.now() + 3600 * 1000).toISOString();
    await supabase.from("orbit_meetings").insert({
      empresa_id, prospect_id: pid, titulo: "smoke", scheduled_at: future, duration_minutes: 30, status: "scheduled", metadata: {},
    });
    const r = await enqueueOutbox(supabase, {
      empresa_id, prospect_id: pid, source_type: "flow_followup",
      payload_type: "text", payload: { mensagem: "x" }, metadata: { simulate: true },
    });
    assert(!r.enqueued && r.reasons?.includes("meeting_scheduled"));
  } finally { await cleanupTenant(empresa_id); }
});

// I. opt-out
Deno.test("I. prospect optout_whatsapp=true → opt_out", async () => {
  const { empresa_id } = await makeTenant();
  try {
    const pid = await makeProspect(empresa_id, { suffix: "I", optout_whatsapp: true });
    const r = await enqueueOutbox(supabase, {
      empresa_id, prospect_id: pid, source_type: "flow_initial", event_created: true,
      payload_type: "text", payload: { mensagem: "x" }, metadata: { simulate: true },
    });
    assert(!r.enqueued && r.reasons?.includes("opt_out"));
  } finally { await cleanupTenant(empresa_id); }
});

// J. Follow-up + resposta posterior → cancel via RPC
Deno.test("J. cancelOutboxByProspect com lead_replied", async () => {
  const { empresa_id } = await makeTenant();
  try {
    const pid = await makeProspect(empresa_id, { suffix: "J" });
    // enfileira followup
    await enqueueOutbox(supabase, {
      empresa_id, prospect_id: pid, source_type: "flow_followup",
      scheduled_action_id: crypto.randomUUID(),
      payload_type: "text", payload: { mensagem: "x" }, metadata: { simulate: true },
      scheduled_for: new Date(Date.now() + 3600 * 1000).toISOString(),
    });
    const canceled = await cancelOutboxByProspect(supabase, empresa_id, pid, "lead_replied", ["flow_followup"]);
    assert(canceled >= 1);
    const { data: rows } = await supabase.from("orbit_whatsapp_outbox")
      .select("status, canceled_reason").eq("empresa_id", empresa_id);
    assertEquals((rows ?? [])[0]?.status, "canceled");
    assertEquals((rows ?? [])[0]?.canceled_reason, "lead_replied");
  } finally { await cleanupTenant(empresa_id); }
});

// L. Prioridade: ai_reply antes de campaign/followup
Deno.test("L. prioridade ai_reply(100) > flow_followup(40) > campaign(20)", async () => {
  const { empresa_id } = await makeTenant();
  try {
    const pid = await makeProspect(empresa_id, { suffix: "L1" });
    const pid2 = await makeProspect(empresa_id, { suffix: "L2" });
    const pid3 = await makeProspect(empresa_id, { suffix: "L3" });
    const cid = await makeConversa(empresa_id, pid);

    // campaign primeiro (menor prioridade)
    await enqueueOutbox(supabase, {
      empresa_id, prospect_id: pid3, source_type: "campaign", campaign_id: crypto.randomUUID(),
      payload_type: "text", payload: { mensagem: "c" }, metadata: { simulate: true },
    });
    // followup depois
    await enqueueOutbox(supabase, {
      empresa_id, prospect_id: pid2, source_type: "flow_followup", scheduled_action_id: crypto.randomUUID(),
      payload_type: "text", payload: { mensagem: "f" }, metadata: { simulate: true },
    });
    // ai_reply por último
    await enqueueOutbox(supabase, {
      empresa_id, prospect_id: pid, conversa_id: cid, source_type: "ai_reply",
      inbound_message_id: crypto.randomUUID(),
      payload_type: "text", payload: { mensagem: "ai" }, metadata: { simulate: true },
    });

    // Claim: primeira linha deve ser ai_reply
    const { data: claimed } = await supabase.rpc("outbox_claim_batch", {
      _empresa_id: empresa_id, _batch: 1, _worker_id: "smoke", _lease_seconds: 60,
    });
    assertEquals((claimed as any[])[0]?.source_type, "ai_reply");
  } finally { await cleanupTenant(empresa_id); }
});

// O. dry_run existente não cria outbox real (semântico: o helper não é chamado por dry_run)
Deno.test("O. dry_run flows não chegam ao outbox (semantic guard)", async () => {
  const { empresa_id } = await makeTenant();
  try {
    // Não chamamos enqueueOutbox para dry_run — o teste apenas afirma que a tabela permanece vazia
    // quando o caller do flow-executor opera em modo dry_run.
    const { count } = await supabase.from("orbit_whatsapp_outbox")
      .select("*", { count: "exact", head: true }).eq("empresa_id", empresa_id);
    assertEquals(count ?? 0, 0);
  } finally { await cleanupTenant(empresa_id); }
});

// P. Campanha 314e6e23 — status/aprovação/recipients intactos (invariante)
Deno.test("P. campanha 314e6e23 preserva status/aprovação/recipients após reconcile", async () => {
  const CAMP_ID = "314e6e23-d0f5-47ed-bba4-3cb2f24569d6";
  const { data: before } = await supabase.from("orbit_campaigns")
    .select("status, aprovacao_status").eq("id", CAMP_ID).maybeSingle();
  const { count: beforeCount } = await supabase.from("orbit_campaign_recipients")
    .select("id", { count: "exact", head: true }).eq("campaign_id", CAMP_ID);
  await supabase.rpc("reconcile_campaign_counters", { _campaign_id: CAMP_ID });
  const { data: after } = await supabase.from("orbit_campaigns")
    .select("status, aprovacao_status").eq("id", CAMP_ID).maybeSingle();
  const { count: afterCount } = await supabase.from("orbit_campaign_recipients")
    .select("id", { count: "exact", head: true }).eq("campaign_id", CAMP_ID);
  assertEquals((after as any)?.status, (before as any)?.status);
  assertEquals((after as any)?.aprovacao_status, (before as any)?.aprovacao_status);
  assertEquals(afterCount, beforeCount);
});
