import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildAckIdempotencyScope,
  decideAckAtSend,
  decideViverInboundAck,
  isViverInboundAckItem,
  isViverInboundAckRow,
  maybeSendViverInboundAck,
  pickLastNonAckOut,
  readInboundAckEnabled,
  VIVER_INBOUND_ACK_EMPRESA_ID as VIVER,
  VIVER_INBOUND_ACK_MAX_AGE_MS,
  VIVER_INBOUND_ACK_TEXT,
  viverInboundAckSendBlockReason,
} from "./viver-inbound-ack.ts";
import {
  inboundAlreadyAnswered,
  isEngagedReserveCandidate,
  lastEngagedReplySentAt,
} from "./engaged-reply-reserve.ts";
import { consumesProspectingQuota } from "./outbox-quota.ts";

const OTHER = "4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18";
const CONV = "11111111-1111-4111-8111-111111111111";
const PROS = "22222222-2222-4222-8222-222222222222";
const INB = "33333333-3333-4333-8333-333333333333";
const T0 = Date.parse("2026-09-23T19:41:00.000Z");

// ── Stub realista de PostgREST (somente os operadores usados) ──
type Row = Record<string, any>;
function stubDb(tables: Record<string, Row[]>, opts: { failTable?: string } = {}) {
  const from = (table: string) => {
    const filters: ((r: Row) => boolean)[] = [];
    let order: { col: string; asc: boolean } | null = null;
    let lim = Infinity;
    const q: any = {
      select: () => q,
      eq: (c: string, v: any) => (filters.push((r) => r[c] === v), q),
      neq: (c: string, v: any) => (filters.push((r) => r[c] !== v), q),
      gt: (c: string, v: any) => (filters.push((r) => String(r[c]) > String(v)), q),
      gte: (c: string, v: any) => (filters.push((r) => String(r[c]) >= String(v)), q),
      lte: (c: string, v: any) => (filters.push((r) => String(r[c]) <= String(v)), q),
      in: (c: string, v: any[]) => (filters.push((r) => v.includes(r[c])), q),
      not: (c: string, _op: string, _v: any) => (filters.push((r) => r[c] != null), q),
      ilike: (c: string, pat: string) => {
        const key = c.replace("metadata->>", "");
        const pre = pat.replace(/%$/, "");
        filters.push((r) => String(r.metadata?.[key] ?? "").startsWith(pre));
        return q;
      },
      order: (col: string, o: { ascending: boolean }) => ((order = { col, asc: o.ascending }), q),
      limit: (n: number) => ((lim = n), q),
      maybeSingle: () => run().then((r) => ({ data: r.data?.[0] ?? null, error: r.error })),
      then: (res: any, rej: any) => run().then(res, rej),
    };
    const run = async () => {
      if (opts.failTable === table) return { data: null, error: { code: "57014" } };
      let rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
      if (order) {
        const { col, asc } = order;
        rows = [...rows].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1));
      }
      return { data: rows.slice(0, lim), error: null };
    };
    return q;
  };
  return { from };
}

const iso = (ms: number) => new Date(ms).toISOString();
const baseFacts = () => ({
  empresa_id: VIVER,
  ack_enabled: true,
  modo_automatico: true,
  immediate_dispatch: true,
  from_me: false,
  automation_allowed: true,
  conversa_quarantined: false,
  reply_expected: true,
  inbound_message_id: INB,
  prospect: { id: PROS, empresa_id: VIVER, deleted_at: null, optout_whatsapp: false },
  conversa: { id: CONV, empresa_id: VIVER, human_talk: false, human_user_id: null, handoff_sent_at: null, archived_at: null, quarantine_reason: null, status: "ativa" },
  future_meeting_count: 0,
  reply_after_inbound_count: 0,
  human_message_count: 0,
  query_error: null,
});

Deno.test("elegibilidade: inbound elegível da Viver envia", () => {
  assertEquals(decideViverInboundAck(baseFacts()), { send: true, reason: "eligible" });
});

