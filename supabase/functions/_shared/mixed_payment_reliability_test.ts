// Confiabilidade do handoff de Pagamento Misto (SOMENTE Bullink por config tenant-scoped).
//
// Cobre os testes L–Q exigidos na revisão:
//  L) falha no enqueue → estado recuperável; human_talk NÃO trava a confirmação; retry enfileira uma vez
//  M) enqueue ok + falha na notificação → confirmação não duplica; retry só notifica e marca sent
//  N) mixed_payment_confirmation com human_talk=true → elegível; ai_reply normal permanece bloqueado
//  O) duas execuções concorrentes do mesmo inbound → exatamente um outbox e uma notificação
//  P) frase nova sem autoapresentação e sem falsa promessa de ação futura
//  Q) nenhum bypass em outros tenants (config default off) e nenhuma mensagem histórica reprocessada
//
// Zero Z-API real, zero rede, zero mutação de banco.
//
// Rodar: deno test --allow-net --allow-env supabase/functions/_shared/mixed_payment_reliability_test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  MIXED_PAYMENT_CONFIRMATION_SOURCE,
  MIXED_PAYMENT_DEFAULT_CONFIRMATION,
  buildMixedPaymentClaim,
  decideMixedPaymentNextStep,
  mergeMixedPaymentState,
  mixedPaymentIdempotencyKey,
  readMixedPaymentHandoffConfig,
  readMixedPaymentState,
} from "./mixed-payment-handoff.ts";
import { checkEligibility, type OutboxContext } from "./orbit-whatsapp-outbox.ts";

const EMP = "4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18"; // Bullink
const OTHER = "empresa-outra";
const CONV = "conv-1";
const INBOUND = "in-1";

// ── Simulador de banco: apenas o necessário (ai_contexto + tabela outbox com unique key) ──
function makeState() {
  let ctx: Record<string, unknown> = {};
  const outbox: Array<{ id: string; key: string }> = [];
  let notifications = 0;
  return {
    get ctx() { return ctx; },
    state() { return readMixedPaymentState(ctx); },
    claim(inbound: string) {
      if (ctx.mixed_payment_handoff) return false; // claim condicional (uma vez só)
      ctx = { ...ctx, estado: "handoff", mixed_payment_handoff: buildMixedPaymentClaim(inbound) };
      return true;
    },
    persist(patch: Record<string, string>) {
      ctx = { ...ctx, mixed_payment_handoff: mergeMixedPaymentState(ctx, patch) };
    },
    enqueue(key: string, fail = false): { ok: boolean; id: string | null; duplicate: boolean } {
      if (fail) return { ok: false, id: null, duplicate: false };
      const found = outbox.find((o) => o.key === key);
      if (found) return { ok: true, id: found.id, duplicate: true };
      const id = `ob-${outbox.length + 1}`;
      outbox.push({ id, key });
      return { ok: true, id, duplicate: false };
    },
    notify(fail = false) { if (fail) return false; notifications += 1; return true; },
    get outboxCount() { return outbox.length; },
    get notifications() { return notifications; },
  };
}

/** Réplica fiel da ordem de etapas do orquestrador em orbit-ai-agent. */
function runStep(db: ReturnType<typeof makeState>, opts: { enqueueFails?: boolean; notifyFails?: boolean } = {}) {
  if (db.state().handled) return "already_handled";
  if (!db.state().claimed && !db.claim(INBOUND)) return "claim_lost";

  const key = mixedPaymentIdempotencyKey(EMP, CONV, INBOUND);
  if (decideMixedPaymentNextStep(db.state()) === "enqueue_confirmation") {
    const r = db.enqueue(key, opts.enqueueFails);
    if (!r.ok) return "enqueue_failed_recoverable";
    db.persist({ confirmation_outbox_id: r.id!, confirmation_enqueued_at: new Date().toISOString() });
  }
  if (decideMixedPaymentNextStep(db.state()) === "set_human_talk") {
    db.persist({ human_talk_set_at: new Date().toISOString() });
  }
  if (decideMixedPaymentNextStep(db.state()) === "notify") {
    if (!db.notify(opts.notifyFails)) return "notify_failed_recoverable";
    db.persist({ notification_sent_at: new Date().toISOString() });
  }
  return "done";
}

Deno.test("L. falha no enqueue → recuperável; sem human_talk e sem notificação; retry enfileira uma única vez", () => {
  const db = makeState();
  assertEquals(runStep(db, { enqueueFails: true }), "enqueue_failed_recoverable");
  assertEquals(db.outboxCount, 0);
  assertEquals(db.state().human_talk_set_at, null, "posse humana não pode preceder a confirmação");
  assertEquals(db.notifications, 0);
  assertEquals(db.state().handled, false);

  // Retry: retoma exatamente na etapa de enqueue.
  assertEquals(runStep(db), "done");
  assertEquals(db.outboxCount, 1);
  assertEquals(db.notifications, 1);
  assert(db.state().handled);

  // Terceira execução do mesmo inbound: nada novo.
  assertEquals(runStep(db), "already_handled");
  assertEquals(db.outboxCount, 1);
  assertEquals(db.notifications, 1);
});

