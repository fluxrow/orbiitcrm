// Testes sintéticos da elegibilidade e stableKey do source_type "flow_stage".
//
// Objetivo: validar o helper centralizado sem Z-API real e sem tocar em tenants.
//
// Cobre:
//  1. flow_stage clean com deal + target_stage_id casando  → elegible
//  2. flow_stage com etapa atual diferente → stale_stage_transition
//  3. flow_stage terminal (is_won) sem allow_terminal_stage_message → terminal_deal
//  4. flow_stage terminal (is_won) com allow_terminal_stage_message=true → elegible
//  5. flow_stage deal deleted mesmo com allow_terminal → terminal_deal (fail-closed)
//  6. flow_stage cross_tenant → cross_tenant
//  7. flow_stage sem deal_id / deal inexistente → deal_missing
//  8. flow_stage NÃO bloqueia por IN/OUT histórico nem meeting futura
//  9. flow_stage opt-out do prospect → opt_out
// 10. stableKey determinística — 2 chamadas iguais convergem para a mesma key
// 11. Chaves de flow_stage vs flow_initial nunca colidem
// 12. Prioridade flow_stage entre meeting_confirmation e flow_initial
// 13. Enum aceita flow_stage (regressão do type)
// 14. flow_stage prioridade override respeitado via priority_override
//
// Rodar: deno test --allow-net --allow-env supabase/functions/_shared/outbox_flow_stage_test.ts

import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { OUTBOX_PRIORITY, checkEligibility, type OutboxContext, type OutboxSourceType } from "./orbit-whatsapp-outbox.ts";

// ── Mock supabase — apenas leitura dos objetos usados pelo checkEligibility. ──
interface Fx {
  prospects: any[];
  conversas: any[];
  deals: any[];
  stages: any[];
  meetings: any[];
  mensagens: any[];
}

