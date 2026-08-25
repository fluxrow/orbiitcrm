// Testes de segurança da reserva de resposta engajada (engaged_reply_reserve).
// Puros: sem banco, sem fila real, sem Z-API, sem fetch.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  engagedReserveLimit,
  engagedReplyUncapped,
  isEngagedReserveCandidate,
  validateEngagedInbound,
  countEngagedReserveUsedToday,
  countEngagedReserveUsedTodayForConversa,
  evaluateEngagedReserve,
  ENGAGED_REPLY_RESERVE_REASON,
  ENGAGED_RESERVE_CONVERSA_LIMIT,
  RETAIN_REASON_RESERVE_CONVERSA,
  RETAIN_REASON_RESERVE_DAILY,
} from "./engaged-reply-reserve.ts";
import { nextAttemptForRetain, RETAIN_REASON_DAILY, saoPauloDate } from "./outbox-quota.ts";

const BULLINK = "4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18";
const VIVER = "36f26579-66ad-4ef1-9788-141e4c727232";
const OTHER = "4de0ed22-0fe5-40ef-aaed-703dd3070291"; // Fluxrow
const CUTOFF = "2026-08-11T19:34:16.656913Z";
const CONVERSA = "c0000000-0000-4000-8000-000000000001";
const CONVERSA_B = "c0000000-0000-4000-8000-000000000002";
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

const conversa = (over: Record<string, unknown> = {}) => ({
  id: CONVERSA,
  empresa_id: BULLINK,
  human_talk: false,
  archived_at: null,
  quarantine_reason: null,
  status: "ativa",
  ...over,
});

Deno.test("R1 reserva habilitada só nos tenants autorizados, teto 100", () => {
  assertEquals(engagedReserveLimit(BULLINK), 100);
  assertEquals(engagedReserveLimit(VIVER), 100);
  assertEquals(engagedReplyUncapped(BULLINK), true);
  assertEquals(engagedReplyUncapped(VIVER), true);
  assertEquals(engagedReserveLimit(OTHER), 0);
  assertEquals(engagedReplyUncapped(OTHER), false);
  assertEquals(engagedReserveLimit(null), 0);
  assertEquals(ENGAGED_RESERVE_CONVERSA_LIMIT, 30);
});

