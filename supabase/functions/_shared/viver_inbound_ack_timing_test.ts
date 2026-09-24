import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildProducerLatencyLog, buildWorkerLatencyLog, markAck, getAckMarks, short8 } from "./viver-inbound-ack-timing.ts";
import { maybeSendViverInboundAck, VIVER_INBOUND_ACK_EMPRESA_ID as V, VIVER_INBOUND_ACK_TEXT } from "./viver-inbound-ack.ts";

const FULL = "11111111-2222-3333-4444-555555555555";
const PHONE = "5511987654321";
const FORBIDDEN = [FULL, PHONE, VIVER_INBOUND_ACK_TEXT, "Maria", "http", "token", V];
const noPii = (o: unknown) => { const j = JSON.stringify(o); for (const f of FORBIDDEN) assert(!j.includes(f), `vazou ${f}`); };

Deno.test("short8 trunca e sanitiza", () => { assertEquals(short8(FULL), "11111111"); assertEquals(short8(null), null); });

Deno.test("producer log: fases, total e sem PII", () => {
  const r = buildProducerLatencyLog({ webhook_received_perf: 0, marks: { ack_start: 100, precheck_done: 900, decision_done: 901, enqueue_done: 3000, kick_done: 9000 },
    decision: "eligible", enqueued: true, outbox_id: FULL, inbound_message_id: FULL, kick_outcome: "sent", target_ms: 10000 });
  assertEquals([r.webhook_to_ack_start_ms, r.precheck_ms, r.decision_ms, r.enqueue_ms, r.kick_ms, r.total_ms], [100, 800, 1, 2099, 6000, 9000]);
  assertEquals(r.within_target, true); assertEquals(r.outbox, "11111111"); noPii(r);
});

Deno.test("worker marks: noop para itens não-ack; log sem PII", () => {
  const other = { id: FULL, empresa_id: V, source_type: "ai_reply", metadata: {} };
  markAck(other, "process_start"); assertEquals(getAckMarks(other), undefined);
  let t = 0; const perf = () => (t += 1000);
  const ack = { id: FULL, empresa_id: V, source_type: "ai_reply", created_at: new Date(0).toISOString(),
    payload: { mensagem: VIVER_INBOUND_ACK_TEXT, telefone: PHONE }, metadata: { viver_inbound_ack: true, inbound_message_id: FULL } };
  const before = JSON.stringify(ack);
  for (const k of ["claim_done", "process_start", "provider_start", "provider_done", "process_done"] as const) markAck(ack, k, perf);
  assertEquals(JSON.stringify(ack), before, "item não é mutado");
  const r = buildWorkerLatencyLog({ item: ack, mode: "directed", outcome: "sent", extra: { request_start: 0 }, now_wall_ms: 5000 });
  assertEquals([r.claim_ms, r.gates_ms, r.provider_ms, r.post_send_ms, r.total_ms, r.outbox_age_at_done_ms], [1000, 1000, 1000, 1000, 5000, 5000]);
  noPii(r);
});

function stub(tables: Record<string, any[]>) {
  const q = (t: string) => { const b: any = { select: () => b, eq: () => b, in: () => b, gt: () => b, gte: () => b, order: () => b, limit: () => b,
    maybeSingle: async () => ({ data: (tables[t] ?? [])[0] ?? null, error: null }),
    then: (res: any) => res({ data: tables[t] ?? [], error: null }) }; return b; };
  return { from: q };
}

Deno.test("marks não alteram decisão/enqueue do produtor", async () => {
  const db = stub({ orbit_ai_config: [{ modo_automatico: true, ai_reply_debounce: { immediate_outbox_dispatch: true } }],
    orbit_conversas: [{ id: FULL, empresa_id: V }], orbit_mensagens: [], orbit_meetings: [] });
  const input = { empresa_id: V, conversa: { id: FULL }, prospect: { id: FULL, empresa_id: V }, inbound_message_id: FULL,
    inbound_at: new Date().toISOString(), telefone: PHONE, from_me: false, automation_allowed: true, conversa_quarantined: false,
    reply_expected: true, controlled_reengagement: false, received_at_ms: Date.now() };
  const calls: any[] = [];
  const deps = { enqueue: async (i: any) => { calls.push(i); return { enqueued: true, outbox_id: FULL }; }, kick: async () => ({ outcome: "sent" }) };
  const a = await maybeSendViverInboundAck(db, input, deps);
  const b = await maybeSendViverInboundAck(db, input, { ...deps, perf: () => 42 });
  assertEquals(a.decision, "eligible"); assertEquals(b.decision, a.decision);
  assertEquals(JSON.stringify(calls[0]), JSON.stringify(calls[1]));
  assertEquals(calls[0].payload.mensagem, VIVER_INBOUND_ACK_TEXT);
  assert(a.marks?.kick_done != null);
  noPii(buildProducerLatencyLog({ marks: a.marks!, decision: a.decision, outbox_id: a.outbox_id, inbound_message_id: FULL, target_ms: 10000 }));
});