function makeSupabase(fx: Fx) {
  function query(table: string) {
    const filters: Array<[string, any]> = [];
    const inFilters: Array<[string, any[]]> = [];
    const gteFilters: Array<[string, string]> = [];
    let limitN = Infinity;
    const api: any = {
      select: () => api,
      eq: (col: string, val: any) => { filters.push([col, val]); return api; },
      in: (col: string, vals: any[]) => { inFilters.push([col, vals]); return api; },
      gte: (col: string, v: string) => { gteFilters.push([col, v]); return api; },
      limit: (n: number) => { limitN = n; return api; },
      maybeSingle: () => {
        const rows: any[] = pickRows(table);
        const found = rows.find(matches);
        return Promise.resolve({ data: found ?? null, error: null });
      },
      then: undefined,
    };
    // Torna api "thenable" via microtask: quando aguardado sem maybeSingle → retorna lista
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

const EMP = "empresa-a";
const OTHER = "empresa-b";

function baseCtx(overrides: Partial<OutboxContext> = {}): OutboxContext {
  return {
    empresa_id: EMP,
    source_type: "flow_stage",
    prospect_id: "p1",
    deal_id: "d1",
    target_stage_id: "stage-agendado",
    event_id: "ev1",
    ...overrides,
  };
}

function baseFx(over: Partial<Fx> = {}): Fx {
  return {
    prospects: [{ id: "p1", empresa_id: EMP, optout_whatsapp: false, deleted_at: null }],
    conversas: [],
    deals: [{ id: "d1", empresa_id: EMP, prospect_id: "p1", etapa_id: "stage-agendado", status: "open", deleted_at: null }],
    stages: [
      { id: "stage-agendado", is_won: false, is_lost: false },
      { id: "stage-won", is_won: true, is_lost: false },
    ],
    meetings: [],
    mensagens: [],
    ...over,
  };
}

Deno.test("1. flow_stage clean → elegível", async () => {
  const sb = makeSupabase(baseFx());
  const r = await checkEligibility(sb as any, baseCtx());
  assert(r.eligible, `esperado elegível, reasons=${r.reasons.join(",")}`);
});

Deno.test("2. flow_stage etapa atual diferente → stale_stage_transition", async () => {
  const sb = makeSupabase(baseFx({ deals: [{ id: "d1", empresa_id: EMP, prospect_id: "p1", etapa_id: "stage-outra", status: "open", deleted_at: null }] }));
  const r = await checkEligibility(sb as any, baseCtx());
  assertEquals(r.eligible, false);
  assert(r.reasons.includes("stale_stage_transition"));
});

Deno.test("3. flow_stage terminal sem flag → terminal_deal", async () => {
  const sb = makeSupabase(baseFx({ deals: [{ id: "d1", empresa_id: EMP, prospect_id: "p1", etapa_id: "stage-won", status: "open", deleted_at: null }] }));
  const r = await checkEligibility(sb as any, baseCtx({ target_stage_id: "stage-won" }));
  assertEquals(r.eligible, false);
  assert(r.reasons.includes("terminal_deal"));
});

Deno.test("4. flow_stage terminal COM allow_terminal_stage_message → elegível", async () => {
  const sb = makeSupabase(baseFx({ deals: [{ id: "d1", empresa_id: EMP, prospect_id: "p1", etapa_id: "stage-won", status: "open", deleted_at: null }] }));
  const r = await checkEligibility(sb as any, baseCtx({ target_stage_id: "stage-won", allow_terminal_stage_message: true }));
  assert(r.eligible, `esperado elegível, reasons=${r.reasons.join(",")}`);
});

Deno.test("5. flow_stage deal deleted mesmo com allow_terminal → bloqueia", async () => {
  const sb = makeSupabase(baseFx({ deals: [{ id: "d1", empresa_id: EMP, prospect_id: "p1", etapa_id: "stage-agendado", status: "open", deleted_at: "2026-01-01" }] }));
  const r = await checkEligibility(sb as any, baseCtx({ allow_terminal_stage_message: true }));
  assertEquals(r.eligible, false);
  assert(r.reasons.includes("terminal_deal"));
});

Deno.test("6. flow_stage cross_tenant do deal", async () => {
  const sb = makeSupabase(baseFx({ deals: [{ id: "d1", empresa_id: OTHER, prospect_id: "p1", etapa_id: "stage-agendado", status: "open", deleted_at: null }] }));
  const r = await checkEligibility(sb as any, baseCtx());
  assertEquals(r.eligible, false);
  assert(r.reasons.includes("cross_tenant"));
});

Deno.test("7. flow_stage sem deal → deal_missing", async () => {
  const sb = makeSupabase(baseFx({ deals: [] }));
  const r = await checkEligibility(sb as any, baseCtx());
  assertEquals(r.eligible, false);
  assert(r.reasons.includes("deal_missing"));
});

Deno.test("8. flow_stage não bloqueia por histórico IN/OUT nem por meeting futura", async () => {
  const inFuture = new Date(Date.now() + 3600_000).toISOString();
  const sb = makeSupabase(baseFx({
    conversas: [{ id: "c1", empresa_id: EMP, prospect_id: "p1", human_talk: false, human_user_id: null, handoff_sent_at: null }],
    mensagens: [
      { id: "m1", conversa_id: "c1", direcao: "IN", status: "recebida" },
      { id: "m2", conversa_id: "c1", direcao: "OUT", status: "enviada" },
    ],
    meetings: [{ id: "mt1", prospect_id: "p1", empresa_id: EMP, status: "scheduled", scheduled_at: inFuture }],
  }));
  const r = await checkEligibility(sb as any, baseCtx({ conversa_id: "c1" }));
  assert(r.eligible, `flow_stage deve permitir mesmo com histórico, reasons=${r.reasons.join(",")}`);
});

Deno.test("9. flow_stage opt-out do prospect bloqueia", async () => {
  const sb = makeSupabase(baseFx({ prospects: [{ id: "p1", empresa_id: EMP, optout_whatsapp: true, deleted_at: null }] }));
  const r = await checkEligibility(sb as any, baseCtx());
  assertEquals(r.eligible, false);
  assert(r.reasons.includes("opt_out"));
});

Deno.test("10. stableKey determinística — mesma entrada → mesma chave", async () => {
  const sb = makeSupabase(baseFx());
  const a = await checkEligibility(sb as any, baseCtx());
  const b = await checkEligibility(sb as any, baseCtx());
  assertEquals(a.idempotency_key, b.idempotency_key);
});

Deno.test("11. chaves flow_stage e flow_initial nunca colidem", async () => {
  const sb = makeSupabase(baseFx());
  const stage = await checkEligibility(sb as any, baseCtx());
  const initial = await checkEligibility(sb as any, {
    empresa_id: EMP,
    source_type: "flow_initial" as OutboxSourceType,
    prospect_id: "p1",
    event_created: true,
    flow_run_id: "run1",
  });
  assertNotEquals(stage.idempotency_key, initial.idempotency_key);
});

Deno.test("12. prioridade flow_stage entre meeting_confirmation e flow_initial", () => {
  assert(OUTBOX_PRIORITY.flow_stage < OUTBOX_PRIORITY.meeting_confirmation, "flow_stage abaixo de meeting_confirmation");
  assert(OUTBOX_PRIORITY.flow_stage > OUTBOX_PRIORITY.flow_initial, "flow_stage acima de flow_initial");
  assert(OUTBOX_PRIORITY.flow_stage < OUTBOX_PRIORITY.ai_reply);
});

Deno.test("13. enum aceita flow_stage (regressão de type)", () => {
  const t: OutboxSourceType = "flow_stage";
  assertEquals(t, "flow_stage");
});

Deno.test("14. duas transições semanticamente iguais convergem (dedupe stableKey)", async () => {
  const sb = makeSupabase(baseFx());
  const a = await checkEligibility(sb as any, baseCtx({ event_id: "ev-dup" }));
  const b = await checkEligibility(sb as any, baseCtx({ event_id: "ev-dup" }));
  assertEquals(a.idempotency_key, b.idempotency_key);
  // Duas transições legítimas de eventos diferentes → chaves diferentes.
  const c = await checkEligibility(sb as any, baseCtx({ event_id: "ev-other" }));
  assertNotEquals(a.idempotency_key, c.idempotency_key);
});
