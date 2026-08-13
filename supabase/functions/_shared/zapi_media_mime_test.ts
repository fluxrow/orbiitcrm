// Testes explícitos de MIME/extensão/filename do handler isolado de mídia
// Z-API + regressão de texto simples (deve permanecer inalterado).
//
// Rodar: deno test supabase/functions/_shared/zapi_media_mime_test.ts
import { assertEquals, assert } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  buildZapiRequest,
  documentFileName,
  extensionFromPath,
  isNativeAudioExtension,
} from "./zapi-media.ts";
import {
  isSenderEligible,
  resolveInternalSenderSelector,
  OPS_ALERT_PENDING_ERROR,
  DEFAULT_INTERNAL_SLUG,
} from "./zapi-ops-alert.ts";

const BASE = "https://api.z-api.io/instances/INST/token/TOK";
const PHONE = "5541999999999";

function req(kind: any, mediaUrl: string, payload?: Record<string, unknown>, caption = "legenda") {
  return buildZapiRequest({
    base: BASE,
    phone: PHONE,
    kind,
    caption,
    mediaUrl,
    mediaSource: mediaUrl,
    payload: payload ?? null,
  });
}

Deno.test("MIME image/jpeg -> send-image com caption na mesma mensagem", () => {
  const spec = req("image", "https://cdn.example.com/bucket/foto.jpeg?token=abc")!;
  assertEquals(spec.kind, "image");
  assertEquals(spec.url, `${BASE}/send-image`);
  assertEquals((spec.body as any).image, "https://cdn.example.com/bucket/foto.jpeg?token=abc");
  assertEquals((spec.body as any).caption, "legenda");
});

Deno.test("MIME image/jpeg (.jpg) mantém extensão detectada", () => {
  assertEquals(extensionFromPath("https://x/y/foto.JPG?sig=1"), "jpg");
});

Deno.test("MIME video/mp4 -> send-video com caption", () => {
  const spec = req("video", "https://cdn.example.com/prova.mp4?X-Amz=1")!;
  assertEquals(spec.kind, "video");
  assertEquals(spec.url, `${BASE}/send-video`);
  assertEquals((spec.body as any).video, "https://cdn.example.com/prova.mp4?X-Amz=1");
  assertEquals((spec.body as any).caption, "legenda");
});

Deno.test("MIME audio/mpeg (.mp3) -> send-audio nativo", () => {
  const spec = req("audio", "https://cdn.example.com/audio.mp3")!;
  assertEquals(spec.kind, "audio");
  assertEquals(spec.url, `${BASE}/send-audio`);
  assertEquals((spec.body as any).audio, "https://cdn.example.com/audio.mp3");
  assert(isNativeAudioExtension("mp3"));
  assert(isNativeAudioExtension("mpeg"));
  assert(isNativeAudioExtension("ogg"));
});

Deno.test("audio não nativo (webm) vira documento e não perde o anexo", () => {
  const spec = req("audio", "https://cdn.example.com/gravacao.webm")!;
  assertEquals(spec.kind, "document");
  assertEquals(spec.url, `${BASE}/send-document/webm`);
  assertEquals((spec.body as any).fileName, "gravacao.webm");
  assert(!isNativeAudioExtension("webm"));
});

Deno.test("MIME application/pdf -> send-document/pdf com fileName", () => {
  const spec = req("document", "https://cdn.example.com/proposta.pdf?sig=zz")!;
  assertEquals(spec.kind, "document");
  assertEquals(spec.url, `${BASE}/send-document/pdf`);
  assertEquals((spec.body as any).fileName, "proposta.pdf");
  assertEquals((spec.body as any).document, "https://cdn.example.com/proposta.pdf?sig=zz");
});

Deno.test("DOCX -> send-document/docx", () => {
  const spec = req("document", "https://cdn.example.com/contrato.docx")!;
  assertEquals(spec.url, `${BASE}/send-document/docx`);
  assertEquals((spec.body as any).fileName, "contrato.docx");
});

Deno.test("XLSX -> send-document/xlsx", () => {
  const spec = req("document", "https://cdn.example.com/planilha.xlsx?token=1")!;
  assertEquals(spec.url, `${BASE}/send-document/xlsx`);
  assertEquals((spec.body as any).fileName, "planilha.xlsx");
});

