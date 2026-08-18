import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  getOrbitZapiRealSendBlockReason,
  isOrbitZapiCanaryRecipient,
  normalizeZapiPhoneDigits,
  ZAPI_BLOCK_REASON_CANARY,
  ZAPI_BLOCK_REASON_GLOBAL,
} from "./orbit-zapi.ts";
import { sendViaZapiUnified } from "./zapi-send.ts";

const base = {
  envio_real_liberado: false,
  canary_mode_enabled: true,
  canary_phone_numbers: ["5541992361868"],
};

Deno.test("canário é permitido com envio geral bloqueado", () => {
  assertEquals(getOrbitZapiRealSendBlockReason(base, "5541992361868"), null);
});

Deno.test("não-canário é bloqueado em modo canário", () => {
  assertEquals(getOrbitZapiRealSendBlockReason(base, "5541999999999"), ZAPI_BLOCK_REASON_CANARY);
});

Deno.test("modo canário desligado mantém bloqueio global", () => {
  assertEquals(
    getOrbitZapiRealSendBlockReason({ ...base, canary_mode_enabled: false }, "5541992361868"),
    ZAPI_BLOCK_REASON_GLOBAL,
  );
});

Deno.test("lista canária vazia bloqueia fail-closed", () => {
  assertEquals(
    getOrbitZapiRealSendBlockReason({ ...base, canary_phone_numbers: [] }, "5541992361868"),
    ZAPI_BLOCK_REASON_CANARY,
  );
});

Deno.test("normalização aceita +55 e pontuação", () => {
  assertEquals(normalizeZapiPhoneDigits("+55 (41) 99236-1868"), "5541992361868");
  assertEquals(isOrbitZapiCanaryRecipient(base, "+55 (41) 99236-1868"), true);
});

Deno.test("envio geral liberado preserva comportamento", () => {
  assertEquals(
    getOrbitZapiRealSendBlockReason({ ...base, envio_real_liberado: true }, "12025550123"),
    null,
  );
});

Deno.test("sender final bloqueia não-canário antes de qualquer fetch", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (() => {
    fetchCalls += 1;
    throw new Error("fetch não deveria ser chamado");
  }) as typeof fetch;

  try {
    const supabase = {
      from: () => ({ insert: async () => ({ error: null }) }),
    };
    const result = await sendViaZapiUnified(
      supabase,
      {
        id: "config-test",
        empresa_id: "tenant-test",
        instance_id: "instance-test",
        token: "token-test",
        client_token: "client-test",
        ...base,
      },
      {
        phone: "5541999999999",
        kind: "text",
        message: "teste",
        functionName: "canary-unit-test",
      },
    );

    assertEquals(result.ok, false);
    assertEquals(result.error, ZAPI_BLOCK_REASON_CANARY);
    assertEquals(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
