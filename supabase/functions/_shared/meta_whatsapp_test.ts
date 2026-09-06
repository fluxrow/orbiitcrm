import {
  assert,
  assertEquals,
  assertMatch,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildMetaWhatsAppRequestBody,
  extractMetaPhoneNumberIds,
  isInsideMetaCustomerServiceWindow,
  isMetaPreActivationBacklog,
  META_WHATSAPP_BLOCK_CANARY,
  META_WHATSAPP_BLOCK_PROACTIVE,
  META_WHATSAPP_BLOCK_TEMPLATE_REQUIRED,
  metaMessageToOrbitPayload,
  metaWhatsAppSendBlockReason,
  type OrbitMetaWhatsAppRuntimeConfig,
  sendViaMetaWhatsApp,
  verifyMetaHmacSha256,
} from "./meta-whatsapp.ts";

const ready: OrbitMetaWhatsAppRuntimeConfig = {
  id: "cfg",
  empresa_id: "tenant",
  waba_id: "waba",
  phone_number_id: "123456789",
  graph_api_version: "v25.0",
  webhook_verify_token: "verify",
  access_token: "secret-token",
  app_secret: "app-secret",
  ativo: true,
  envio_real_liberado: false,
  canary_mode_enabled: true,
  canary_phone_numbers: ["5511999999999"],
  allow_proactive_messages: false,
  activated_at: null,
};

Deno.test("Meta send gate is fail-closed and only allows configured canary", () => {
  assertEquals(
    metaWhatsAppSendBlockReason(ready, "5511888888888", "ai_reply"),
    META_WHATSAPP_BLOCK_CANARY,
  );
  assertEquals(
    metaWhatsAppSendBlockReason(ready, "+55 (11) 99999-9999", "ai_reply"),
    null,
  );
  assertEquals(
    metaWhatsAppSendBlockReason(ready, "5511999999999", "campaign"),
    META_WHATSAPP_BLOCK_PROACTIVE,
  );
});

Deno.test("free-form text is allowed inside 24h and template required outside", () => {
  const inside = buildMetaWhatsAppRequestBody({
    phone: "5511999999999",
    message: "Olá",
    insideCustomerWindow: true,
  });
  assertEquals((inside.body as any)?.type, "text");

  const outside = buildMetaWhatsAppRequestBody({
    phone: "5511999999999",
    message: "Olá",
    insideCustomerWindow: false,
  });
  assertEquals(outside.error, META_WHATSAPP_BLOCK_TEMPLATE_REQUIRED);

  const template = buildMetaWhatsAppRequestBody({
    phone: "5511999999999",
    insideCustomerWindow: false,
    template: { name: "retomada_aprovada", language_code: "pt_BR" },
  });
  assertEquals((template.body as any)?.type, "template");
});

Deno.test("24h customer service window has exact boundary", () => {
  const now = new Date("2026-09-06T15:00:00.000Z");
  assertEquals(
    isInsideMetaCustomerServiceWindow("2026-09-05T15:00:00.000Z", now),
    true,
  );
  assertEquals(
    isInsideMetaCustomerServiceWindow("2026-09-05T14:59:59.999Z", now),
    false,
  );
});

Deno.test("provider switch never flushes pre-activation backlog", () => {
  assertEquals(
    isMetaPreActivationBacklog(
      "2026-09-06T13:00:00.000Z",
      "2026-09-06T14:00:00.000Z",
    ),
    true,
  );
  assertEquals(
    isMetaPreActivationBacklog(
      "2026-09-06T14:00:01.000Z",
      "2026-09-06T14:00:00.000Z",
    ),
    false,
  );
  assertEquals(isMetaPreActivationBacklog(null, null), true);
});

Deno.test("Meta webhook extracts phone id and maps text inbound", () => {
  const payload = {
    object: "whatsapp_business_account",
    entry: [{ changes: [{ value: { metadata: { phone_number_id: "123" } } }] }],
  };
  assertEquals(extractMetaPhoneNumberIds(payload), ["123"]);
  assertEquals(
    metaMessageToOrbitPayload(
      {
        id: "wamid.1",
        from: "5511999999999",
        timestamp: "1788700000",
        type: "text",
        text: { body: "Oi" },
      },
      "123",
    ),
    {
      instanceId: "123",
      phone: "5511999999999",
      messageId: "wamid.1",
      fromMe: false,
      fromApi: false,
      type: "ReceivedCallback",
      momment: 1788700000000,
      text: { message: "Oi" },
      provider: "meta_whatsapp",
    },
  );
});

Deno.test("Meta HMAC verifies raw payload and rejects tampering", async () => {
  const raw = '{"object":"whatsapp_business_account"}';
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode("app-secret"),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(raw)),
  );
  const hex = [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
  assert(await verifyMetaHmacSha256(raw, `sha256=${hex}`, "app-secret"));
  assertEquals(
    await verifyMetaHmacSha256(`${raw}x`, `sha256=${hex}`, "app-secret"),
    false,
  );
});

Deno.test("sender emits official Graph request without leaking token in URL or body", async () => {
  let seenUrl = "";
  let seenInit: RequestInit | undefined;
  const result = await sendViaMetaWhatsApp(
    ready,
    {
      phone: "5511999999999",
      sourceType: "ai_reply",
      payloadType: "text",
      message: "Resposta segura",
      insideCustomerWindow: true,
    },
    (async (url: string | URL | Request, init?: RequestInit) => {
      seenUrl = String(url);
      seenInit = init;
      return new Response(
        JSON.stringify({ messages: [{ id: "wamid.sent" }] }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }) as typeof fetch,
  );
  assertEquals(result, { ok: true, status: 200, providerId: "wamid.sent" });
  assertMatch(seenUrl, /graph[.]facebook[.]com\/v25[.]0\/123456789\/messages$/);
  assertEquals(seenUrl.includes("secret-token"), false);
  assertEquals(String(seenInit?.body).includes("secret-token"), false);
  assertEquals(
    new Headers(seenInit?.headers).get("Authorization"),
    "Bearer secret-token",
  );
});
