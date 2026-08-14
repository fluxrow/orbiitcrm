import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  decideImmediateKick,
  kickOutboxDispatch,
  readImmediateOutboxDispatchFlag,
} from "./immediate-outbox-dispatch.ts";

const NOW = Date.parse("2026-08-14T12:00:00.000Z");
const OUTBOX_ID = "9f6b4a18-f3aa-4bfb-a13f-926e4a07ad18";
const BULLINK = "4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18";
const enqueued = { enqueued: true, outbox_id: OUTBOX_ID };

Deno.test("flag ausente/off => legado (sem kick)", () => {
  for (const cfg of [
    null,
    undefined,
    {},
    { ai_reply_debounce: null },
    { ai_reply_debounce: { enabled: true } },
    { ai_reply_debounce: { enabled: true, immediate_outbox_dispatch: false } },
    { ai_reply_debounce: { immediate_outbox_dispatch: "true" } },
  ]) {
    assertEquals(readImmediateOutboxDispatchFlag(cfg as any), false);
    const d = decideImmediateKick({
      flagEnabled: readImmediateOutboxDispatchFlag(cfg as any),
      sourceType: "ai_reply",
      payloadType: "text",
      routed: enqueued,
      nowMs: NOW,
    });
    assertEquals(d.kick, false);
    assertEquals((d as any).reason, "flag_off");
  }
});

Deno.test("Bullink flag on + enqueue de texto ai_reply => 1 kick dirigido", () => {
  const flagEnabled = readImmediateOutboxDispatchFlag({
    ai_reply_debounce: { enabled: true, wait_ms: 20000, immediate_outbox_dispatch: true },
  });
  assertEquals(flagEnabled, true);
  const d = decideImmediateKick({
    flagEnabled,
    sourceType: "ai_reply",
    payloadType: "text",
    routed: enqueued,
    nowMs: NOW,
  });
  assertEquals(d, { kick: true, outboxId: OUTBOX_ID });
});

Deno.test("duplicate/não enfileirado/sem outbox_id => zero kick", () => {
  const base = { flagEnabled: true, sourceType: "ai_reply", payloadType: "text", nowMs: NOW } as const;
  assertEquals(
    decideImmediateKick({ ...base, routed: { enqueued: false, reason: "duplicate", outbox_id: OUTBOX_ID } }),
    { kick: false, reason: "not_enqueued" },
  );
  assertEquals(
    decideImmediateKick({ ...base, routed: { enqueued: false, reason: "human_handoff" } }),
    { kick: false, reason: "not_enqueued" },
  );
  assertEquals(
    decideImmediateKick({ ...base, routed: { enqueued: true, outbox_id: null } }),
    { kick: false, reason: "missing_outbox_id" },
  );
  assertEquals(decideImmediateKick({ ...base, routed: null }), { kick: false, reason: "not_enqueued" });
});

Deno.test("sources não elegíveis nunca kickam", () => {
  for (const source of ["flow_initial", "flow_followup", "campaign", "notification", "manual", "flow_stage", null]) {
    const d = decideImmediateKick({
      flagEnabled: true,
      sourceType: source,
      payloadType: "text",
      routed: enqueued,
      nowMs: NOW,
    });
    assertEquals(d, { kick: false, reason: "source_not_eligible" }, String(source));
  }
});

Deno.test("payload não texto (áudio/imagem) não kicka", () => {
  for (const p of ["audio", "image", "document", null]) {
    const d = decideImmediateKick({
      flagEnabled: true,
      sourceType: "ai_reply",
      payloadType: p,
      routed: enqueued,
      nowMs: NOW,
    });
    assertEquals(d, { kick: false, reason: "payload_not_eligible" }, String(p));
  }
});

Deno.test("hold futuro e scheduled_for futuro não antecipam envio", () => {
  const base = { flagEnabled: true, sourceType: "ai_reply", payloadType: "text", routed: enqueued, nowMs: NOW } as const;
  assertEquals(
    decideImmediateKick({ ...base, holdUntil: "2026-08-14T12:30:00.000Z" }),
    { kick: false, reason: "hold_until_future" },
  );
  assertEquals(
    decideImmediateKick({ ...base, scheduledFor: "2026-08-14T12:00:01.000Z" }),
    { kick: false, reason: "scheduled_for_future" },
  );
  // hold no passado ou inválido não bloqueia
  assertEquals(decideImmediateKick({ ...base, holdUntil: "2026-08-14T11:59:59.000Z" }).kick, true);
  assertEquals(decideImmediateKick({ ...base, holdUntil: "amanhã" }).kick, true);
  assertEquals(decideImmediateKick({ ...base, scheduledFor: null }).kick, true);
});

Deno.test("kick usa somente o worker no modo dirigido (nenhuma Z-API)", async () => {
  const calls: Array<{ url: string; body: any; auth: string | null }> = [];
  const fetchImpl = ((url: string, init: any) => {
    calls.push({
      url: String(url),
      body: JSON.parse(String(init.body)),
      auth: init.headers?.Authorization ?? null,
    });
    return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  }) as unknown as typeof fetch;

  const r = await kickOutboxDispatch(
    { outboxId: OUTBOX_ID, empresaId: BULLINK },
    { functionsBase: "https://x.functions/v1", cronToken: "tok", fetchImpl },
  );
  assertEquals(r.ok, true);
  assertEquals(calls.length, 1);
  assertEquals(calls[0].url, "https://x.functions/v1/orbit-whatsapp-outbox-tick");
  assertEquals(calls[0].body, { outbox_id: OUTBOX_ID, empresa_id: BULLINK });
  assertEquals(calls[0].auth, "Bearer tok");
  assertEquals(calls.some((c) => /z-api|zapi/i.test(c.url)), false);
});

Deno.test("erro/timeout no kick é fail-safe (mantém pending)", async () => {
  const boom = (() => Promise.reject(new Error("network down"))) as unknown as typeof fetch;
  const r = await kickOutboxDispatch(
    { outboxId: OUTBOX_ID, empresaId: BULLINK },
    { functionsBase: "https://x.functions/v1", cronToken: "tok", fetchImpl: boom },
  );
  assertEquals(r.attempted, true);
  assertEquals(r.ok, false);
  assertEquals(r.error?.includes("network down"), true);

  const failing = (() =>
    Promise.resolve(new Response("nope", { status: 500 }))) as unknown as typeof fetch;
  const r2 = await kickOutboxDispatch(
    { outboxId: OUTBOX_ID, empresaId: BULLINK },
    { functionsBase: "https://x.functions/v1", cronToken: "tok", fetchImpl: failing },
  );
  assertEquals(r2.ok, false);
  assertEquals(r2.status, 500);
});

Deno.test("sem SCHEDULER_CRON_TOKEN não há chamada alguma", async () => {
  let called = 0;
  const fetchImpl = (() => {
    called++;
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as unknown as typeof fetch;
  const r = await kickOutboxDispatch(
    { outboxId: OUTBOX_ID, empresaId: BULLINK },
    { functionsBase: "https://x.functions/v1", cronToken: "", fetchImpl },
  );
  assertEquals(r, { attempted: false, ok: false, error: "missing_cron_token" });
  assertEquals(called, 0);
});
