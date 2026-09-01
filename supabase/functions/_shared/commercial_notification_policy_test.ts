import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  commercialNotificationTitle,
  resolveCommercialNotificationPolicy,
} from "./commercial-notification-policy.ts";

const BULLINK = "4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18";
const VIVER = "36f26579-66ad-4ef1-9788-141e4c727232";

function decide(overrides: Record<string, unknown> = {}) {
  return resolveCommercialNotificationPolicy({
    empresaId: BULLINK,
    commercialV2Enabled: true,
    verifiedPurchaseIntent: false,
    genericCommercialSignal: false,
    quoteReadySignal: false,
    genericClassification: "duvida",
    alreadyNotified: false,
    suppressHandoff: false,
    scheduleHandoffReady: false,
    ...overrides,
  });
}

Deno.test("Bullink: dúvida, interesse, call ou pedido humano não notificam", () => {
  for (const genericClassification of ["duvida", "agendar_call", "falar_humano", "venda_fechada"]) {
    const result = decide({ genericCommercialSignal: true, genericClassification });
    assertEquals(result.shouldNotify, false);
  }
});

Deno.test("Bullink: somente intenção determinística notifica e nunca usa título de venda", () => {
  const result = decide({ verifiedPurchaseIntent: true });
  assertEquals(result.shouldNotify, true);
  assertEquals(result.classification, "intencao_compra_verificada");
  assertEquals(commercialNotificationTitle(result.classification), "Intenção de compra verificada");
});

Deno.test("Bullink: dedupe e gates continuam fail-closed", () => {
  assertEquals(decide({ verifiedPurchaseIntent: true, alreadyNotified: true }).shouldNotify, false);
  assertEquals(decide({ verifiedPurchaseIntent: true, suppressHandoff: true }).shouldNotify, false);
  assertEquals(decide({ verifiedPurchaseIntent: true, scheduleHandoffReady: true }).shouldNotify, false);
});

Deno.test("outros tenants preservam a política anterior", () => {
  const result = decide({
    empresaId: VIVER,
    genericCommercialSignal: true,
    genericClassification: "agendar_call",
  });
  assertEquals(result.shouldNotify, true);
  assertEquals(result.classification, "agendar_call");
});
