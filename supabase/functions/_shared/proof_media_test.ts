// Testes dry_run da prova social (Bullink). Nenhuma chamada externa acontece:
// os helpers são puros e o teste falha se o payload vazar fileName/nome local.

import { assert, assertEquals, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  isProofRequest,
  matchesTriggerKeywords,
  proofPayloadType,
  buildProofOutboxPayload,
  buildZapiVideoBody,
} from "./proof-media.ts";

const MEDIA = {
  id: "c6fc4d5f-b694-42ad-833f-e1a317da26f6",
  kind: "video",
  caption: "Dá uma olhada no resultado recente de um dos nossos alunos:",
  storage_path:
    "4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18/media/c6fc4d5f-b694-42ad-833f-e1a317da26f6.mp4",
};

const KEYWORDS = [
  "prova", "provas", "depoimento", "depoimentos", "resultado", "resultados",
  "case", "cases", "aluno", "alunos", "print", "prints",
];

Deno.test("PM1: pedido explícito de prova é detectado", () => {
  assert(isProofRequest("tem alguma prova disso?"));
  assert(isProofRequest("me manda um depoimento de aluno"));
  assert(isProofRequest("quais resultados vocês já tiveram"));
  assert(isProofRequest("tem print de faturamento?"));
});

Deno.test("PM2: conversa comum não dispara mídia", () => {
  assertFalse(isProofRequest("qual o valor da mentoria?"));
  assertFalse(isProofRequest("boa tarde, tudo bem?"));
  assertFalse(isProofRequest(""));
  assertFalse(isProofRequest(null));
});

Deno.test("PM3: trigger_keywords precisam casar com o texto", () => {
  assert(matchesTriggerKeywords("tem depoimento de aluno?", KEYWORDS));
  assertFalse(matchesTriggerKeywords("funciona mesmo isso?", KEYWORDS));
  assert(matchesTriggerKeywords("qualquer coisa", []));
});

Deno.test("PM4: payload do outbox nunca contém fileName/nome local", () => {
  const payload = buildProofOutboxPayload(MEDIA);
  assertEquals(proofPayloadType(MEDIA.kind), "video");
  assertEquals(payload.mensagem, MEDIA.caption);
  assertEquals(payload.storage_path, MEDIA.storage_path);
  const keys = Object.keys(payload).map((k) => k.toLowerCase());
  for (const forbidden of ["filename", "file_name", "nome", "nome_local", "url"]) {
    assertFalse(keys.includes(forbidden), `payload não deve ter ${forbidden}`);
  }
  const raw = JSON.stringify(payload).toLowerCase();
  assertFalse(raw.includes("filename"));
  assertFalse(raw.includes(".mp4?"), "não deve embutir signed URL");
});

Deno.test("PM5: legenda visível ao lead não expõe path nem filename", () => {
  const payload = buildProofOutboxPayload(MEDIA);
  assertFalse(payload.mensagem.includes("/"));
  assertFalse(payload.mensagem.toLowerCase().includes(".mp4"));
  assertFalse(payload.mensagem.includes("4f6b4a18"));
});

Deno.test("PM6: corpo Z-API de vídeo é nativo e sem fileName", () => {
  const body = buildZapiVideoBody("5531999999999", "https://signed.example/x.mp4?t=1", MEDIA.caption);
  assertEquals(Object.keys(body).sort(), ["caption", "phone", "video"]);
  assertFalse(JSON.stringify(body).toLowerCase().includes("filename"));
});

// ── Detecção contextual + seleção (dry-run, sem Z-API e sem DB) ──
import {
  detectProofIntent,
  readAgentProofDecision,
  selectProofMedia,
  proofIdempotencyScope,
  stripUnfulfilledMediaPromise,
  NO_MEDIA_FALLBACK,
} from "./proof-media.ts";

const VIDEO = { id: "vid-1", kind: "video", caption: MEDIA.caption, storage_path: "t/media/v.mp4", duracao_segundos: 25, uso_count: 3 };
const VIDEO_LONGO = { id: "vid-2", kind: "video", caption: "x", storage_path: "t/media/v2.mp4", duracao_segundos: 300, uso_count: 0 };
const IMG = { id: "img-1", kind: "image", caption: "print", storage_path: "t/media/p.jpg", uso_count: 0 };

Deno.test("PM7: pedido explícito dispara prova", () => {
  const r = detectProofIntent({ mensagem_lead: "tem prova?" });
  assert(r.intent);
  assertEquals(r.reason, "explicit_request");
});

Deno.test("PM8: 'sim' após oferta do agente dispara prova", () => {
  const r = detectProofIntent({
    mensagem_lead: "sim",
    last_agent_out: "Você quer ver resultado de aluno aplicando isso?",
  });
  assert(r.intent);
  assertEquals(r.reason, "affirmative_after_offer");
});

Deno.test("PM9: 'sim' sem contexto de oferta NÃO dispara", () => {
  assertFalse(detectProofIntent({ mensagem_lead: "sim" }).intent);
  assertFalse(
    detectProofIntent({ mensagem_lead: "sim", last_agent_out: "Qual seu nome?" }).intent,
  );
});

Deno.test("PM10: decisão estruturada do agente dispara prova", () => {
  assert(readAgentProofDecision({ enviar_prova_social: true }));
  assert(readAgentProofDecision({ media_intent: "prova_social" }));
  assertFalse(readAgentProofDecision({ intencao: "preco" }));
  assert(detectProofIntent({ mensagem_lead: "beleza", agent_decision: true }).intent);
});

Deno.test("PM11: seleção prefere vídeo de ~25s; fallback imagem", () => {
  assertEquals(selectProofMedia([IMG, VIDEO_LONGO, VIDEO])!.id, "vid-1");
  assertEquals(selectProofMedia([IMG])!.id, "img-1");
  assertEquals(selectProofMedia([]), null);
  assertEquals(selectProofMedia(null), null);
});

Deno.test("PM12: idempotência por inbound+media (retry não duplica, mídias diferem)", () => {
  const inbound = "0fe6e5a0-2170-40d4-a99b-64fd18763f68";
  assertEquals(
    proofIdempotencyScope(inbound, VIDEO.id),
    proofIdempotencyScope(inbound, VIDEO.id),
  );
  assert(proofIdempotencyScope(inbound, VIDEO.id) !== proofIdempotencyScope(inbound, IMG.id));
  assert(proofIdempotencyScope("outro", VIDEO.id) !== proofIdempotencyScope(inbound, VIDEO.id));
});

Deno.test("PM13: sem mídia no tenant, a promessa é removida do texto", () => {
  const t = stripUnfulfilledMediaPromise(
    "Fechado. Dá uma olhada no resultado recente de um dos nossos alunos:",
  );
  assertFalse(/olhada|resultado|aluno/i.test(t));
  assertEquals(stripUnfulfilledMediaPromise(""), NO_MEDIA_FALLBACK);
  assertEquals(
    stripUnfulfilledMediaPromise("Vou te mandar o vídeo do aluno agora."),
    NO_MEDIA_FALLBACK,
  );
  assert(stripUnfulfilledMediaPromise("Qual seu maior desafio hoje?").includes("desafio"));
});
