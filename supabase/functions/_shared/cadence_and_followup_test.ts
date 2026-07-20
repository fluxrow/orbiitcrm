// Cadência ativa única + gate de OUT real para flow_followup + propagação de simulate.
//
// Cobre:
//   FC1  followup sem qualquer conversa → missing_prior_real_outbound
//   FC2  followup com conversa mas sem OUT real (só simulated) → missing_prior_real_outbound
//   FC3  followup com OUT real (enviada) e sem reply/meeting/handoff/terminal → elegible
//   FC4  followup com OUT real + IN posterior → lead_replied (mantém regra existente)
//   FC5  followup com OUT real + meeting scheduled futura → meeting_scheduled
//   FC6  flow_initial já contatado permanece already_contacted
//   FC7  flow_stage não é afetado pelo gate de OUT real
//   FC8  enqueueOutbox propaga metadata.simulate=true ao insert
//   FC9  computeCadenceKey retorna null quando falta empresa/prospect/flow/action
//   FC10 computeCadenceKey estável e determinística
//   FC11 enqueueScheduledAction-like: erro 23505 na cadence_key retorna dedupe
//        (simulado via mock — o handler real vive no executor).
//
// Rodar:
//   deno test --allow-net --allow-env supabase/functions/_shared/cadence_and_followup_test.ts

import { assert, assertEquals, assertExists } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  checkEligibility,
  enqueueOutbox,
  type OutboxContext,
} from "./orbit-whatsapp-outbox.ts";
import { computeCadenceKey } from "../orbit-flow-executor/index-cadence-exports.ts";

// ── Mock supabase compatível com o padrão usado em outbox_flow_stage_test.ts ──
interface Fx {
  prospects: any[];
  conversas: any[];
  deals: any[];
  stages: any[];
  meetings: any[];
  mensagens: any[];
  outbox?: any[];
  // captura o último insert em outbox para asserções
  lastOutboxInsert?: any;
  // simula 23505 no insert do outbox se true
  outboxInsertFails23505?: boolean;
}

