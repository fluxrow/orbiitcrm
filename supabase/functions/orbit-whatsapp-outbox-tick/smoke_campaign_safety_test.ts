// Smoke sintético: hardening da safety de campanha no worker.
// Cobre a lacuna do patch: worker re-aplica campaign_safety no instante do consumo,
// marca simulated corretamente e cancela quando lead responde/é contatado APÓS enqueue.
// Nunca chama Z-API. Todos tenants/prospects são sintéticos com cleanup total.
//
// Rode: deno test --allow-net --allow-env supabase/functions/orbit-whatsapp-outbox-tick/smoke_campaign_safety_test.ts

import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { enqueueOutbox } from "../_shared/orbit-whatsapp-outbox.ts";
import { checkCampaignRecipientEligibility } from "../_shared/campaign-safety.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SMOKE = `CAMPSAFE_${Date.now()}`;

const ALL_FLAGS_TRUE = {
  skip_if_contacted: true,
  skip_if_replied: true,
  skip_if_handoff: true,
  skip_if_future_meeting: true,
  skip_if_terminal: true,
  skip_if_deleted: true,
  skip_if_optout: true,
  skip_if_synthetic: false, // manter false para não pular prospects sintéticos do próprio smoke
};

async function makeTenant() {
  const { data, error } = await supabase
    .from("orbit_empresas")
    .insert({ nome: `${SMOKE}_T`, slug: `csafe-${crypto.randomUUID().slice(0, 8)}` })
    .select("id")
    .single();
  if (error) throw error;
  // sending_config com adapter ligado (só sintético)
  await supabase.from("orbit_whatsapp_sending_config").insert({
    empresa_id: data.id,
    enabled: true,
    daily_limit: 1000,
    max_per_minute: 60,
    outbox_adapter_enabled: true,
  });
  return data.id as string;
}