Deno.test("ZIP -> send-document/zip", () => {
  const spec = req("document", "https://cdn.example.com/pacote.zip")!;
  assertEquals(spec.url, `${BASE}/send-document/zip`);
  assertEquals((spec.body as any).fileName, "pacote.zip");
});

Deno.test("filename explícito do payload vence o path", () => {
  const spec = req("document", "https://cdn.example.com/abc123.pdf", { file_name: "Proposta Orbit.pdf" })!;
  assertEquals((spec.body as any).fileName, "Proposta Orbit.pdf");
  assertEquals(documentFileName({ nome_arquivo: "Relatorio.xlsx" }, "https://x/y/z.xlsx"), "Relatorio.xlsx");
});

Deno.test("documento sem extensão cai para pdf (nunca sem extensão no path)", () => {
  const spec = req("document", "https://cdn.example.com/arquivo")!;
  assertEquals(spec.url, `${BASE}/send-document/pdf`);
  assert(spec.url.split("/send-document/")[1].length > 0);
});

Deno.test("mídia sem URL resolvida NUNCA cai para texto", () => {
  for (const kind of ["image", "video", "audio", "document"]) {
    const spec = buildZapiRequest({ base: BASE, phone: PHONE, kind: kind as any, caption: "oi", mediaUrl: null });
    assertEquals(spec, null, `kind ${kind} deveria falhar explicitamente`);
  }
});

Deno.test("REGRESSÃO: texto simples permanece send-text inalterado", () => {
  const spec = buildZapiRequest({ base: BASE, phone: PHONE, kind: "text", caption: "Olá, tudo bem?" })!;
  assertEquals(spec.kind, "text");
  assertEquals(spec.url, `${BASE}/send-text`);
  assertEquals(spec.body, { phone: PHONE, message: "Olá, tudo bem?" });
});

Deno.test("REGRESSÃO: texto não recebe campos de mídia mesmo com mediaUrl", () => {
  const spec = buildZapiRequest({
    base: BASE,
    phone: PHONE,
    kind: "text",
    caption: "texto puro",
    mediaUrl: "https://cdn.example.com/x.pdf",
  })!;
  assertEquals(spec.url, `${BASE}/send-text`);
  assertEquals(Object.keys(spec.body).sort(), ["message", "phone"]);
});

// ---- Segurança do remetente de alerta operacional ----

Deno.test("seletor de remetente interno exige configuração explícita", () => {
  const env: Record<string, string> = {};
  const sel = resolveInternalSenderSelector((k) => env[k]);
  assertEquals(sel.configId, null);
  assertEquals(sel.empresaId, null);
  assertEquals(sel.slug, DEFAULT_INTERNAL_SLUG);

  const env2: Record<string, string> = {
    ORBIT_OPS_ALERT_ZAPI_CONFIG_ID: "cfg-1",
    ORBIT_OPS_ALERT_EMPRESA_SLUG: "Orbit-Interno",
  };
  const sel2 = resolveInternalSenderSelector((k) => env2[k]);
  assertEquals(sel2.configId, "cfg-1");
  assertEquals(sel2.slug, "orbit-interno");
});

Deno.test("candidato inativo/offline/bloqueado não é elegível como remetente", () => {
  const now = new Date("2026-08-13T12:00:00Z");
  assert(isSenderEligible({ id: "a", instance_id: "i", ativo: true, instance_offline: false }, now));
  assert(!isSenderEligible({ id: "a", instance_id: "i", ativo: false }, now));
  assert(!isSenderEligible({ id: "a", instance_id: "i", instance_offline: true }, now));
  assert(!isSenderEligible({ id: "a", instance_id: null }, now));
  assert(!isSenderEligible({ id: "a", instance_id: "i", send_block_until: "2026-08-13T13:00:00Z" }, now));
  assert(isSenderEligible({ id: "a", instance_id: "i", send_block_until: "2026-08-13T11:00:00Z" }, now));
  assert(!isSenderEligible(null, now));
});

Deno.test("erro pendente de alerta é auditável e estável", () => {
  assertEquals(OPS_ALERT_PENDING_ERROR, "ops_alert_pending_no_internal_sender");
});