Deno.test("elegibilidade: cada bloqueio fecha (fail-closed)", () => {
  const cases: [string, (f: any) => void][] = [
    ["not_viver_tenant", (f) => (f.empresa_id = OTHER)],
    ["ack_disabled", (f) => (f.ack_enabled = false)],
    ["automatic_mode_off", (f) => (f.modo_automatico = false)],
    ["immediate_dispatch_off", (f) => (f.immediate_dispatch = false)],
    ["from_me", (f) => (f.from_me = true)],
    ["automation_not_allowed", (f) => (f.automation_allowed = false)],
    ["conversa_quarantined", (f) => (f.conversa_quarantined = true)],
    ["no_reply_expected", (f) => (f.reply_expected = false)],
    ["evidence_query_failed", (f) => (f.query_error = "meetings:57014")],
    ["prospect_missing", (f) => (f.prospect = null)],
    ["prospect_deleted", (f) => (f.prospect.deleted_at = "2026-09-01")],
    ["opt_out", (f) => (f.prospect.optout_whatsapp = true)],
    ["human_talk", (f) => (f.conversa.human_talk = true)],
    ["human_owner", (f) => (f.conversa.human_user_id = "u")],
    ["human_handoff", (f) => (f.conversa.handoff_sent_at = "x")],
    ["conversa_archived", (f) => (f.conversa.archived_at = "x")],
    ["conversa_closed", (f) => (f.conversa.status = "encerrada")],
    ["human_attendance", (f) => (f.human_message_count = 1)],
    ["future_meeting", (f) => (f.future_meeting_count = 1)],
    ["reply_already_sent", (f) => (f.reply_after_inbound_count = 1)],
    ["cross_tenant", (f) => (f.conversa.empresa_id = OTHER)],
  ];
  for (const [reason, mut] of cases) {
    const f = baseFacts();
    mut(f);
    assertEquals(decideViverInboundAck(f as any), { send: false, reason }, reason);
  }
});

Deno.test("kill switch: ausente => ligado; false explícito => desligado", () => {
  assertEquals(readInboundAckEnabled({ ai_reply_debounce: { immediate_outbox_dispatch: true } }), true);
  assertEquals(readInboundAckEnabled({ ai_reply_debounce: { inbound_ack_enabled: false } }), false);
});

Deno.test("callback do provedor: linha da confirmação nunca vira âncora/resposta", () => {
  const ack = { id: "a", sender_type: "system", mensagem: VIVER_INBOUND_ACK_TEXT, status: "PLAYED" };
  const ai = { id: "b", sender_type: "ai", mensagem: "Oi! Tudo bem?" };
  assert(isViverInboundAckRow(ack));
  assert(!isViverInboundAckRow(ai));
  assert(!isViverInboundAckRow({ sender_type: "ai", mensagem: VIVER_INBOUND_ACK_TEXT }));
  assertEquals(pickLastNonAckOut([ack, ai])?.id, "b");
  assertEquals(pickLastNonAckOut([ack]), null);
});

function dbFor(extra: Partial<Record<string, Row[]>> = {}) {
  return stubDb({
    orbit_ai_config: [{ empresa_id: VIVER, modo_automatico: true, ai_reply_debounce: { immediate_outbox_dispatch: true } }],
    orbit_conversas: [{ id: CONV, empresa_id: VIVER, human_talk: false, status: "ativa" }],
    orbit_mensagens: [
      { id: "out-1", empresa_id: VIVER, conversa_id: CONV, direcao: "OUT", sender_type: "ai", mensagem: "x", timestamp: iso(T0 - 3600_000) },
      { id: INB, empresa_id: VIVER, conversa_id: CONV, direcao: "IN", sender_type: "lead", mensagem: "oi", timestamp: iso(T0) },
    ],
    orbit_meetings: [],
    ...extra,
  } as any);
}