async function makeProspect(empresa_id: string, patch: Partial<any> = {}) {
  const { data, error } = await supabase
    .from("orbit_prospects")
    .insert({
      empresa_id,
      nome_razao: patch.nome_razao ?? `${SMOKE}_P_${crypto.randomUUID().slice(0, 6)}`,
      telefone: `+5511900${Math.floor(Math.random() * 9_000_000 + 1_000_000)}`,
      origem: "smoke",
      origem_contato: "smoke",
      status: "novo",
      ...patch,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function makeCampaign(empresa_id: string, flags = ALL_FLAGS_TRUE) {
  const { data, error } = await supabase
    .from("orbit_campaigns")
    .insert({
      empresa_id,
      nome: `${SMOKE}_camp`,
      canal: "whatsapp",
      status: "rascunho",
      aprovacao_status: "aprovada",
      filtros_json: { campaign_safety: flags },
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function makeRecipient(empresa_id: string, campaign_id: string, prospect_id: string) {
  const { data, error } = await supabase
    .from("orbit_campaign_recipients")
    .insert({ empresa_id, campaign_id, prospect_id, status: "pendente" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function makeConversa(empresa_id: string, prospect_id: string, patch: Partial<any> = {}) {
  const { data, error } = await supabase
    .from("orbit_conversas")
    .insert({
      empresa_id,
      prospect_id,
      canal: "whatsapp",
      telefone_whatsapp: "+5511911112222",
      status: "aberta",
      ...patch,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

async function enqueueCampaign(
  empresa_id: string,
  campaign_id: string,
  prospect_id: string,
  recipient_id: string,
  simulate = true,
) {
  return await enqueueOutbox(supabase, {
    empresa_id,
    campaign_id,
    prospect_id,
    source_type: "campaign",
    source_id: recipient_id,
    payload_type: "text",
    payload: { mensagem: "smoke msg", telefone: "+5511911112222" },
    metadata: simulate ? { simulate: true } : {},
  });
}

async function claimOne(empresa_id: string): Promise<any | null> {
  const { data } = await supabase.rpc("outbox_claim_batch", {
    _empresa_id: empresa_id,
    _batch: 1,
    _worker_id: `smoke-${crypto.randomUUID().slice(0, 8)}`,
    _lease_seconds: 60,
  });
  return (data as any[])?.[0] ?? null;
}

async function callWorker(empresa_id: string, outbox_id: string): Promise<any> {
  // Chama endpoint HTTP com token do env
  const CRON = Deno.env.get("SCHEDULER_CRON_TOKEN") ?? "";
  const resp = await fetch(`${SUPABASE_URL}/functions/v1/orbit-whatsapp-outbox-tick`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${CRON}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ empresa_id, outbox_id }),
  });
  const json = await resp.json().catch(() => ({}));
  await resp.body?.cancel();
  return json;
}

async function cleanup(empresa_id: string) {
  await supabase.from("orbit_whatsapp_outbox").delete().eq("empresa_id", empresa_id);
  await supabase.from("orbit_campaign_recipients").delete().eq("empresa_id", empresa_id);
  await supabase.from("orbit_campaigns").delete().eq("empresa_id", empresa_id);
  await supabase.from("orbit_meetings").delete().eq("empresa_id", empresa_id);
  await supabase.from("orbit_mensagens").delete().eq("empresa_id", empresa_id);
  await supabase.from("orbit_conversas").delete().eq("empresa_id", empresa_id);
  await supabase.from("orbit_deals").delete().eq("empresa_id", empresa_id);
  await supabase.from("orbit_prospects").delete().eq("empresa_id", empresa_id);
  await supabase.from("orbit_whatsapp_sending_config").delete().eq("empresa_id", empresa_id);
  await supabase.from("orbit_whatsapp_daily_usage").delete().eq("empresa_id", empresa_id);
  await supabase.from("orbit_empresas").delete().eq("id", empresa_id);
}

// ── Testes com helper direto (não dependem de deploy do worker) ──

Deno.test("CS1. flags true: prospect limpo → elegível no helper", async () => {
  const eid = await makeTenant();
  try {
    const pid = await makeProspect(eid);
    const cid = await makeCampaign(eid);
    const { data: camp } = await supabase.from("orbit_campaigns").select("*").eq("id", cid).single();
    const { data: prospect } = await supabase.from("orbit_prospects").select("*").eq("id", pid).single();
    const r = await checkCampaignRecipientEligibility(supabase, { campaign: camp, empresa_id: eid, prospect });
    assert(r.eligible, `esperado eligible=true, got ${JSON.stringify(r)}`);
  } finally { await cleanup(eid); }
});

Deno.test("CS2. flags true: lead com IN posterior → lead_replied", async () => {
  const eid = await makeTenant();
  try {
    const pid = await makeProspect(eid);
    const cvid = await makeConversa(eid, pid);
    await supabase.from("orbit_mensagens").insert({
      empresa_id: eid, conversa_id: cvid, direcao: "IN", mensagem: "oi", status: "recebida", canal: "whatsapp",
    });
    const cid = await makeCampaign(eid);
    const { data: camp } = await supabase.from("orbit_campaigns").select("*").eq("id", cid).single();
    const { data: prospect } = await supabase.from("orbit_prospects").select("*").eq("id", pid).single();
    const r = await checkCampaignRecipientEligibility(supabase, { campaign: camp, empresa_id: eid, prospect });
    assertEquals(r.eligible, false);
    assertEquals(r.motivo, "lead_replied");
  } finally { await cleanup(eid); }
});

Deno.test("CS3. flags true: OUT real → already_contacted (não conta simulated/queued)", async () => {
  const eid = await makeTenant();
  try {
    const pid = await makeProspect(eid);
    const cvid = await makeConversa(eid, pid);
    // OUT em status 'queued'/'simulated' NÃO deve contar como contato real
    await supabase.from("orbit_mensagens").insert([
      { empresa_id: eid, conversa_id: cvid, direcao: "OUT", mensagem: "q", status: "queued", canal: "whatsapp" },
      { empresa_id: eid, conversa_id: cvid, direcao: "OUT", mensagem: "s", status: "simulated", canal: "whatsapp" },
    ]);
    const cid = await makeCampaign(eid);
    const { data: camp } = await supabase.from("orbit_campaigns").select("*").eq("id", cid).single();
    const { data: prospect } = await supabase.from("orbit_prospects").select("*").eq("id", pid).single();
    let r = await checkCampaignRecipientEligibility(supabase, { campaign: camp, empresa_id: eid, prospect });
    assertEquals(r.eligible, true, `queued/simulated não deve bloquear, got ${JSON.stringify(r)}`);
    // Agora insere OUT real 'enviada' → deve bloquear
    await supabase.from("orbit_mensagens").insert({
      empresa_id: eid, conversa_id: cvid, direcao: "OUT", mensagem: "prev", status: "enviada", canal: "whatsapp",
    });
    r = await checkCampaignRecipientEligibility(supabase, { campaign: camp, empresa_id: eid, prospect });
    assertEquals(r.eligible, false);
    assertEquals(r.motivo, "already_contacted");
  } finally { await cleanup(eid); }
});

Deno.test("CS4. universal fail-closed: deleted prospect → prospect_deleted mesmo com flags false", async () => {
  const eid = await makeTenant();
  try {
    const pid = await makeProspect(eid, { deleted_at: new Date().toISOString() });
    const cid = await makeCampaign(eid, {
      skip_if_contacted: false, skip_if_replied: false, skip_if_handoff: false,
      skip_if_future_meeting: false, skip_if_terminal: false, skip_if_deleted: false,
      skip_if_optout: false, skip_if_synthetic: false,
    });
    const { data: camp } = await supabase.from("orbit_campaigns").select("*").eq("id", cid).single();
    const { data: prospect } = await supabase.from("orbit_prospects").select("*").eq("id", pid).single();
    const r = await checkCampaignRecipientEligibility(supabase, { campaign: camp, empresa_id: eid, prospect });
    assertEquals(r.eligible, false);
    assertEquals(r.motivo, "prospect_deleted");
  } finally { await cleanup(eid); }
});

Deno.test("CS5. universal fail-closed: optout → opt_out sempre", async () => {
  const eid = await makeTenant();
  try {
    const pid = await makeProspect(eid, { optout_whatsapp: true });
    const cid = await makeCampaign(eid, {
      skip_if_contacted: false, skip_if_replied: false, skip_if_handoff: false,
      skip_if_future_meeting: false, skip_if_terminal: false, skip_if_deleted: false,
      skip_if_optout: false, skip_if_synthetic: false,
    });
    const { data: camp } = await supabase.from("orbit_campaigns").select("*").eq("id", cid).single();
    const { data: prospect } = await supabase.from("orbit_prospects").select("*").eq("id", pid).single();
    const r = await checkCampaignRecipientEligibility(supabase, { campaign: camp, empresa_id: eid, prospect });
    assertEquals(r.eligible, false);
    assertEquals(r.motivo, "opt_out");
  } finally { await cleanup(eid); }
});

Deno.test("CS6. cross_tenant bloqueado", async () => {
  const eid1 = await makeTenant();
  const eid2 = await makeTenant();
  try {
    const pid = await makeProspect(eid2);
    const cid = await makeCampaign(eid1);
    const { data: camp } = await supabase.from("orbit_campaigns").select("*").eq("id", cid).single();
    const { data: prospect } = await supabase.from("orbit_prospects").select("*").eq("id", pid).single();
    const r = await checkCampaignRecipientEligibility(supabase, { campaign: camp, empresa_id: eid1, prospect });
    assertEquals(r.eligible, false);
    assertEquals(r.motivo, "cross_tenant");
  } finally { await cleanup(eid1); await cleanup(eid2); }
});

Deno.test("CS7. handoff bloqueado quando flag true", async () => {
  const eid = await makeTenant();
  try {
    const pid = await makeProspect(eid);
    await makeConversa(eid, pid, { human_talk: true });
    const cid = await makeCampaign(eid);
    const { data: camp } = await supabase.from("orbit_campaigns").select("*").eq("id", cid).single();
    const { data: prospect } = await supabase.from("orbit_prospects").select("*").eq("id", pid).single();
    const r = await checkCampaignRecipientEligibility(supabase, { campaign: camp, empresa_id: eid, prospect });
    assertEquals(r.eligible, false);
    assertEquals(r.motivo, "human_handoff");
  } finally { await cleanup(eid); }
});

Deno.test("CS8. future meeting bloqueado quando flag true", async () => {
  const eid = await makeTenant();
  try {
    const pid = await makeProspect(eid);
    await supabase.from("orbit_meetings").insert({
      empresa_id: eid, prospect_id: pid, titulo: "smoke", scheduled_at: new Date(Date.now() + 3600_000).toISOString(),
      duration_minutes: 30, status: "scheduled", metadata: {},
    });
    const cid = await makeCampaign(eid);
    const { data: camp } = await supabase.from("orbit_campaigns").select("*").eq("id", cid).single();
    const { data: prospect } = await supabase.from("orbit_prospects").select("*").eq("id", pid).single();
    const r = await checkCampaignRecipientEligibility(supabase, { campaign: camp, empresa_id: eid, prospect });
    assertEquals(r.eligible, false);
    assertEquals(r.motivo, "meeting_scheduled");
  } finally { await cleanup(eid); }
});

Deno.test("CS9. reengagement: flags contacted/replied=false permitem envio mesmo com IN/OUT prévio", async () => {
  const eid = await makeTenant();
  try {
    const pid = await makeProspect(eid);
    const cvid = await makeConversa(eid, pid);
    await supabase.from("orbit_mensagens").insert([
      { empresa_id: eid, conversa_id: cvid, direcao: "OUT", mensagem: "prev", status: "enviada", canal: "whatsapp" },
      { empresa_id: eid, conversa_id: cvid, direcao: "IN", mensagem: "oi", status: "recebida", canal: "whatsapp" },
    ]);
    const cid = await makeCampaign(eid, {
      skip_if_contacted: false, skip_if_replied: false, skip_if_handoff: true,
      skip_if_future_meeting: true, skip_if_terminal: true, skip_if_deleted: true,
      skip_if_optout: true, skip_if_synthetic: false,
    });
    const { data: camp } = await supabase.from("orbit_campaigns").select("*").eq("id", cid).single();
    const { data: prospect } = await supabase.from("orbit_prospects").select("*").eq("id", pid).single();
    const r = await checkCampaignRecipientEligibility(supabase, { campaign: camp, empresa_id: eid, prospect });
    assert(r.eligible, `reengagement deve permitir, got ${JSON.stringify(r)}`);
  } finally { await cleanup(eid); }
});

Deno.test("CS10. dedupe outbox por recipient_id: segundo enqueue não cria linha nova", async () => {
  const eid = await makeTenant();
  try {
    const pid = await makeProspect(eid);
    const cid = await makeCampaign(eid);
    const rid = await makeRecipient(eid, cid, pid);
    const r1 = await enqueueCampaign(eid, cid, pid, rid);
    const r2 = await enqueueCampaign(eid, cid, pid, rid);
    assert(r1.enqueued, `esperado enqueued primeira vez, got ${JSON.stringify(r1)}`);
    assertEquals(r2.enqueued, false);
    assertEquals(r2.reason, "duplicate");
    const { count } = await supabase.from("orbit_whatsapp_outbox")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", cid);
    assertEquals(count, 1);
  } finally { await cleanup(eid); }
});

// ── Testes E2E via worker HTTP: exercitam o re-check no consumo ──

Deno.test("CS11. worker cancela outbox quando lead responde APÓS enqueue (gap fechado)", async () => {
  const eid = await makeTenant();
  try {
    const pid = await makeProspect(eid);
    const cid = await makeCampaign(eid);
    const rid = await makeRecipient(eid, cid, pid);
    const enq = await enqueueCampaign(eid, cid, pid, rid);
    assert(enq.enqueued && enq.outbox_id);

    // Cria conversa + IN DEPOIS do enqueue (janela crítica que causa o vazamento)
    const cvid = await makeConversa(eid, pid);
    await supabase.from("orbit_mensagens").insert({
      empresa_id: eid, conversa_id: cvid, direcao: "IN", mensagem: "parei aqui", status: "recebida", canal: "whatsapp",
    });

    const r = await callWorker(eid, enq.outbox_id!);
    assertEquals(r.data?.outcome, "canceled", `resp=${JSON.stringify(r)}`);
    const { data: rec } = await supabase.from("orbit_campaign_recipients")
      .select("status, ignorado_motivo").eq("id", rid).single();
    assertEquals(rec?.status, "ignorado");
    assertEquals(rec?.ignorado_motivo, "lead_replied");
    const { data: ob } = await supabase.from("orbit_whatsapp_outbox")
      .select("status, canceled_reason").eq("id", enq.outbox_id!).single();
    assertEquals(ob?.status, "canceled");
    assertEquals(ob?.canceled_reason, "lead_replied");
  } finally { await cleanup(eid); }
});

Deno.test("CS12. worker cancela quando OUT real inserido APÓS enqueue → already_contacted", async () => {
  const eid = await makeTenant();
  try {
    const pid = await makeProspect(eid);
    const cid = await makeCampaign(eid);
    const rid = await makeRecipient(eid, cid, pid);
    const enq = await enqueueCampaign(eid, cid, pid, rid);
    assert(enq.enqueued);
    const cvid = await makeConversa(eid, pid);
    await supabase.from("orbit_mensagens").insert({
      empresa_id: eid, conversa_id: cvid, direcao: "OUT", mensagem: "prev", status: "enviada", canal: "whatsapp",
    });
    const r = await callWorker(eid, enq.outbox_id!);
    assertEquals(r.data?.outcome, "canceled");
    const { data: rec } = await supabase.from("orbit_campaign_recipients")
      .select("status, ignorado_motivo").eq("id", rid).single();
    assertEquals(rec?.status, "ignorado");
    assertEquals(rec?.ignorado_motivo, "already_contacted");
  } finally { await cleanup(eid); }
});

Deno.test("CS13. simulate=true → outbox simulated, recipient simulated, orbit_mensagens simulated, conversa criada", async () => {
  const eid = await makeTenant();
  try {
    const pid = await makeProspect(eid);
    const cid = await makeCampaign(eid);
    const rid = await makeRecipient(eid, cid, pid);
    const enq = await enqueueCampaign(eid, cid, pid, rid, true);
    assert(enq.enqueued);
    const r = await callWorker(eid, enq.outbox_id!);
    assertEquals(r.data?.outcome, "simulated", `resp=${JSON.stringify(r)}`);

    const { data: ob } = await supabase.from("orbit_whatsapp_outbox")
      .select("status, conversa_id").eq("id", enq.outbox_id!).single();
    assertEquals(ob?.status, "simulated");
    assert(ob?.conversa_id, "outbox deveria estar linkado à conversa criada");

    const { data: rec } = await supabase.from("orbit_campaign_recipients")
      .select("status").eq("id", rid).single();
    assertEquals(rec?.status, "simulated");

    const { data: msgs } = await supabase.from("orbit_mensagens")
      .select("status, direcao").eq("conversa_id", ob!.conversa_id!);
    assert((msgs ?? []).some((m: any) => m.status === "simulated" && m.direcao === "OUT"),
      `esperado ao menos 1 OUT simulated, got ${JSON.stringify(msgs)}`);

    // Counters fecham: total = enviado + simulated + falhou + ignorado + pendente
    const { data: allRec } = await supabase.from("orbit_campaign_recipients")
      .select("status").eq("campaign_id", cid);
    const tally: Record<string, number> = {};
    for (const r2 of (allRec ?? []) as any[]) tally[r2.status] = (tally[r2.status] ?? 0) + 1;
    const total = (allRec ?? []).length;
    const sum = (tally["enviado"] ?? 0) + (tally["simulated"] ?? 0) + (tally["falhou"] ?? 0)
      + (tally["ignorado"] ?? 0) + (tally["pendente"] ?? 0);
    assertEquals(sum, total, `counters não fecham: tally=${JSON.stringify(tally)}`);
  } finally { await cleanup(eid); }
});

Deno.test("CS14. simulate=true + reuso: segunda execução no mesmo prospect reutiliza conversa existente", async () => {
  const eid = await makeTenant();
  try {
    const pid = await makeProspect(eid);
    const cid = await makeCampaign(eid);
    const cvidPre = await makeConversa(eid, pid);
    const rid = await makeRecipient(eid, cid, pid);
    const enq = await enqueueCampaign(eid, cid, pid, rid, true);
    assert(enq.enqueued);
    const r = await callWorker(eid, enq.outbox_id!);
    assertEquals(r.data?.outcome, "simulated");
    const { data: ob } = await supabase.from("orbit_whatsapp_outbox")
      .select("conversa_id").eq("id", enq.outbox_id!).single();
    assertEquals(ob?.conversa_id, cvidPre, "deve reutilizar conversa aberta existente");
  } finally { await cleanup(eid); }
});
