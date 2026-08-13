import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  classifyZapiFailure,
  sanitizeZapiReason,
  shouldSendOfflineAlert,
  zapiInstanceBlockReason,
  ZAPI_OFFLINE_REASON,
  ZAPI_SEND_BLOCK_REASON,
  ZAPI_BLOCK_24H_SECONDS,
} from "./zapi-connection.ts";
import {
  buildZapiRequest,
  documentFileName,
  extensionFromPath,
  isNativeAudioExtension,
} from "./zapi-media.ts";
import { buildOfflineAlertMessage, ORBIT_OPS_ALERT_WHATSAPP } from "./zapi-ops-alert.ts";

const BASE = "https://api.z-api.io/instances/I1/token/T1";

// ── Gate fail-closed ──
Deno.test("A: sem estado -> bloqueado", () => {
  assertEquals(zapiInstanceBlockReason(null), ZAPI_OFFLINE_REASON);
});

Deno.test("B: instancia offline bloqueia", () => {
  assertEquals(zapiInstanceBlockReason({ instance_offline: true }), ZAPI_OFFLINE_REASON);
});

Deno.test("C: send_block_until futuro bloqueia", () => {
  const future = new Date(Date.now() + 3600_000).toISOString();
  assertEquals(zapiInstanceBlockReason({ instance_offline: false, send_block_until: future }), ZAPI_SEND_BLOCK_REASON);
});

Deno.test("D: send_block_until passado libera", () => {
  const past = new Date(Date.now() - 1000).toISOString();
  assertEquals(zapiInstanceBlockReason({ instance_offline: false, send_block_until: past }), null);
});

// ── Classificação de falhas ──
Deno.test("E: 401 derruba instancia", () => {
  const c = classifyZapiFailure(401, { error: "unauthorized" });
  assert(c.offline);
  assertEquals(c.event_type, "unauthorized");
});

Deno.test("F: 403 derruba instancia", () => {
  assert(classifyZapiFailure(403, "forbidden").offline);
});

Deno.test("G: sessao perdida derruba instancia", () => {
  const c = classifyZapiFailure(400, {
    error: "It was not possible to restore a session with the current token, please login again",
  });
  assert(c.offline);
  assertEquals(c.event_type, "session-disconnected");
});

Deno.test("H: block temporario aplica 24h sem derrubar", () => {
  const c = classifyZapiFailure(429, { error: "temporarily blocked" });
  assertEquals(c.offline, false);
  assertEquals(c.blockSeconds, ZAPI_BLOCK_24H_SECONDS);
});

Deno.test("I: erro comum nao derruba instancia", () => {
  const c = classifyZapiFailure(500, { error: "internal" });
  assertEquals(c.offline, false);
  assertEquals(c.blockSeconds, null);
});

Deno.test("J: reason nunca expoe token", () => {
  const dirty = sanitizeZapiReason("falhou em /token/ABCDEF0123456789ABCDEF01 com F1D0BEEF1234567890ABCDEF");
  assert(!dirty.includes("ABCDEF0123456789ABCDEF01"));
  assert(dirty.includes("/token/***"));
});

// ── Cooldown de alerta ──
Deno.test("K: primeiro alerta sempre envia", () => {
  assert(shouldSendOfflineAlert(null));
});

Deno.test("L: alerta recente nao repete (anti-tempestade)", () => {
  const recent = new Date(Date.now() - 60_000).toISOString();
  assertEquals(shouldSendOfflineAlert(recent), false);
});

Deno.test("M: alerta antigo reenvia", () => {
  const old = new Date(Date.now() - 120 * 60_000).toISOString();
  assert(shouldSendOfflineAlert(old));
});

Deno.test("N: alerta contem instance id e motivo, sem token", () => {
  const msg = buildOfflineAlertMessage({
    empresa_id: "e1",
    empresa_nome: "Fabrica",
    instance_id: "3F14C72D",
    reason: "session-disconnected em /token/ABCDEF0123456789ABCDEF01",
    event_type: "session-disconnected",
  });
  assert(msg.includes("3F14C72D"));
  assert(msg.includes("session-disconnected"));
  assert(!msg.includes("ABCDEF0123456789ABCDEF01"));
  assertEquals(ORBIT_OPS_ALERT_WHATSAPP, "5541992361868");
});

// ── Handler de mídia isolado ──
Deno.test("O: texto usa send-text", () => {
  const spec = buildZapiRequest({ base: BASE, phone: "5541", kind: "text", caption: "oi" })!;
  assertEquals(spec.url, `${BASE}/send-text`);
  assertEquals(spec.body.message, "oi");
});

Deno.test("P: midia sem url NAO cai para texto", () => {
  for (const kind of ["image", "audio", "video", "document"] as const) {
    assertEquals(buildZapiRequest({ base: BASE, phone: "5541", kind, caption: "legenda" }), null);
  }
});

Deno.test("Q: imagem leva legenda junto da midia", () => {
  const spec = buildZapiRequest({
    base: BASE, phone: "5541", kind: "image", caption: "olha isso",
    mediaUrl: "https://x/y/a.jpg?token=1", mediaSource: "e/conversas/a.jpg",
  })!;
  assertEquals(spec.url, `${BASE}/send-image`);
  assertEquals(spec.body.caption, "olha isso");
});

Deno.test("R: documento inclui extensao no endpoint e fileName", () => {
  const spec = buildZapiRequest({
    base: BASE, phone: "5541", kind: "document",
    mediaUrl: "https://x/y/contrato.pdf?sig=1", mediaSource: "e/conversas/contrato.pdf",
  })!;
  assertEquals(spec.url, `${BASE}/send-document/pdf`);
  assertEquals(spec.body.fileName, "contrato.pdf");
});

Deno.test("S: audio nativo usa send-audio", () => {
  const spec = buildZapiRequest({
    base: BASE, phone: "5541", kind: "audio",
    mediaUrl: "https://x/y/v.ogg?sig=1", mediaSource: "e/conversas/v.ogg",
  })!;
  assertEquals(spec.url, `${BASE}/send-audio`);
  assertEquals(spec.kind, "audio");
});

Deno.test("T: audio nao nativo degrada para documento (nao desaparece)", () => {
  const spec = buildZapiRequest({
    base: BASE, phone: "5541", kind: "audio",
    mediaUrl: "https://x/y/v.webm?sig=1", mediaSource: "e/conversas/v.webm",
  })!;
  assertEquals(spec.url, `${BASE}/send-document/webm`);
  assertEquals(spec.kind, "document");
});

Deno.test("U: helpers de extensao/nome", () => {
  assertEquals(extensionFromPath("a/b/c.PDF?x=1"), "pdf");
  assertEquals(extensionFromPath("a/b/sem-extensao"), "");
  assertEquals(documentFileName({ file_name: "Proposta.pdf" }, "a/b/uuid.pdf"), "Proposta.pdf");
  assertEquals(documentFileName(null, "a/b/uuid.pdf"), "uuid.pdf");
  assert(isNativeAudioExtension("mp3"));
  assertEquals(isNativeAudioExtension("webm"), false);
});
