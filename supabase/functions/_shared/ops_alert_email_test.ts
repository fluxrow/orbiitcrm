// Testes do canal operacional de alerta (E-MAIL). Nenhum envio real.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildOpsAlertEmail,
  maskInstanceId,
  OPS_ALERT_CHANNEL,
  OPS_ALERT_PENDING_ERROR,
  OPS_ALERT_TELEGRAM_ENABLED,
  ORBIT_OPS_ALERT_EMAIL_DEFAULT,
  opsAlertIdempotencyKey,
  resolveOpsAlertRecipient,
  sendOpsOfflineAlert,
} from "./zapi-ops-alert.ts";
import { selectDrainable } from "./ops-alert-drain.ts";

const EVENT = {
  empresa_id: "fa0ac793-5c5a-43c6-b4c2-eacc276d0d67",
  empresa_nome: "Fabrica de Pesquisadores",
  instance_id: "3F14C72DA496E1A015DD0E5C90DD1B0B",
  reason: "You are not connected. token/ABCDEF0123456789ABCDEF01",
  event_type: "session-disconnected",
  status_code: null,
  event_id: "2be166ca-7c9a-4dad-b30c-0fcf98c8a51d",
  occurred_at: "2026-08-13T12:30:06.990Z",
};

// A) Nenhum fallback Telegram
Deno.test("A: canal é e-mail e Telegram está desativado", () => {
  assertEquals(OPS_ALERT_CHANNEL, "email");
  assertEquals(OPS_ALERT_TELEGRAM_ENABLED, false);
  const mail = buildOpsAlertEmail(EVENT);
  assert(!/telegram/i.test(mail.text + mail.html));
});

// B) Destinatário master
Deno.test("B: destinatário master padrão e override por secret", () => {
  assertEquals(ORBIT_OPS_ALERT_EMAIL_DEFAULT, "fbcfarias@icloud.com");
  assertEquals(resolveOpsAlertRecipient(() => undefined), "fbcfarias@icloud.com");
  assertEquals(resolveOpsAlertRecipient(() => " ops@fluxrow.pro "), "ops@fluxrow.pro");
});

// C) Payload sanitizado e completo
Deno.test("C: payload contém campos exigidos e não expõe token", () => {
  const mail = buildOpsAlertEmail(EVENT);
  for (const needle of [
    "Fabrica de Pesquisadores",
    "session-disconnected",
    "2026-08-13T12:30:06.990Z",
    EVENT.event_id,
    maskInstanceId(EVENT.instance_id),
  ]) assert(mail.text.includes(needle), `faltou: ${needle}`);
  assert(!mail.text.includes("ABCDEF0123456789ABCDEF01"));
  assert(!mail.text.includes(EVENT.instance_id));
  assert(maskInstanceId(EVENT.instance_id).includes("…"));
});

// D) Idempotência estável por event id
Deno.test("D: idempotency key é estável e derivada do event id", () => {
  assertEquals(opsAlertIdempotencyKey(EVENT), `zapi-ops-alert:${EVENT.event_id}`);
  assertEquals(opsAlertIdempotencyKey(EVENT), opsAlertIdempotencyKey({ ...EVENT }));
  assert(opsAlertIdempotencyKey({ ...EVENT, event_id: null }).startsWith("zapi-ops-alert:"));
});

// ── Stubs ──
function stubSupabase(opts: { alertSent?: boolean; apiKey?: string | null }) {
  return {
    from(table: string) {
      const api: any = {
        select: () => api,
        is: () => api,
        eq: () => api,
        maybeSingle: async () => {
          if (table === "orbit_zapi_status_events") {
            return { data: { alert_sent: opts.alertSent === true, alert_provider_message_id: "msg_prev" } };
          }
          if (table === "orbit_resend_config") return { data: { api_key: opts.apiKey ?? null } };
          return { data: { nome: "Fabrica de Pesquisadores" } };
        },
      };
      return api;
    },
  };
}

function stubFetch(status: number, body: unknown) {
  const calls: Array<{ url: string; init: any }> = [];
  const original = globalThis.fetch;
  globalThis.fetch = ((url: any, init: any) => {
    calls.push({ url: String(url), init });
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  }) as any;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

// E) Sucesso marca enviado com provider id
Deno.test("E: resposta aceita do provedor retorna sent + provider_message_id", async () => {
  const f = stubFetch(200, { id: "re_123456789" });
  try {
    const res = await sendOpsOfflineAlert(stubSupabase({ apiKey: "re_test_key" }), EVENT);
    assertEquals(res.sent, true);
    assertEquals(res.channel, "email");
    assertEquals(res.provider, "resend");
    assertEquals(res.provider_message_id, "re_123456789");
    assertEquals(res.recipient, "fbcfarias@icloud.com");
    assertEquals(f.calls.length, 1);
    assertEquals(f.calls[0].url, "https://api.resend.com/emails");
    assertEquals(f.calls[0].init.headers["Idempotency-Key"], `zapi-ops-alert:${EVENT.event_id}`);
    const body = JSON.parse(f.calls[0].init.body);
    assertEquals(body.to, ["fbcfarias@icloud.com"]);
    assert(!JSON.stringify(body).includes("ABCDEF0123456789ABCDEF01"));
  } finally {
    f.restore();
  }
});

// F) Falha preserva pendente
Deno.test("F: falha do provedor não marca enviado", async () => {
  const f = stubFetch(422, { message: "domain not verified" });
  try {
    const res = await sendOpsOfflineAlert(stubSupabase({ apiKey: "re_test_key" }), EVENT);
    assertEquals(res.sent, false);
    assert(res.error!.startsWith("alert_email_failed_422"));
  } finally {
    f.restore();
  }
});

Deno.test("F2: provedor não configurado mantém pendente auditável", async () => {
  const f = stubFetch(200, { id: "nao-deveria-enviar" });
  try {
    const res = await sendOpsOfflineAlert(stubSupabase({ apiKey: null }), EVENT);
    assertEquals(res.sent, false);
    assertEquals(res.pending, true);
    assertEquals(res.error, OPS_ALERT_PENDING_ERROR);
    assertEquals(f.calls.length, 0);
  } finally {
    f.restore();
  }
});

// G) Idempotência: evento já enviado não reenvia
Deno.test("G: evento já alertado não dispara novo e-mail", async () => {
  const f = stubFetch(200, { id: "re_novo" });
  try {
    const res = await sendOpsOfflineAlert(stubSupabase({ apiKey: "re_test_key", alertSent: true }), EVENT);
    assertEquals(res.sent, true);
    assertEquals(res.provider_message_id, "msg_prev");
    assertEquals(f.calls.length, 0);
  } finally {
    f.restore();
  }
});

// H) Dreno de pendências
Deno.test("H: dreno seleciona apenas eventos não enviados", () => {
  const rows = [
    { id: "1", alert_sent: false } as any,
    { id: "2", alert_sent: true } as any,
    { id: "3", alert_sent: null } as any,
  ];
  assertEquals(selectDrainable(rows).map((r) => r.id), ["1", "3"]);
  assertEquals(selectDrainable(null).length, 0);
});
