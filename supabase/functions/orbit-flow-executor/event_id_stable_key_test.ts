// Testes reais do event_id path do orbit-flow-executor + stableKey de flow_stage
// no path real da fila WhatsApp. Importa os helpers REAIS (sem replicar lógica):
//
//   - resolveEventId, buildScheduledActionContext, restoreRunFromScheduled
//     (extraídos de index.ts para permitir teste sem inicializar cliente supabase)
//   - checkEligibility do shared/orbit-whatsapp-outbox (produz o stableKey usado
//     em produção via idempotency_key).
//
// Cobre:
//  A. dispatcher grava run.event_id → resolveEventId lê run.event_id (não payload).
//  B. Duas reentradas legítimas com event_id distinto → idempotency_key distinto.
//  C. Mesma transição (mesmo event_id/action) → idempotency_key igual.
//  D. Sem event_id, mas com action_id/target_stage → cai para action_id (documenta
//     colisão que o patch evita quando o dispatcher provê event_id real).
//  E. scheduled action preserva event_id em context; restoreRunFromScheduled devolve
//     event_id no run consumido pelo runner do executor.
//  F. Retrocompat: se scheduled antigo só tem payload.event_id, ainda restaura.
//  G. Fallback: run sem run.event_id usa context.event.id (Typebot legado).
//
// Rodar:
//   deno test --allow-net --allow-env supabase/functions/orbit-flow-executor/event_id_stable_key_test.ts

import { assert, assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  resolveEventId,
  buildScheduledActionContext,
  restoreRunFromScheduled,
} from "./flow-run-events.ts";
import {
  checkEligibility,
  type OutboxContext,
} from "../_shared/orbit-whatsapp-outbox.ts";

// Mock supabase mínimo — retorna vazio para todas as leituras. Isso mantém
// checkEligibility em `eligible: true` e permite validar apenas o idempotency_key.
function emptySupabase() {
  function query(_t: string) {
    const api: any = {
      select: () => api,
      eq: () => api,
      in: () => api,
      gte: () => api,
      limit: () => api,
      maybeSingle: () => Promise.resolve({ data: null, error: null }),
    };
    api.then = (resolve: any) => resolve({ data: [], error: null });
    return api;
  }
  return { from: (t: string) => query(t) };
}

const EMP = "empresa-fabrica";

function baseFlowStageCtx(overrides: Partial<OutboxContext> = {}): OutboxContext {
  return {
    empresa_id: EMP,
    source_type: "flow_stage",
    prospect_id: "p1",
    deal_id: "deal-1",
    target_stage_id: "stage-agendado",
    event_id: null,
    action_id: "action-tpl-confirmacao",
    ...overrides,
  };
}

// ─── A. resolveEventId prioriza run.event_id (path real do dispatcher) ────────
Deno.test("A. resolveEventId prioriza run.event_id sobre payload/context.event", () => {
  const run = {
    id: "run-1",
    event_id: "ev-dispatcher",
    context: { event: { id: "ev-typebot" }, payload: { event_id: "ev-payload" } },
  };
  assertEquals(resolveEventId(run), "ev-dispatcher");
});

Deno.test("G. resolveEventId cai para context.event.id quando run.event_id ausente", () => {
  const run = { id: "run-2", context: { event: { id: "ev-typebot" }, payload: {} } };
  assertEquals(resolveEventId(run), "ev-typebot");
});

Deno.test("G2. resolveEventId cai para payload.event_id como último recurso", () => {
  const run = { id: "run-3", context: { payload: { event_id: "ev-legacy" } } };
  assertEquals(resolveEventId(run), "ev-legacy");
});

Deno.test("G3. resolveEventId retorna null quando nenhuma fonte disponível", () => {
  assertEquals(resolveEventId({ context: { payload: {} } }), null);
});

// ─── B/C. Duas reentradas legítimas produzem stable keys distintos ────────────
Deno.test("B. Duas transições distintas (event_id diferente) → idempotency_key distinto", async () => {
  const sb = emptySupabase();

  // Simula runs REAIS do dispatcher (event_id em run.event_id).
  const runFirst = {
    id: "run-A",
    empresa_id: EMP,
    flow_id: "flow-x",
    event_id: "ev-first",
    context: { payload: { deal_id: "deal-1", to_stage_id: "stage-agendado" } },
  };
  const runSecond = {
    id: "run-B",
    empresa_id: EMP,
    flow_id: "flow-x",
    event_id: "ev-second",
    context: { payload: { deal_id: "deal-1", to_stage_id: "stage-agendado" } },
  };

  const ctxA = baseFlowStageCtx({ event_id: resolveEventId(runFirst) });
  const ctxB = baseFlowStageCtx({ event_id: resolveEventId(runSecond) });

  const a = await checkEligibility(sb as any, ctxA);
  const b = await checkEligibility(sb as any, ctxB);

  assertNotEquals(a.idempotency_key, b.idempotency_key);
  assert(a.idempotency_key.includes("ev-first"));
  assert(b.idempotency_key.includes("ev-second"));
});