const input = (over: Record<string, unknown> = {}) => ({
  empresa_id: VIVER,
  conversa: { id: CONV },
  prospect: { id: PROS, empresa_id: VIVER },
  inbound_message_id: INB,
  inbound_at: iso(T0),
  telefone: "5500000000000",
  from_me: false,
  automation_allowed: true,
  conversa_quarantined: false,
  reply_expected: true,
  controlled_reengagement: false,
  received_at_ms: T0,
  ...over,
});

function fakeOutbox() {
  const keys = new Map<string, string>();
  const calls: any[] = [];
  return {
    calls,
    enqueue: async (i: any) => {
      calls.push(i);
      const key = `${i.idempotency_scope}:|${i.source_type}|${i.empresa_id}|${i.prospect_id}|${i.source_id}`;
      if (keys.has(key)) return { enqueued: false, outbox_id: keys.get(key), reason: "duplicate" };
      const id = crypto.randomUUID();
      keys.set(key, id);
      return { enqueued: true, outbox_id: id };
    },
  };
}

Deno.test("produtor: enfileira pelo outbox com texto aprovado, sem inbound na chave, e dispara kick", async () => {
  const ob = fakeOutbox();
  let kicks = 0;
  const tel = await maybeSendViverInboundAck(dbFor() as any, input(), {
    enqueue: ob.enqueue,
    kick: async () => (kicks++, { attempted: true, ok: true, outcome: "sent" }),
    now: () => T0 + 6_000,
  });
  assertEquals(tel.decision, "eligible");
  assertEquals(tel.enqueued, true);
  assertEquals(kicks, 1);
  assertEquals(tel.within_target_at_kick_return, true);
  const e = ob.calls[0];
  assertEquals(e.source_type, "ai_reply");
  assertEquals(e.payload.mensagem, VIVER_INBOUND_ACK_TEXT);
  assertEquals(e.inbound_message_id, undefined); // chave por burst, não por inbound
  assertEquals(e.metadata.inbound_message_id, INB);
  assertEquals(e.metadata.viver_inbound_ack, true);
  assertEquals(e.idempotency_scope, buildAckIdempotencyScope(CONV, "out-1"));
});

Deno.test("burst: várias inbounds antes da resposta geram UMA confirmação", async () => {
  const ob = fakeOutbox();
  let kicks = 0;
  const deps = { enqueue: ob.enqueue, kick: async () => (kicks++, { ok: true, outcome: "sent" }), now: () => T0 + 1000 };
  const db = dbFor();
  const results = await Promise.all([
    maybeSendViverInboundAck(db as any, input(), deps),
    maybeSendViverInboundAck(db as any, input({ inbound_message_id: "44444444-4444-4444-8444-444444444444", inbound_at: iso(T0 + 2000) }), deps),
    maybeSendViverInboundAck(db as any, input({ inbound_message_id: "55555555-5555-4555-8555-555555555555", inbound_at: iso(T0 + 3000) }), deps),
  ]);
  assertEquals(results.filter((r) => r.enqueued).length, 1);
  assertEquals(results.filter((r) => r.enqueue_reason === "duplicate").length, 2);
  assertEquals(kicks, 1);
});

Deno.test("confirmação anterior do burst não muda a âncora (sem nova confirmação)", async () => {
  const ob = fakeOutbox();
  const db1 = dbFor();
  await maybeSendViverInboundAck(db1 as any, input(), { enqueue: ob.enqueue, kick: async () => ({}), now: () => T0 });
  const db2 = dbFor({
    orbit_mensagens: [
      { id: "out-1", empresa_id: VIVER, conversa_id: CONV, direcao: "OUT", sender_type: "ai", mensagem: "x", timestamp: iso(T0 - 3600_000) },
      { id: INB, empresa_id: VIVER, conversa_id: CONV, direcao: "IN", sender_type: "lead", mensagem: "oi", timestamp: iso(T0) },
      { id: "ack-1", empresa_id: VIVER, conversa_id: CONV, direcao: "OUT", sender_type: "system", mensagem: VIVER_INBOUND_ACK_TEXT, timestamp: iso(T0 + 5000) },
    ],
  });
  const tel = await maybeSendViverInboundAck(db2 as any, input({ inbound_message_id: "66666666-6666-4666-8666-666666666666", inbound_at: iso(T0 + 8000) }), { enqueue: ob.enqueue, kick: async () => ({}), now: () => T0 + 9000 });
  assertEquals(tel.enqueue_reason, "duplicate");
});

