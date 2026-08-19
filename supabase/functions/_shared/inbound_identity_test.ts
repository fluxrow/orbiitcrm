import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  classifyZapiInbound,
  extractLid,
  extractTrustedPhone,
  normalizeTrustedPhone,
  sanitizeUnresolvedLidPayload,
} from "./inbound-identity.ts";

Deno.test("telefone confiável: phone/from/participantPhone/chatId @c.us", () => {
  assertEquals(extractTrustedPhone({ phone: "554391213714" } as any), "554391213714");
  assertEquals(extractTrustedPhone({ phone: "4391213714" } as any), "554391213714");
  assertEquals(extractTrustedPhone({ participantPhone: "554391213714", phone: "2442936@lid" } as any), "554391213714");
  assertEquals(extractTrustedPhone({ chatId: "554391213714@c.us" } as any), "554391213714");
});

Deno.test("LID nunca vira telefone e connectedPhone é ignorado", () => {
  assertEquals(extractTrustedPhone({ phone: "244293629427827@lid" } as any), null);
  assertEquals(extractTrustedPhone({ chatId: "244293629427827@lid" } as any), null);
  assertEquals(extractTrustedPhone({ connectedPhone: "554799999999" } as any), null);
  assertEquals(normalizeTrustedPhone("244293629427827@lid"), null);
});

Deno.test("extractLid encontra o LID em qualquer campo", () => {
  assertEquals(extractLid({ chatLid: "111@lid" } as any), "111@lid");
  assertEquals(extractLid({ phone: "222@lid" } as any), "222@lid");
  assertEquals(extractLid({ phone: "554391213714" } as any), null);
});

Deno.test("classificação: inbound, OUT externa, eco do Orbit e flag do tenant", () => {
  const base = { instanceId: "i", phone: "554391213714", text: { message: "oi" } } as any;
  assertEquals(classifyZapiInbound(base, "on-receive", { notifyOwnMessages: true }).kind, "inbound");

  const externa = { ...base, fromMe: true, fromApi: false };
  assertEquals(classifyZapiInbound(externa, "on-receive", { notifyOwnMessages: true }).kind, "external_out");
  assertEquals(
    classifyZapiInbound(externa, "on-receive", { notifyOwnMessages: false }).reason,
    "own_messages_disabled",
  );

  const echo = { ...base, fromMe: true, fromApi: true };
  assertEquals(classifyZapiInbound(echo, "on-receive", { notifyOwnMessages: true }).kind, "orbit_echo");

  assertEquals(classifyZapiInbound(base, "on-send", { notifyOwnMessages: true }).kind, "status_callback");
  assertEquals(classifyZapiInbound({ ...base, isGroup: true }, "on-receive", { notifyOwnMessages: true }).reason, "group");
  assertEquals(
    classifyZapiInbound({ ...base, type: "DeliveryCallback" }, "on-receive", { notifyOwnMessages: true }).kind,
    "status_callback",
  );
});

Deno.test("payload sanitizado não expõe telefone nem conteúdo", () => {
  const s = sanitizeUnresolvedLidPayload({
    instanceId: "3DFFAA112233",
    phone: "244293629427827@lid",
    text: { message: "conteúdo sensível 41999999999" },
  } as any);
  const serialized = JSON.stringify(s);
  assertEquals(serialized.includes("conteúdo"), false);
  assertEquals(serialized.includes("41999999999"), false);
  assertEquals(serialized.includes("244293629427827"), false);
  assertEquals(s.has_text, true);
});
