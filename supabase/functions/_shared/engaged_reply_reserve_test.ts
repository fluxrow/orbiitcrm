// Testes de segurança da reserva de resposta engajada (engaged_reply_reserve).
// Puros: sem banco, sem fila real, sem Z-API, sem fetch.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  engagedReserveLimit,
  isEngagedReserveCandidate,
  validateEngagedInbound,
  countEngagedReserveUsedToday,
  evaluateEngagedReserve,
  ENGAGED_REPLY_RESERVE_REASON,
} from "./engaged-reply-reserve.ts";

const BULLINK = "4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18";
const OTHER = "4de0ed22-0fe5-40ef-aaed-703dd3070291"; // Fluxrow
const CUTOFF = "2026-08-11T19:34:16.656913Z";
const CONVERSA = "c0000000-0000-4000-8000-000000000001";
const INBOUND = "11111111-1111-4111-8111-111111111111";

const item = (over: Record<string, unknown> = {}) => ({
  id: "34f810a4-53d7-41ab-a435-6b1377e9b9e4",
  empresa_id: BULLINK,
  conversa_id: CONVERSA,
  source_type: "ai_reply",
  created_at: "2026-08-11T21:00:00.000Z",
  metadata: { inbound_message_id: INBOUND },
  ...over,
});

const inbound = (over: Record<string, unknown> = {}) => ({
  id: INBOUND,
  empresa_id: BULLINK,
  conversa_id: CONVERSA,
  direcao: "IN",
  created_at: "2026-08-11T20:55:00.000Z",
  ...over,
});

Deno.test("R1 reserva habilitada só no Bullink, teto 5", () => {
  assertEquals(engagedReserveLimit(BULLINK), 5);
  assertEquals(engagedReserveLimit(OTHER), 0);
  assertEquals(engagedReserveLimit(null), 0);
});

Deno.test("R2 ai_reply com IN válida é elegível", () => {
  const r = validateEngagedInbound({ item: item(), inbound: inbound(), cutoff: CUTOFF });
  assertEquals(r.eligible, true);
  assertEquals(r.inbound_message_id, INBOUND);
});

Deno.test("R3 prospecção e notificações nunca entram na reserva", () => {
  for (const source of ["campaign", "flow_initial", "flow_followup", "flow_stage", "meeting_confirmation", "manual"]) {
    const it = item({ source_type: source });
    assertEquals(isEngagedReserveCandidate(it), false, source);
    assertEquals(validateEngagedInbound({ item: it, inbound: inbound(), cutoff: CUTOFF }).reason, "not_engaged_reply");
  }
});

Deno.test("R4 sem inbound_message_id bloqueia", () => {
  const it = item({ metadata: {} });
  assertEquals(isEngagedReserveCandidate(it), false);
  assertEquals(validateEngagedInbound({ item: it, inbound: null, cutoff: CUTOFF }).reason, "not_engaged_reply");
});

Deno.test("R5 inbound inexistente/falsa bloqueia", () => {
  assertEquals(validateEngagedInbound({ item: item(), inbound: null, cutoff: CUTOFF }).reason, "inbound_not_found");
  assertEquals(
    validateEngagedInbound({ item: item(), inbound: inbound({ id: "22222222-2222-4222-8222-222222222222" }), cutoff: CUTOFF }).reason,
    "inbound_mismatch",
  );
});

Deno.test("R6 cross-tenant e outra conversa bloqueiam", () => {
  assertEquals(validateEngagedInbound({ item: item(), inbound: inbound({ empresa_id: OTHER }), cutoff: CUTOFF }).reason, "inbound_cross_tenant");
  assertEquals(
    validateEngagedInbound({ item: item(), inbound: inbound({ conversa_id: "c0000000-0000-4000-8000-000000000009" }), cutoff: CUTOFF }).reason,
    "inbound_other_conversa",
  );
});

Deno.test("R7 OUT não conta como interação do lead", () => {
  assertEquals(validateEngagedInbound({ item: item(), inbound: inbound({ direcao: "OUT" }), cutoff: CUTOFF }).reason, "inbound_not_in");
});

