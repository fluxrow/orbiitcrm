// Corte de automação por tenant (auto_reply_new_leads_from).
//
// AC1  1ms antes do corte → bloqueado (automation_cutoff)
// AC2  exatamente no corte → permitido
// AC3  depois do corte → permitido
// AC4  cutoff null → permitido (demais tenants intactos, ex.: Fluxrow)
// AC5  prospect deleted → bloqueado
// AC6  conversa arquivada/quarentena → bloqueado
// AC7  conversa human_talk=true → bloqueado
// AC8  cross-tenant → bloqueado
// AC9  outbox: ai_reply de prospect antigo → automation_cutoff (nada enfileirado)
// AC10 outbox: flow_followup de prospect antigo → automation_cutoff
// AC11 outbox: flow_initial de prospect NOVO pós-corte → elegível (D0 sai)
// AC12 outbox: manual (humano) não é bloqueado pelo corte
// AC13 idempotência: dois enqueues do mesmo ai_reply pós-corte → 1 item
//
// Rodar: deno test --allow-net --allow-env supabase/functions/_shared/automation_cutoff_test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  evaluateAutomationCutoff,
  isCreatedAfterCutoff,
  loadAutomationCutoff,
} from "./automation-cutoff.ts";
import { checkEligibility, enqueueOutbox } from "./orbit-whatsapp-outbox.ts";

const EMP = "empresa-bullink";
const OTHER = "empresa-fluxrow";
const CUTOFF = "2026-08-11T19:34:16.656913Z";
const CUT_MS = Date.parse(CUTOFF);
const iso = (ms: number) => new Date(ms).toISOString();