Deno.test("M. enqueue ok + notificação falha → confirmação não duplica; retry só notifica", () => {
  const db = makeState();
  assertEquals(runStep(db, { notifyFails: true }), "notify_failed_recoverable");
  assertEquals(db.outboxCount, 1);
  assert(db.state().confirmation_enqueued_at, "confirmação deve estar durável");
  assert(db.state().human_talk_set_at, "posse humana já assumida");
  assertEquals(db.state().notification_sent_at, null, "notified nunca antes do sucesso");
  assertEquals(db.state().handled, false);

  assertEquals(runStep(db), "done");
  assertEquals(db.outboxCount, 1, "não duplica confirmação no retry");
  assertEquals(db.notifications, 1);
  assert(db.state().notification_sent_at);
});

// ── N: gate real de posse humana (código compartilhado usado no enqueue e no worker) ──
function makeSupabase(conversa: any) {
  const rows: Record<string, any[]> = {
    orbit_prospects: [{ id: "p1", empresa_id: EMP, optout_whatsapp: false, deleted_at: null }],
    orbit_conversas: [conversa],
    orbit_ai_config: [{ empresa_id: EMP, auto_reply_new_leads_from: null }],
    orbit_deals: [],
    orbit_pipeline_stages: [],
    orbit_meetings: [],
    orbit_mensagens: [],
  };
  function query(table: string) {
    const filters: Array<[string, any]> = [];
    const api: any = {
      select: () => api,
      eq: (c: string, v: any) => { filters.push([c, v]); return api; },
      in: () => api,
      gte: () => api,
      limit: () => api,
      order: () => api,
      maybeSingle: () => Promise.resolve({ data: (rows[table] ?? []).find(match) ?? null, error: null }),
    };
    api.then = (resolve: any) => resolve({ data: (rows[table] ?? []).filter(match), error: null });
    function match(r: any) { return filters.every(([c, v]) => r[c] === v); }
    return api;
  }
  return { from: (t: string) => query(t) };
}

const humanConversa = { id: CONV, empresa_id: EMP, human_talk: true, human_user_id: null, handoff_sent_at: null, prospect_id: "p1" };

function ctxFor(source: OutboxContext["source_type"]): OutboxContext {
  return {
    empresa_id: EMP,
    source_type: source,
    prospect_id: "p1",
    conversa_id: CONV,
    inbound_message_id: INBOUND,
  } as OutboxContext;
}

Deno.test("N. human_talk=true → mixed_payment_confirmation elegível, ai_reply normal bloqueado", async () => {
  const sb = makeSupabase(humanConversa) as any;
  const conf = await checkEligibility(sb, ctxFor(MIXED_PAYMENT_CONFIRMATION_SOURCE));
  assert(conf.eligible, `confirmação deve passar; reasons=${conf.reasons.join(",")}`);

  const ai = await checkEligibility(sb, ctxFor("ai_reply"));
  assertEquals(ai.eligible, false);
  assert(ai.reasons.includes("human_handoff"), `esperado human_handoff, veio ${ai.reasons.join(",")}`);
});

Deno.test("O. duas execuções concorrentes do mesmo inbound → 1 outbox e 1 notificação", () => {
  const db = makeState();
  // Execução A faz o claim; execução B perde o claim e não duplica nada.
  assert(db.claim(INBOUND));
  assertEquals(db.claim(INBOUND), false);
  assertEquals(runStep(db), "done");
  assertEquals(runStep(db), "already_handled");
  assertEquals(db.outboxCount, 1);
  assertEquals(db.notifications, 1);

  // Chave de idempotência é determinística para o mesmo inbound.
  assertEquals(
    mixedPaymentIdempotencyKey(EMP, CONV, INBOUND),
    mixedPaymentIdempotencyKey(EMP, CONV, INBOUND),
  );
});

Deno.test("P. frase de confirmação: sem autoapresentação, sem condições e sem falsa promessa", () => {
  const t = MIXED_PAYMENT_DEFAULT_CONFIRMATION;
  assert(/uma parte no PIX/i.test(t) && /restante no cart/i.test(t), t);
  assert(/sigo com você por aqui/i.test(t), t);
  for (const proibido of [/te chamo/i, /aqui é o fernando/i, /eu sou o fernando/i, /me chamo/i, /especialista/i, /equipe/i, /vou encaminhar/i, /entrada/i, /desconto/i, /parcelas/i, /link/i, /chave pix/i]) {
    assertEquals(proibido.test(t), false, `frase não deve conter ${proibido}`);
  }
  assert(t.length < 200, "confirmação deve ser curta");
});

Deno.test("Q. tenant-scoped: default off preserva outros tenants e nada histórico é reprocessado", () => {
  assertEquals(readMixedPaymentHandoffConfig({} as any), null);
  assertEquals(readMixedPaymentHandoffConfig({ mixed_payment_handoff: false } as any), null);
  assertEquals(readMixedPaymentHandoffConfig({ empresa_id: OTHER } as any), null);
  assert(readMixedPaymentHandoffConfig({ mixed_payment_handoff: true } as any), "tenant habilitado deve ativar");

  // Estado v1 legado (ciclo antigo já encerrado) nunca é reaberto/reprocessado.
  const legacy = readMixedPaymentState({ mixed_payment_handoff: { handled: true, notified: true, at: "2026-08-15T00:00:00Z" } });
  assert(legacy.handled);
  assertEquals(decideMixedPaymentNextStep(legacy), "done");
});
