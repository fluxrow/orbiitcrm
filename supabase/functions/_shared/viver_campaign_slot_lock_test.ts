import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  acquireViverCampaignSlot,
  evaluateViverCampaignSlot,
  refuseTargetedViverCampaign,
  RETAIN_REASON_VIVER_TARGETED_CAMPAIGN,
  ViverCampaignSlotArbiter,
  type ViverSlotClaimRow,
} from "./viver-campaign-slot-lock.ts";
import {
  RETAIN_REASON_VIVER_CAMPAIGN_SPACING,
  RETAIN_REASON_VIVER_SLOT_LOCK,
  RETAIN_REASON_VIVER_SPACING_UNKNOWN,
  VIVER_CAMPAIGN_MIN_GAP_MS,
  VIVER_SEMIJOIAS_EMPRESA_ID,
} from "./viver-daily-quota-policy.ts";

const VIVER = VIVER_SEMIJOIAS_EMPRESA_ID;
const OTHER = "4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18";
const NOW = Date.parse("2026-09-11T12:30:00Z");

// `A` tem id MAIOR que `B`: é exatamente o cenário em que a eleição pelo menor
// id falhava (A começava o HTTP e B, reivindicado depois, também prosseguia).
const A = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const B = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function row(
  id: string,
  lockedAtMs: number | null,
  extra: Partial<ViverSlotClaimRow> = {},
): ViverSlotClaimRow {
  return {
    id,
    status: "processing",
    source_type: "campaign",
    locked_at: lockedAtMs == null ? null : new Date(lockedAtMs).toISOString(),
    ...extra,
  };
}

function arbiter(
  rows: ViverSlotClaimRow[],
  lastCampaignSentAtMs: number | null = null,
) {
  const state = {
    rows: new Map(rows.map((r) => [r.id, r])),
    lastCampaignSentAtMs,
  };
  return { state, arb: new ViverCampaignSlotArbiter(state) };
}

Deno.test("interleaving real: A (id maior) começa antes, B (id menor) é claimed depois e NÃO envia", () => {
  // t0: somente A está processing; A adquire a vaga e começa o HTTP.
  const { state, arb } = arbiter([row(A, NOW - 1_000)]);
  const first = arb.tryAcquire({
    empresaId: VIVER,
    sourceType: "campaign",
    itemId: A,
    nowMs: NOW,
  });
  assertEquals(first.acquired, true);

  // t1: B é reivindicado DEPOIS (A ainda não registrou `sent`).
  state.rows.set(B, row(B, NOW + 500));
  const second = arb.tryAcquire({
    empresaId: VIVER,
    sourceType: "campaign",
    itemId: B,
    nowMs: NOW + 1_000,
  });
  assertEquals(second.acquired, false);
  assertEquals(second.reason, "slot_locked");
  assertEquals(second.retain_reason, RETAIN_REASON_VIVER_SLOT_LOCK);
});

Deno.test("ids invertidos: A (id menor) primeiro, B (id maior) depois também é negado", () => {
  const { state, arb } = arbiter([row(B, NOW - 1_000)]);
  assertEquals(
    arb.tryAcquire({
      empresaId: VIVER,
      sourceType: "campaign",
      itemId: B,
      nowMs: NOW,
    }).acquired,
    true,
  );
  state.rows.set(A, row(A, NOW + 500));
  const second = arb.tryAcquire({
    empresaId: VIVER,
    sourceType: "campaign",
    itemId: A,
    nowMs: NOW + 1_000,
  });
  assertEquals(second.acquired, false);
  assertEquals(second.reason, "slot_locked");
});

Deno.test("dois workers na mesma janela: exatamente um adquire a vaga", () => {
  const { state, arb } = arbiter([row(A, NOW), row(B, NOW)]);
  const results = [A, B].map((id) =>
    arb.tryAcquire({
      empresaId: VIVER,
      sourceType: "campaign",
      itemId: id,
      nowMs: NOW,
      // Cada worker só "vê" o próprio item removido do conjunto bloqueante,
      // logo ambos encontram o outro: nenhum passa sem o claim exclusivo.
    })
  );
  assertEquals(results.filter((r) => r.acquired).length, 0);
  assert(state.rows.size === 2);
});

Deno.test("lease expirada não reserva vaga; lease ativa reserva", () => {
  const expired = evaluateViverCampaignSlot({
    empresaId: VIVER,
    sourceType: "campaign",
    itemId: B,
    inflight: [row(A, NOW - 200_000)],
    nowMs: NOW,
  });
  assertEquals(expired.acquired, true);

  const active = evaluateViverCampaignSlot({
    empresaId: VIVER,
    sourceType: "campaign",
    itemId: B,
    inflight: [row(A, NOW - 10_000)],
    nowMs: NOW,
  });
  assertEquals(active.acquired, false);
});

Deno.test("lote maior que 1: apenas a primeira campanha passa, as demais são adiadas", () => {
  const ids = [
    "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222",
    "33333333-3333-4333-8333-333333333333",
  ];
  const { state, arb } = arbiter([]);
  const accepted: string[] = [];
  for (const id of ids) {
    state.rows.set(id, row(id, NOW));
    const r = arb.tryAcquire({
      empresaId: VIVER,
      sourceType: "campaign",
      itemId: id,
      nowMs: NOW,
    });
    if (r.acquired) accepted.push(id);
  }
  assertEquals(accepted, [ids[0]]);
});