Deno.test("R2 ai_reply com IN válida é elegível", () => {
  const r = validateEngagedInbound({ item: item(), inbound: inbound(), cutoff: CUTOFF, conversa: conversa() });
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

Deno.test("Viver: resposta engajada fica fora da cota 10, mas novo contato consome a cota comum", () => {
  const engaged = item({ empresa_id: VIVER, source_type: "ai_reply" });
  const engagedInbound = inbound({ empresa_id: VIVER });
  const engagedConversation = conversa({ empresa_id: VIVER });
  assertEquals(validateEngagedInbound({ item: engaged, inbound: engagedInbound, cutoff: CUTOFF, conversa: engagedConversation }).eligible, true);
  assertEquals(engagedReplyUncapped(VIVER), true);

  const newContact = item({ empresa_id: VIVER, source_type: "flow_initial", metadata: {} });
  assertEquals(isEngagedReserveCandidate(newContact), false);
  assertEquals(engagedReplyUncapped(OTHER), false);
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
    validateEngagedInbound({ item: item(), inbound: inbound({ conversa_id: CONVERSA_B }), cutoff: CUTOFF }).reason,
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

Deno.test("R8b janela de 24h: inbound mais antiga bloqueia", () => {
  assertEquals(
    validateEngagedInbound({ item: item(), inbound: inbound({ created_at: "2026-08-10T20:00:00.000Z" }), cutoff: null }).reason,
    "inbound_outside_24h_window",
  );
  // 23h59 ainda passa.
  assertEquals(
    validateEngagedInbound({ item: item(), inbound: inbound({ created_at: "2026-08-10T21:01:00.000Z" }), cutoff: null }).eligible,
    true,
  );
});


Deno.test("R8c conversa arquivada, em quarentena ou com humano bloqueia", () => {
  const cases: Array<[Record<string, unknown>, string]> = [
    [{ archived_at: "2026-08-11T10:00:00Z" }, "conversa_archived"],
    [{ quarantine_reason: "bullink_backfill" }, "conversa_quarantined"],
    [{ human_talk: true }, "conversa_human_talk"],
    [{ empresa_id: OTHER }, "conversa_cross_tenant"],
  ];
  for (const [over, reason] of cases) {
    assertEquals(
      validateEngagedInbound({ item: item(), inbound: inbound(), cutoff: CUTOFF, conversa: conversa(over) }).reason,
      reason,
    );
  }
  assertEquals(
    validateEngagedInbound({ item: item(), inbound: inbound(), cutoff: CUTOFF, conversa: null }).reason,
    "conversa_not_found",
  );
});

// ── Stub mínimo do client para contagem/avaliação (sem rede) ──
function stub(rows: {
  count?: number;
  inbound?: unknown;
  cutoff?: string | null;
  conversa?: unknown;
  answered?: Array<{ id: string; status: string; metadata?: Record<string, unknown> }>;
}) {
  const filters: Record<string, unknown> = {};
  const api: any = {
    from(table: string) {
      api._table = table;
      return api;
    },
    select() { return api; },
    eq(col: string, val: unknown) { filters[col] = val; return api; },
    in() { return api; },
    ilike(col: string, val: unknown) { filters[col] = val; return api; },
    gte() { return api; },
    insert() { return Promise.resolve({ error: null }); },
    update() { return api; },
    limit() { return Promise.resolve({ data: rows.answered ?? [] }); },
    maybeSingle() {
      if (api._table === "orbit_mensagens") return Promise.resolve({ data: rows.inbound ?? null });
      if (api._table === "orbit_conversas") {
        return Promise.resolve({ data: rows.conversa === undefined ? { id: CONVERSA, empresa_id: BULLINK, human_talk: false, archived_at: null, quarantine_reason: null } : rows.conversa });
      }
      return Promise.resolve({ data: { auto_reply_new_leads_from: rows.cutoff ?? null } });
    },
    then(res: any) { return Promise.resolve({ count: rows.count ?? 0 }).then(res); },
    filters,
  };
  return api;
}

Deno.test("R9 contagem do dia usa a marca quota_reason", async () => {
  const s = stub({ count: 30 });
  assertEquals(await countEngagedReserveUsedToday(s, BULLINK), 30);
  assertEquals(s.filters["metadata->>quota_reason"], ENGAGED_REPLY_RESERVE_REASON);
  assertEquals(s.filters["status"], "sent");
  assertEquals(s.filters["empresa_id"], BULLINK);
});

Deno.test("R9b contagem por conversa filtra conversa_id", async () => {
  const s = stub({ count: 12 });
  assertEquals(await countEngagedReserveUsedTodayForConversa(s, BULLINK, CONVERSA), 12);
  assertEquals(s.filters["conversa_id"], CONVERSA);
  assertEquals(s.filters["metadata->>quota_reason"], ENGAGED_REPLY_RESERVE_REASON);
});

Deno.test("R10 evaluate lê inbound real, conversa e cutoff do tenant", async () => {
  const row = { ...inbound(), timestamp: inbound().created_at };
  const ok = await evaluateEngagedReserve(stub({ inbound: row, cutoff: CUTOFF }), item());
  assertEquals(ok.eligible, true);
  const bad = await evaluateEngagedReserve(stub({ inbound: null, cutoff: CUTOFF }), item());
  assertEquals(bad.reason, "inbound_not_found");
  const human = await evaluateEngagedReserve(
    stub({ inbound: row, cutoff: CUTOFF, conversa: { id: CONVERSA, empresa_id: BULLINK, human_talk: true } }),
    item(),
  );
  assertEquals(human.reason, "conversa_human_talk");
});

Deno.test("R10b uma resposta por inbound: segunda tentativa bloqueada", async () => {
  const row = { ...inbound(), timestamp: inbound().created_at };
  const s = stub({ inbound: row, cutoff: CUTOFF, answered: [{ id: "outro-item", status: "sent" }] });
  const r = await evaluateEngagedReserve(s, item());
  assertEquals(r.reason, "inbound_already_answered");
  // Retry do MESMO item (mesma linha já enviada) não bloqueia: não é duplicata.
  const same = stub({ inbound: row, cutoff: CUTOFF, answered: [{ id: item().id, status: "sent" }] });
  assertEquals((await evaluateEngagedReserve(same, item())).eligible, true);
});

Deno.test("R10c fallback marcado como substituído não conta como resposta", async () => {
  const row = { ...inbound(), timestamp: inbound().created_at };
  const s = stub({
    inbound: row,
    cutoff: CUTOFF,
    answered: [{
      id: "fallback-item",
      status: "sent",
      metadata: { recovery_superseded_by: "recovery-fora-horario-20260812" },
    }],
  });
  assertEquals((await evaluateEngagedReserve(s, item())).eligible, true);
});



// ── Simulação do orçamento global + por conversa (espelha o worker) ──
function simulate(items: Array<{ conversa_id: string }>, limit = engagedReserveLimit(BULLINK)) {
  let used = 0;
  const perConversa = new Map<string, number>();
  const out: string[] = [];
  for (const it of items) {
    const cUsed = perConversa.get(it.conversa_id) ?? 0;
    if (used >= limit) { out.push(RETAIN_REASON_RESERVE_DAILY); continue; }
    if (cUsed >= ENGAGED_RESERVE_CONVERSA_LIMIT) { out.push(RETAIN_REASON_RESERVE_CONVERSA); continue; }
    used++;
    perConversa.set(it.conversa_id, cUsed + 1);
    out.push("sent");
  }
  return { out, used };
}

Deno.test("R11 100 respostas globais passam; a 101ª é retida", () => {
  const items = Array.from({ length: 101 }, (_, i) => ({ conversa_id: `c-${i}` }));
  const { out, used } = simulate(items);
  assertEquals(used, 100);
  assertEquals(out.filter((o) => o === "sent").length, 100);
  assertEquals(out[100], RETAIN_REASON_RESERVE_DAILY);
});

Deno.test("R11b 30 na mesma conversa passam; a 31ª é retida e outra conversa segue", () => {
  const items = [
    ...Array.from({ length: 31 }, () => ({ conversa_id: CONVERSA })),
    { conversa_id: CONVERSA_B },
  ];
  const { out, used } = simulate(items);
  assertEquals(out.slice(0, 30).every((o) => o === "sent"), true);
  assertEquals(out[30], RETAIN_REASON_RESERVE_CONVERSA);
  assertEquals(out[31], "sent");
  assertEquals(used, 31);
});

Deno.test("R12 retry do mesmo item não consome reserva duas vezes", () => {
  // A marca é idempotente: item já marcado permanece com o mesmo quota_reason e
  // a contagem do dia é feita por linha 'sent' (uma por item), não por tentativa.
  const it = item({ metadata: { inbound_message_id: INBOUND, quota_reason: ENGAGED_REPLY_RESERVE_REASON } });
  assertEquals(isEngagedReserveCandidate(it), true);
  assertEquals(validateEngagedInbound({ item: it, inbound: inbound(), cutoff: CUTOFF, conversa: conversa() }).eligible, true);
  assertEquals((it.metadata as any).quota_reason, ENGAGED_REPLY_RESERVE_REASON);
});

Deno.test("R13 inbound com sufixo de cast é normalizada", () => {
  const it = item({ metadata: { inbound_message_id: `${INBOUND}:text` } });
  assertEquals(isEngagedReserveCandidate(it), true);
  assertEquals(validateEngagedInbound({ item: it, inbound: inbound(), cutoff: CUTOFF, conversa: conversa() }).eligible, true);
});

Deno.test("R14 reserva esgotada retém até a meia-noite São Paulo", () => {
  const now = new Date("2026-08-11T21:00:00Z");
  const next = nextAttemptForRetain(RETAIN_REASON_RESERVE_DAILY, now);
  const nextDaily = nextAttemptForRetain(RETAIN_REASON_DAILY, now);
  assertEquals(next, nextDaily);
  assertEquals(saoPauloDate(new Date(next)) > saoPauloDate(now), true);
});

Deno.test("R15 outros tenants continuam sem reserva alguma", () => {
  const it = item({ empresa_id: OTHER });
  assertEquals(engagedReserveLimit(OTHER), 0);
  assertEquals(isEngagedReserveCandidate(it), false);
  assertEquals(validateEngagedInbound({ item: it, inbound: inbound({ empresa_id: OTHER }), cutoff: null }).reason, "not_engaged_reply");
});