Deno.test("nunca após resposta já enviada", async () => {
  const ob = fakeOutbox();
  const db = dbFor({
    orbit_mensagens: [
      { id: INB, empresa_id: VIVER, conversa_id: CONV, direcao: "IN", sender_type: "lead", timestamp: iso(T0) },
      { id: "r", empresa_id: VIVER, conversa_id: CONV, direcao: "OUT", sender_type: "ai", mensagem: "resposta", timestamp: iso(T0 + 5000) },
    ],
  });
  const tel = await maybeSendViverInboundAck(db as any, input(), { enqueue: ob.enqueue, kick: async () => ({}), now: () => T0 + 6000 });
  assertEquals(tel.decision, "reply_already_sent");
  assertEquals(ob.calls.length, 0);
});

Deno.test("humano, reunião futura e outro tenant nunca enfileiram", async () => {
  const ob = fakeOutbox();
  const deps = { enqueue: ob.enqueue, kick: async () => ({}), now: () => T0 };
  const human = dbFor({ orbit_conversas: [{ id: CONV, empresa_id: VIVER, human_talk: false, human_user_id: "u" }] });
  assertEquals((await maybeSendViverInboundAck(human as any, input(), deps)).decision, "human_owner");
  const meet = dbFor({ orbit_meetings: [{ id: "m", empresa_id: VIVER, prospect_id: PROS, scheduled_at: iso(T0 + 86400_000), status: "scheduled" }] });
  assertEquals((await maybeSendViverInboundAck(meet as any, input(), deps)).decision, "future_meeting");
  assertEquals((await maybeSendViverInboundAck(dbFor() as any, input({ empresa_id: OTHER }), deps)).decision, "not_viver_tenant");
  assertEquals(ob.calls.length, 0);
});

Deno.test("erro: consulta falha fecha; enqueue que lança não propaga", async () => {
  const ob = fakeOutbox();
  const failing = stubDb({ orbit_ai_config: [{ empresa_id: VIVER, modo_automatico: true, ai_reply_debounce: { immediate_outbox_dispatch: true } }] }, { failTable: "orbit_meetings" });
  const t1 = await maybeSendViverInboundAck(failing as any, input(), { enqueue: ob.enqueue, kick: async () => ({}), now: () => T0 });
  assertEquals(t1.decision, "evidence_query_failed");
  const t2 = await maybeSendViverInboundAck(dbFor() as any, input(), {
    enqueue: async () => { throw new Error("boom"); },
    kick: async () => ({}),
    now: () => T0,
  });
  assert(t2.decision.startsWith("ack_failed"));
});

Deno.test("kick lento/sem envio: telemetria honesta (fora da meta)", async () => {
  const ob = fakeOutbox();
  const tel = await maybeSendViverInboundAck(dbFor() as any, input(), {
    enqueue: ob.enqueue,
    kick: async () => ({ attempted: true, ok: true, outcome: "deferred", deferred: true }),
    now: () => T0 + 12_000,
  });
  assertEquals(tel.within_target_at_kick_return, false);
  assertEquals(tel.kick_ms, 12_000);
});