interface Fx {
  prospects: any[];
  conversas: any[];
  deals: any[];
  stages: any[];
  meetings: any[];
  mensagens: any[];
  ai_config: any[];
  outbox: any[];
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
      eq: (c: string, v: any) => { filters.push([c, v]); return api; },
      in: (c: string, v: any[]) => { inFilters.push([c, v]); return api; },
      gte: (c: string, v: string) => { gteFilters.push([c, v]); return api; },
      limit: (n: number) => { limitN = n; return api; },
      insert: (row: any) => { insertRow = row; return api; },
      single: () => {
        if (insertRow && table === "orbit_whatsapp_outbox") {
          const row = { id: "out-" + (fx.outbox.length + 1), status: "queued", ...insertRow };
          fx.outbox.push(row);
          return Promise.resolve({ data: row, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      maybeSingle: () => Promise.resolve({ data: pickRows(table).find(matches) ?? null, error: null }),
      then: undefined as any,
    };
    api.then = (resolve: any) => resolve({ data: pickRows(table).filter(matches).slice(0, limitN), error: null });
    function pickRows(t: string): any[] {
      if (t === "orbit_prospects") return fx.prospects;
      if (t === "orbit_conversas") return fx.conversas;
      if (t === "orbit_deals") return fx.deals;
      if (t === "orbit_pipeline_stages") return fx.stages;
      if (t === "orbit_meetings") return fx.meetings;
      if (t === "orbit_mensagens") return fx.mensagens;
      if (t === "orbit_ai_config") return fx.ai_config;
      if (t === "orbit_whatsapp_outbox") return fx.outbox;
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

function baseFx(over: Partial<Fx> = {}): Fx {
  return {
    prospects: [],
    conversas: [],
    deals: [],
    stages: [],
    meetings: [],
    mensagens: [],
    ai_config: [
      { empresa_id: EMP, auto_reply_new_leads_from: CUTOFF },
      { empresa_id: OTHER, auto_reply_new_leads_from: null },
    ],
    outbox: [],
    ...over,
  };
}

function prospect(id: string, createdMs: number, over: any = {}) {
  return { id, empresa_id: EMP, created_at: iso(createdMs), deleted_at: null, optout_whatsapp: false, ...over };
}
function conversa(id: string, prospect_id: string, over: any = {}) {
  return { id, empresa_id: EMP, prospect_id, human_talk: false, human_user_id: null, archived_at: null, quarantine_reason: null, ...over };
}

Deno.test("AC0 comparação pura de instantes", () => {
  assertEquals(isCreatedAfterCutoff(CUTOFF, iso(CUT_MS - 1)), false);
  assertEquals(isCreatedAfterCutoff(CUTOFF, CUTOFF), true);
  assertEquals(isCreatedAfterCutoff(CUTOFF, iso(CUT_MS + 1)), true);
  assertEquals(isCreatedAfterCutoff(null, iso(CUT_MS - 10_000)), true);
  assertEquals(isCreatedAfterCutoff(CUTOFF, null), false);
});

Deno.test("AC1 prospect 1ms antes do corte é bloqueado", async () => {
  const fx = baseFx({ prospects: [prospect("p-old", CUT_MS - 1)] });
  const d = await evaluateAutomationCutoff(makeSupabase(fx), { empresa_id: EMP, prospect_id: "p-old" });
  assertEquals(d.allowed, false);
  assertEquals(d.reason, "automation_cutoff");
});

Deno.test("AC2 prospect exatamente no corte responde", async () => {
  const fx = baseFx({ prospects: [prospect("p-eq", CUT_MS)] });
  const d = await evaluateAutomationCutoff(makeSupabase(fx), { empresa_id: EMP, prospect_id: "p-eq" });
  assertEquals(d.allowed, true);
});

Deno.test("AC3 prospect depois do corte responde", async () => {
  const fx = baseFx({ prospects: [prospect("p-new", CUT_MS + 60_000)] });
  const d = await evaluateAutomationCutoff(makeSupabase(fx), { empresa_id: EMP, prospect_id: "p-new" });
  assertEquals(d.allowed, true);
  assertEquals(d.cutoff, CUTOFF);
});

Deno.test("AC4 tenant sem cutoff (Fluxrow) permanece intacto", async () => {
  const fx = baseFx({
    prospects: [{ id: "p-flux", empresa_id: OTHER, created_at: iso(CUT_MS - 10 * 86400_000), deleted_at: null }],
  });
  const sb = makeSupabase(fx);
  assertEquals(await loadAutomationCutoff(sb, OTHER), null);
  const d = await evaluateAutomationCutoff(sb, { empresa_id: OTHER, prospect_id: "p-flux" });
  assertEquals(d.allowed, true);
  assertEquals(d.cutoff, null);
});

Deno.test("AC5 prospect deletado é bloqueado mesmo pós-corte", async () => {
  const fx = baseFx({ prospects: [prospect("p-del", CUT_MS + 1000, { deleted_at: iso(CUT_MS + 2000) })] });
  const d = await evaluateAutomationCutoff(makeSupabase(fx), { empresa_id: EMP, prospect_id: "p-del" });
  assertEquals(d.allowed, false);
  assertEquals(d.reason, "prospect_deleted");
});

Deno.test("AC6 conversa arquivada/quarentena é bloqueada", async () => {
  const fx = baseFx({
    prospects: [prospect("p1", CUT_MS + 1000)],
    conversas: [conversa("c1", "p1", { archived_at: iso(CUT_MS), quarantine_reason: "quarantine" })],
  });
  const d = await evaluateAutomationCutoff(makeSupabase(fx), { empresa_id: EMP, prospect_id: "p1", conversa_id: "c1" });
  assertEquals(d.allowed, false);
  assertEquals(d.reason, "conversa_archived");
});

Deno.test("AC7 conversa human_talk=true é bloqueada", async () => {
  const fx = baseFx({
    prospects: [prospect("p1", CUT_MS + 1000)],
    conversas: [conversa("c1", "p1", { human_talk: true })],
  });
  const d = await evaluateAutomationCutoff(makeSupabase(fx), { empresa_id: EMP, prospect_id: "p1", conversa_id: "c1" });
  assertEquals(d.allowed, false);
  assertEquals(d.reason, "human_talk");
});

Deno.test("AC8 cross-tenant é bloqueado", async () => {
  const fx = baseFx({ prospects: [prospect("p-x", CUT_MS + 1000, { empresa_id: OTHER })] });
  const d = await evaluateAutomationCutoff(makeSupabase(fx), { empresa_id: EMP, prospect_id: "p-x" });
  assertEquals(d.allowed, false);
  assertEquals(d.reason, "cross_tenant");
});

Deno.test("AC9 outbox: ai_reply de prospect antigo → automation_cutoff", async () => {
  const fx = baseFx({
    prospects: [prospect("p-old", CUT_MS - 86400_000)],
    conversas: [conversa("c-old", "p-old")],
  });
  const sb = makeSupabase(fx);
  const r = await enqueueOutbox(sb, {
    empresa_id: EMP, prospect_id: "p-old", conversa_id: "c-old",
    source_type: "ai_reply", inbound_message_id: "in-1",
    payload_type: "text", payload: { message: "oi" },
  });
  assertEquals(r.enqueued, false);
  assertEquals(r.reason, "automation_cutoff");
  assertEquals(fx.outbox.length, 0);
});

Deno.test("AC10 outbox: flow_followup (D+1/D+3) de prospect antigo → automation_cutoff", async () => {
  const fx = baseFx({
    prospects: [prospect("p-old", CUT_MS - 3 * 86400_000)],
    conversas: [conversa("c-old", "p-old")],
    mensagens: [{ id: "m1", conversa_id: "c-old", direcao: "OUT", status: "enviada" }],
  });
  const elig = await checkEligibility(makeSupabase(fx), {
    empresa_id: EMP, prospect_id: "p-old", conversa_id: "c-old",
    source_type: "flow_followup", scheduled_action_id: "sa-1",
  });
  assertEquals(elig.eligible, false);
  assert(elig.reasons.includes("automation_cutoff"));
});

Deno.test("AC11 outbox: flow_initial de prospect novo pós-corte é elegível", async () => {
  const fx = baseFx({
    prospects: [prospect("p-new", CUT_MS + 5000)],
    conversas: [conversa("c-new", "p-new")],
  });
  const elig = await checkEligibility(makeSupabase(fx), {
    empresa_id: EMP, prospect_id: "p-new", conversa_id: "c-new",
    source_type: "flow_initial", event_created: true, flow_run_id: "run-1",
  });
  assertEquals(elig.reasons, []);
  assertEquals(elig.eligible, true);
});

Deno.test("AC12 manual (humano) não é bloqueado pelo corte", async () => {
  const fx = baseFx({
    prospects: [prospect("p-old", CUT_MS - 86400_000)],
    conversas: [conversa("c-old", "p-old", { human_talk: true })],
    mensagens: [{ id: "m1", conversa_id: "c-old", direcao: "IN", status: "recebida" }],
  });
  const elig = await checkEligibility(makeSupabase(fx), {
    empresa_id: EMP, prospect_id: "p-old", conversa_id: "c-old",
    source_type: "manual", source_id: "manual-1",
  });
  assertEquals(elig.eligible, true);
});

Deno.test("AC13 retry idempotente pós-corte não duplica", async () => {
  const fx = baseFx({
    prospects: [prospect("p-new", CUT_MS + 5000)],
    conversas: [conversa("c-new", "p-new")],
  });
  const sb = makeSupabase(fx);
  const input = {
    empresa_id: EMP, prospect_id: "p-new", conversa_id: "c-new",
    source_type: "ai_reply" as const, inbound_message_id: "in-9",
    payload_type: "text" as const, payload: { message: "olá" },
  };
  const a = await enqueueOutbox(sb, input);
  const b = await enqueueOutbox(sb, input);
  assertEquals(a.enqueued, true);
  assertEquals(b.enqueued, false);
  assertEquals(b.reason, "duplicate");
  assertEquals(fx.outbox.length, 1);
});