Deno.test("espaçamento de 30 min continua bloqueante com espera calculada", () => {
  const r = evaluateViverCampaignSlot({
    empresaId: VIVER,
    sourceType: "campaign",
    itemId: B,
    inflight: [],
    lastCampaignSentAtMs: NOW - 10 * 60_000,
    nowMs: NOW,
  });
  assertEquals(r.acquired, false);
  assertEquals(r.reason, "min_gap");
  assertEquals(r.wait_ms, VIVER_CAMPAIGN_MIN_GAP_MS - 10 * 60_000);
  assertEquals(r.retain_reason, RETAIN_REASON_VIVER_CAMPAIGN_SPACING);

  const ok = evaluateViverCampaignSlot({
    empresaId: VIVER,
    sourceType: "campaign",
    itemId: B,
    inflight: [],
    lastCampaignSentAtMs: NOW - VIVER_CAMPAIGN_MIN_GAP_MS,
    nowMs: NOW,
  });
  assertEquals(ok.acquired, true);
});

Deno.test("ai_reply da Viver nunca é bloqueado pela reserva de campanha", () => {
  const { arb } = arbiter([row(A, NOW)], NOW - 60_000);
  const r = arb.tryAcquire({
    empresaId: VIVER,
    sourceType: "ai_reply",
    itemId: "44444444-4444-4444-8444-444444444444",
    nowMs: NOW,
  });
  assertEquals(r.acquired, true);
  assertEquals(r.reason, "not_applicable");
  assertEquals(refuseTargetedViverCampaign(VIVER, "ai_reply"), false);
});

Deno.test("outro tenant com campanha em voo segue inalterado", () => {
  const r = evaluateViverCampaignSlot({
    empresaId: OTHER,
    sourceType: "campaign",
    itemId: B,
    inflight: [row(A, NOW)],
    lastCampaignSentAtMs: NOW - 60_000,
    nowMs: NOW,
  });
  assertEquals(r.acquired, true);
  assertEquals(r.reason, "not_applicable");
  assertEquals(refuseTargetedViverCampaign(OTHER, "campaign"), false);
});

Deno.test("execução dirigida de campanha Viver é recusada", () => {
  assertEquals(refuseTargetedViverCampaign(VIVER, "campaign"), true);
  assertEquals(
    RETAIN_REASON_VIVER_TARGETED_CAMPAIGN,
    "VIVER_CAMPAIGN_TARGETED_REFUSED",
  );
});

Deno.test("RPC da trava: erro é fail-closed e sucesso libera", async () => {
  const failing = {
    rpc: () => Promise.resolve({ data: null, error: { message: "boom" } }),
  };
  const denied = await acquireViverCampaignSlot(failing, {
    id: B,
    empresa_id: VIVER,
    source_type: "campaign",
  });
  assertEquals(denied.acquired, false);
  assertEquals(denied.retain_reason, RETAIN_REASON_VIVER_SPACING_UNKNOWN);

  const locked = {
    rpc: () =>
      Promise.resolve({ data: { acquired: false, reason: "slot_locked" }, error: null }),
  };
  const blocked = await acquireViverCampaignSlot(locked, {
    id: B,
    empresa_id: VIVER,
    source_type: "campaign",
  });
  assertEquals(blocked.retain_reason, RETAIN_REASON_VIVER_SLOT_LOCK);

  const gap = {
    rpc: () =>
      Promise.resolve({
        data: { acquired: false, reason: "min_gap", wait_seconds: 120 },
        error: null,
      }),
  };
  const waiting = await acquireViverCampaignSlot(gap, {
    id: B,
    empresa_id: VIVER,
    source_type: "campaign",
  });
  assertEquals(waiting.wait_ms, 120_000);
  assertEquals(waiting.retain_reason, RETAIN_REASON_VIVER_CAMPAIGN_SPACING);

  const okRpc = {
    rpc: () =>
      Promise.resolve({ data: { acquired: true, reason: "acquired" }, error: null }),
  };
  const allowed = await acquireViverCampaignSlot(okRpc, {
    id: B,
    empresa_id: VIVER,
    source_type: "campaign",
  });
  assertEquals(allowed.acquired, true);

  // Outros tenants nunca chamam a RPC.
  let called = false;
  const spy = {
    rpc: () => {
      called = true;
      return Promise.resolve({ data: null, error: null });
    },
  };
  const other = await acquireViverCampaignSlot(spy, {
    id: B,
    empresa_id: OTHER,
    source_type: "campaign",
  });
  assertEquals(other.acquired, true);
  assertEquals(called, false);
});

Deno.test("item que não está mais processing não adquire vaga", () => {
  const r = evaluateViverCampaignSlot({
    empresaId: VIVER,
    sourceType: "campaign",
    itemId: B,
    itemStatus: "canceled",
    inflight: [],
    nowMs: NOW,
  });
  assertEquals(r.acquired, false);
  assertEquals(r.reason, "item_not_processing");
});