Deno.test("worker: revalidação no envio (stale, corrida com resposta completa, reunião, erro)", () => {
  const base = { item_created_at: iso(T0), now_ms: T0 + 5000 };
  assertEquals(decideAckAtSend(base), null);
  assertEquals(decideAckAtSend({ ...base, now_ms: T0 + VIVER_INBOUND_ACK_MAX_AGE_MS + 1 }), "ack_stale");
  assertEquals(decideAckAtSend({ ...base, full_reply_sent_count: 1 }), "ack_superseded_by_reply");
  assertEquals(decideAckAtSend({ ...base, reply_after_inbound_count: 1 }), "ack_reply_already_sent");
  assertEquals(decideAckAtSend({ ...base, future_meeting_count: 1 }), "ack_future_meeting");
  assertEquals(decideAckAtSend({ ...base, query_error: "x" }), "ack_evidence_query_failed");
  assertEquals(decideAckAtSend({ ...base, item_created_at: null }), "ack_without_timestamp");
});

const ackItem = (over: Row = {}) => ({
  id: "ack-item", empresa_id: VIVER, conversa_id: CONV, prospect_id: PROS, source_type: "ai_reply",
  created_at: iso(T0 + 1000),
  metadata: { viver_inbound_ack: true, inbound_message_id: INB, inbound_at: iso(T0) },
  ...over,
});

Deno.test("worker: resposta completa já em envio cancela a confirmação", async () => {
  const db = stubDb({
    orbit_mensagens: [],
    orbit_meetings: [],
    orbit_whatsapp_outbox: [
      { id: "full", empresa_id: VIVER, conversa_id: CONV, source_type: "ai_reply", status: "processing", created_at: iso(T0 + 30_000), metadata: { inbound_message_id: INB } },
    ],
  });
  assertEquals(await viverInboundAckSendBlockReason(db as any, ackItem(), T0 + 31_000), "ack_superseded_by_reply");
  const clean = stubDb({ orbit_mensagens: [], orbit_meetings: [], orbit_whatsapp_outbox: [] });
  assertEquals(await viverInboundAckSendBlockReason(clean as any, ackItem(), T0 + 6000), null);
  // Item comum (não confirmação) nunca é afetado por este gate.
  assertEquals(await viverInboundAckSendBlockReason(clean as any, ackItem({ metadata: { inbound_message_id: INB } }), T0), null);
  const failing = stubDb({}, { failTable: "orbit_meetings" });
  assertEquals(await viverInboundAckSendBlockReason(failing as any, ackItem(), T0 + 6000), "ack_evidence_query_failed");
});

Deno.test("limites: confirmação não consome reserva, espaçamento nem max_per_minute", async () => {
  const item = ackItem();
  assert(isViverInboundAckItem(item));
  assert(!isViverInboundAckItem({ ...item, empresa_id: OTHER }));
  assertEquals(isEngagedReserveCandidate(item as any), false);
  // max_per_minute=1 só se aplica a prospecção (campaign/flow_*).
  assertEquals(consumesProspectingQuota("ai_reply"), false);
  assertEquals(consumesProspectingQuota("campaign"), true);

  const db = stubDb({
    orbit_whatsapp_outbox: [
      { id: "ack-item", empresa_id: VIVER, conversa_id: CONV, source_type: "ai_reply", status: "sent", sent_at: iso(T0 + 7000), metadata: { viver_inbound_ack: true, inbound_message_id: INB } },
      { id: "old", empresa_id: VIVER, conversa_id: CONV, source_type: "ai_reply", status: "sent", sent_at: iso(T0 - 3600_000), metadata: { inbound_message_id: "x" } },
    ],
  });
  // Espaçamento por conversa mede a última resposta REAL, não a confirmação.
  assertEquals(await lastEngagedReplySentAt(db as any, VIVER, CONV), iso(T0 - 3600_000));
  // A confirmação não conta como "inbound já respondida" para a resposta completa.
  const full = { id: "full", empresa_id: VIVER, conversa_id: CONV, source_type: "ai_reply", metadata: { inbound_message_id: INB } };
  assertEquals(await inboundAlreadyAnswered(db as any, full as any, INB), false);
});