Deno.test("C. Mesmo event_id/action → idempotency_key igual (dedupe correto)", async () => {
  const sb = emptySupabase();
  const run = {
    id: "run-C",
    empresa_id: EMP,
    event_id: "ev-same",
    context: { payload: { deal_id: "deal-1", to_stage_id: "stage-agendado" } },
  };
  const ctx1 = baseFlowStageCtx({ event_id: resolveEventId(run) });
  const ctx2 = baseFlowStageCtx({ event_id: resolveEventId(run) });
  const r1 = await checkEligibility(sb as any, ctx1);
  const r2 = await checkEligibility(sb as any, ctx2);
  assertEquals(r1.idempotency_key, r2.idempotency_key);
});

// ─── D. Documenta o bug corrigido: sem event_id resolvido, duas transições
//        legítimas convergiriam ao mesmo action_id → colisão permanente.
Deno.test("D. Regressão documentada: sem event_id, key colapsa para action_id (path que o patch evita)", async () => {
  const sb = emptySupabase();
  const noEvent = baseFlowStageCtx({ event_id: null }); // action_id preenchido
  const r = await checkEligibility(sb as any, noEvent);
  // Sem event_id, o stableKey usa action_id → toda re-transição colide.
  assert(r.idempotency_key.includes("action-tpl-confirmacao"));
  // Prova de que sem o patch (event_id=null), duas transições produzem MESMA key:
  const r2 = await checkEligibility(sb as any, baseFlowStageCtx({ event_id: null }));
  assertEquals(r.idempotency_key, r2.idempotency_key);
});

// ─── E. scheduled action preserva event_id do run original ───────────────────
Deno.test("E. buildScheduledActionContext persiste event_id do run do dispatcher", () => {
  const run = {
    id: "run-D",
    empresa_id: EMP,
    entity_type: "deal",
    entity_id: "deal-1",
    event_id: "ev-original",
    context: { payload: { deal_id: "deal-1", to_stage_id: "stage-agendado" } },
  };
  const ctx = buildScheduledActionContext(run);
  assertEquals(ctx.event_id, "ev-original");
  assertEquals(ctx.entity_type, "deal");
  assertEquals(ctx.payload.to_stage_id, "stage-agendado");
});

Deno.test("E2. restoreRunFromScheduled devolve event_id em run.event_id (consumo do runner)", async () => {
  const originalRun = {
    id: "run-E",
    empresa_id: EMP,
    flow_id: "flow-x",
    entity_type: "deal",
    entity_id: "deal-1",
    event_id: "ev-real",
    context: { payload: { deal_id: "deal-1", to_stage_id: "stage-agendado" } },
  };
  // Simula linha persistida em orbit_flow_scheduled_actions.
  const scheduledRow = {
    id: "sched-1",
    empresa_id: EMP,
    run_id: originalRun.id,
    flow_id: originalRun.flow_id,
    context: buildScheduledActionContext(originalRun),
  };

  const restored = restoreRunFromScheduled(scheduledRow);
  assertEquals(restored.event_id, "ev-real");
  // resolveEventId no run restaurado ainda retorna o event_id original.
  assertEquals(resolveEventId(restored), "ev-real");

  // E o stableKey do round-trip permanece idêntico ao do dispatcher direto.
  const sb = emptySupabase();
  const direct = await checkEligibility(sb as any, baseFlowStageCtx({ event_id: resolveEventId(originalRun) }));
  const roundtrip = await checkEligibility(sb as any, baseFlowStageCtx({ event_id: resolveEventId(restored) }));
  assertEquals(direct.idempotency_key, roundtrip.idempotency_key);
});

// ─── F. Retrocompat: scheduled antigo com event_id apenas em payload ─────────
Deno.test("F. restoreRunFromScheduled aceita event_id legado em context.payload.event_id", () => {
  const legacyRow = {
    id: "sched-legacy",
    empresa_id: EMP,
    run_id: "run-legacy",
    flow_id: "flow-x",
    context: {
      payload: { deal_id: "deal-1", to_stage_id: "stage-agendado", event_id: "ev-legacy" },
      entity_type: "deal",
      entity_id: "deal-1",
      // event_id NÃO está no topo do context (agendamento anterior ao patch).
    },
  };
  const restored = restoreRunFromScheduled(legacyRow);
  assertEquals(restored.event_id, "ev-legacy");
  assertEquals(resolveEventId(restored), "ev-legacy");
});

// ─── H. Sanidade: target_stage_id e action_id continuam vindo do payload/cfg.
Deno.test("H. stableKey inclui target_stage_id e diferencia stages distintos", async () => {
  const sb = emptySupabase();
  const a = await checkEligibility(sb as any, baseFlowStageCtx({ event_id: "ev-x", target_stage_id: "stage-agendado" }));
  const b = await checkEligibility(sb as any, baseFlowStageCtx({ event_id: "ev-x", target_stage_id: "stage-noshow" }));
  assertNotEquals(a.idempotency_key, b.idempotency_key);
});