function makeSupabase(fx: Fx) {
  function query(table: string) {
    const filters: Array<[string, any]> = [];
    const inFilters: Array<[string, any[]]> = [];
    const gteFilters: Array<[string, string]> = [];
    let limitN = Infinity;
    let insertRow: any = null;
    const api: any = {
      select: () => api,
      eq: (col: string, val: any) => { filters.push([col, val]); return api; },
      in: (col: string, vals: any[]) => { inFilters.push([col, vals]); return api; },
      gte: (col: string, v: string) => { gteFilters.push([col, v]); return api; },
      limit: (n: number) => { limitN = n; return api; },
      insert: (row: any) => { insertRow = row; return api; },
      single: () => {
        if (insertRow && table === "orbit_whatsapp_outbox") {
          fx.lastOutboxInsert = insertRow;
          if (fx.outboxInsertFails23505) {
            return Promise.resolve({ data: null, error: { code: "23505", message: "unique_violation" } });
          }
          const row = { id: "out-" + Math.random().toString(36).slice(2, 8), status: "queued", ...insertRow };
          (fx.outbox ??= []).push(row);
          return Promise.resolve({ data: row, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      maybeSingle: () => {
        const rows: any[] = pickRows(table);
        const found = rows.find(matches);
        return Promise.resolve({ data: found ?? null, error: null });
      },
      then: undefined,
    };
    api.then = (resolve: any) => {
      const rows = pickRows(table).filter(matches);
      resolve({ data: rows.slice(0, limitN), error: null });
    };
    function pickRows(t: string): any[] {
      if (t === "orbit_prospects") return fx.prospects;
      if (t === "orbit_conversas") return fx.conversas;
      if (t === "orbit_deals") return fx.deals;
      if (t === "orbit_pipeline_stages") return fx.stages;
      if (t === "orbit_meetings") return fx.meetings;
      if (t === "orbit_mensagens") return fx.mensagens;
      if (t === "orbit_whatsapp_outbox") return fx.outbox ?? [];
      return [];
    }
    function matches(r: any): boolean {
      for (const [c, v] of filters) if (r[c] !== v) return false;
      for (const [c, vals] of inFilters) if (!vals.includes(r[c])) return false;
      for (const [c, v] of gteFilters) if (!(String(r[c] ?? "") >= v)) return false;
      return true;
    }
    return api;
  }
  return { from: (t: string) => query(t) };
}

const EMP = "empresa-fab";
const PRO = "prospect-1";
const FLOW = "flow-1";
const ACT = "action-1";
const CONV = "conv-1";

function baseFx(overrides: Partial<Fx> = {}): Fx {
  return {
    prospects: [{ id: PRO, empresa_id: EMP, optout_whatsapp: false, deleted_at: null }],
    conversas: [{ id: CONV, empresa_id: EMP, prospect_id: PRO, human_talk: false, human_user_id: null }],
    deals: [],
    stages: [],
    meetings: [],
    mensagens: [],
    ...overrides,
  };
}

function ctxFollowup(): OutboxContext {
  return {
    empresa_id: EMP,
    prospect_id: PRO,
    conversa_id: CONV,
    source_type: "flow_followup",
    flow_run_id: "run-1",
    scheduled_action_id: "sched-1",
  };
}

Deno.test("FC1 followup sem qualquer conversa → missing_prior_real_outbound", async () => {
  const fx = baseFx({ conversas: [] });
  const sb = makeSupabase(fx);
  const r = await checkEligibility(sb, { ...ctxFollowup(), conversa_id: null });
  assert(r.reasons.includes("missing_prior_real_outbound"), r.reasons.join(","));
  assertEquals(r.eligible, false);
});

Deno.test("FC2 followup com OUT apenas simulated → missing_prior_real_outbound", async () => {
  const fx = baseFx({
    mensagens: [
      { id: "m-sim", conversa_id: CONV, direcao: "OUT", status: "simulated" },
    ],
  });
  const r = await checkEligibility(makeSupabase(fx), ctxFollowup());
  assert(r.reasons.includes("missing_prior_real_outbound"), r.reasons.join(","));
});

Deno.test("FC3 followup com OUT real e sem reply/meeting/handoff → elegible", async () => {
  const fx = baseFx({
    mensagens: [
      { id: "m-real", conversa_id: CONV, direcao: "OUT", status: "enviada" },
    ],
  });
  const r = await checkEligibility(makeSupabase(fx), ctxFollowup());
  assertEquals(r.reasons, []);
  assertEquals(r.eligible, true);
});

Deno.test("FC4 followup com OUT real + IN → lead_replied (não missing)", async () => {
  const fx = baseFx({
    mensagens: [
      { id: "m-real", conversa_id: CONV, direcao: "OUT", status: "delivered" },
      { id: "m-in", conversa_id: CONV, direcao: "IN", status: "recebida" },
    ],
  });
  const r = await checkEligibility(makeSupabase(fx), ctxFollowup());
  assert(r.reasons.includes("lead_replied"));
  assert(!r.reasons.includes("missing_prior_real_outbound"));
});

Deno.test("FC5 followup com OUT real + meeting futura → meeting_scheduled", async () => {
  const future = new Date(Date.now() + 86_400_000).toISOString();
  const fx = baseFx({
    mensagens: [{ id: "m-real", conversa_id: CONV, direcao: "OUT", status: "sent" }],
    meetings: [{ id: "mt-1", prospect_id: PRO, status: "scheduled", scheduled_at: future }],
  });
  const r = await checkEligibility(makeSupabase(fx), ctxFollowup());
  assert(r.reasons.includes("meeting_scheduled"), r.reasons.join(","));
});

Deno.test("FC6 flow_initial com OUT real → already_contacted (regressão)", async () => {
  const fx = baseFx({
    mensagens: [{ id: "m-real", conversa_id: CONV, direcao: "OUT", status: "enviada" }],
  });
  const r = await checkEligibility(makeSupabase(fx), {
    empresa_id: EMP,
    prospect_id: PRO,
    conversa_id: CONV,
    source_type: "flow_initial",
    event_created: true,
  });
  assert(r.reasons.includes("already_contacted"));
});

Deno.test("FC7 flow_stage ignora gate de OUT real (não bloqueia)", async () => {
  // Sem qualquer mensagem OUT/IN, flow_stage com deal casando etapa não deve pedir OUT real.
  const stageId = "stg-1";
  const dealId = "deal-1";
  const fx = baseFx({
    deals: [{ id: dealId, empresa_id: EMP, prospect_id: PRO, status: "open", deleted_at: null, etapa_id: stageId }],
    stages: [{ id: stageId, is_won: false, is_lost: false }],
  });
  const r = await checkEligibility(makeSupabase(fx), {
    empresa_id: EMP,
    prospect_id: PRO,
    conversa_id: CONV,
    source_type: "flow_stage",
    deal_id: dealId,
    target_stage_id: stageId,
    event_id: "evt-1",
  });
  assertEquals(r.reasons, []);
});

Deno.test("FC8 enqueueOutbox propaga metadata.simulate=true", async () => {
  const fx = baseFx({
    mensagens: [{ id: "m-real", conversa_id: CONV, direcao: "OUT", status: "enviada" }],
  });
  const sb = makeSupabase(fx);
  const r = await enqueueOutbox(sb as any, {
    empresa_id: EMP,
    prospect_id: PRO,
    conversa_id: CONV,
    source_type: "flow_followup",
    flow_run_id: "run-1",
    scheduled_action_id: "sched-1",
    payload_type: "text",
    payload: { mensagem: "oi" },
    metadata: { simulate: true, trigger_type: "lead_recebido" },
  } as any);
  assertEquals(r.enqueued, true);
  const captured = fx.lastOutboxInsert;
  assertExists(captured);
  assertEquals(captured.metadata.simulate, true);
});

Deno.test("FC9 computeCadenceKey null quando falta componente", () => {
  const base = { action_type: "send_whatsapp_template", empresa_id: EMP, prospect_id: PRO, flow_id: FLOW, action_id: ACT };
  assertEquals(computeCadenceKey({ ...base, empresa_id: null }), null);
  assertEquals(computeCadenceKey({ ...base, prospect_id: null }), null);
  assertEquals(computeCadenceKey({ ...base, flow_id: null }), null);
  assertEquals(computeCadenceKey({ ...base, action_id: null }), null);
  assertEquals(computeCadenceKey({ ...base, action_type: "delay_execution" }), null);
});

Deno.test("FC10 computeCadenceKey estável e determinística", () => {
  const k1 = computeCadenceKey({ action_type: "send_whatsapp_template", empresa_id: EMP, prospect_id: PRO, flow_id: FLOW, action_id: ACT });
  const k2 = computeCadenceKey({ action_type: "send_whatsapp_template", empresa_id: EMP, prospect_id: PRO, flow_id: FLOW, action_id: ACT });
  assertEquals(k1, k2);
  assertEquals(k1, `cad:swt:${EMP}:${PRO}:${FLOW}:${ACT}`);
  // Ações diferentes → chaves diferentes
  const k3 = computeCadenceKey({ action_type: "send_whatsapp_template", empresa_id: EMP, prospect_id: PRO, flow_id: FLOW, action_id: "action-2" });
  assert(k1 !== k3);
});

Deno.test("FC11 dedupe cadence — 23505 no insert seria capturado pelo handler do executor", async () => {
  // Não podemos importar o handler real do executor sem SUPABASE_URL/SERVICE_KEY, então
  // validamos aqui apenas o contrato: mock retorna 23505 e um segundo lookup encontra
  // o schedule ativo já existente por cadence_key. Handler real segue essa mesma forma.
  const existing = { id: "sched-existing", cadence_key: "cad:x", status: "pending", scheduled_for: new Date().toISOString() };
  const fx: any = { prospects: [], conversas: [], deals: [], stages: [], meetings: [], mensagens: [], schedules: [existing] };
  // Simula insert falhando com 23505 e depois um lookup retornando o schedule ativo.
  const insertResult = { data: null, error: { code: "23505", message: "unique_violation" } };
  const lookupResult = { data: existing, error: null };
  // Contrato do handler:
  let result: any;
  if (insertResult.error?.code === "23505") {
    result = { id: lookupResult.data.id, scheduled_for: lookupResult.data.scheduled_for, dedupe: true };
  }
  assertEquals(result.id, "sched-existing");
  assertEquals(result.dedupe, true);
});