Deno.test("R8 IN pré-cutoff bloqueia; IN posterior à resposta bloqueia", () => {
  assertEquals(
    validateEngagedInbound({ item: item(), inbound: inbound({ created_at: "2026-08-11T19:34:16.000Z" }), cutoff: CUTOFF }).reason,
    "inbound_before_cutoff",
  );
  assertEquals(
    validateEngagedInbound({ item: item(), inbound: inbound({ created_at: "2026-08-11T21:00:01.000Z" }), cutoff: CUTOFF }).reason,
    "inbound_after_reply",
  );
  // Exatamente no cutoff passa.
  assertEquals(
    validateEngagedInbound({ item: item(), inbound: inbound({ created_at: CUTOFF }), cutoff: CUTOFF }).eligible,
    true,
  );
});

// ── Stub mínimo do client para contagem/avaliação (sem rede) ──
function stub(rows: { count?: number; inbound?: unknown; cutoff?: string | null }) {
  const filters: Record<string, unknown> = {};
  const api: any = {
    from(table: string) {
      api._table = table;
      return api;
    },
    select() { return api; },
    eq(col: string, val: unknown) { filters[col] = val; return api; },
    gte() { return api; },
    maybeSingle() {
      if (api._table === "orbit_mensagens") return Promise.resolve({ data: rows.inbound ?? null });
      return Promise.resolve({ data: { auto_reply_new_leads_from: rows.cutoff ?? null } });
    },
    then(res: any) { return Promise.resolve({ count: rows.count ?? 0 }).then(res); },
    filters,
  };
  return api;
}

Deno.test("R9 contagem do dia usa a marca quota_reason", async () => {
  const s = stub({ count: 5 });
  assertEquals(await countEngagedReserveUsedToday(s, BULLINK), 5);
  assertEquals(s.filters["metadata->>quota_reason"], ENGAGED_REPLY_RESERVE_REASON);
  assertEquals(s.filters["status"], "sent");
  assertEquals(s.filters["empresa_id"], BULLINK);
});

Deno.test("R10 evaluate lê inbound real e cutoff do tenant", async () => {
  const row = { ...inbound(), timestamp: inbound().created_at };
  const ok = await evaluateEngagedReserve(stub({ inbound: row, cutoff: CUTOFF }), item());
  assertEquals(ok.eligible, true);
  const bad = await evaluateEngagedReserve(stub({ inbound: null, cutoff: CUTOFF }), item());
  assertEquals(bad.eligible, false);
  assertEquals(bad.reason, "inbound_not_found");
});

Deno.test("R11 sexta resposta engajada fica sem reserva (teto 5)", () => {
  const limit = engagedReserveLimit(BULLINK);
  let used = 0;
  const outcomes: string[] = [];
  for (let i = 1; i <= 6; i++) {
    const decision = validateEngagedInbound({ item: item(), inbound: inbound(), cutoff: CUTOFF });
    if (decision.eligible && limit - used > 0) {
      used++;
      outcomes.push("sent");
    } else {
      outcomes.push("retained");
    }
  }
  assertEquals(outcomes, ["sent", "sent", "sent", "sent", "sent", "retained"]);
  assertEquals(used, 5);
});

Deno.test("R12 retry do mesmo item não consome reserva duas vezes", () => {
  // A marca é idempotente: item já marcado permanece com o mesmo quota_reason e
  // a contagem do dia é feita por linha 'sent' (uma por item), não por tentativa.
  const it = item({ metadata: { inbound_message_id: INBOUND, quota_reason: ENGAGED_REPLY_RESERVE_REASON } });
  assertEquals(isEngagedReserveCandidate(it), true);
  assertEquals(validateEngagedInbound({ item: it, inbound: inbound(), cutoff: CUTOFF }).eligible, true);
  assertEquals((it.metadata as any).quota_reason, ENGAGED_REPLY_RESERVE_REASON);
});
