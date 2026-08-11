import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  consolidateAgentReplies,
  extractInboundContent,
  extractInboundPhone,
  inboundEligibility,
  inboundTimestampIso,
  phoneVariants,
  providerMessageId,
  resolveEmpresaByInstance,
  safePreview,
  selectBackfillCandidates,
} from "./inbound-zapi.ts";
import { effectiveDailyLimit, simulateWarmupBatch } from "./outbox-quota.ts";

const BULLINK = "4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18";
const FLUXROW = "4de0ed22-0fe5-40ef-aaed-703dd3070291";

const inbound = (extra: Record<string, unknown> = {}) => ({
  type: "ReceivedCallback",
  phone: "554391213714",
  chatLid: "244293629427827@lid",
  fromMe: false,
  isGroup: false,
  broadcast: false,
  momment: 1786472814001,
  messageId: "3EB07BE9589F9C6713094D",
  instanceId: "3E122A05B56100A46A0E96870211A73F",
  text: { message: "oi, quero saber mais" },
  ...extra,
});

// A1/A2 — resolução de tenant e telefone
Deno.test("empresa resolvida somente por instance_id, sem fallback", () => {
  assertEquals(resolveEmpresaByInstance([{ empresa_id: BULLINK }]).empresaId, BULLINK);
  assertEquals(resolveEmpresaByInstance([]).reason, "instance_not_mapped");
  const ambiguous = resolveEmpresaByInstance([{ empresa_id: BULLINK }, { empresa_id: FLUXROW }]);
  assertEquals(ambiguous.empresaId, null);
  assertEquals(ambiguous.reason, "instance_ambiguous");
});

Deno.test("chatLid @lid nunca é usado como telefone", () => {
  assertEquals(extractInboundPhone(inbound()), "554391213714");
  assertEquals(extractInboundPhone({ phone: "244293629427827@lid" } as any), null);
  assertEquals(extractInboundPhone({ phone: "4391213714" } as any), "554391213714");
  assertEquals(extractInboundPhone({} as any), null);
});

Deno.test("variantes com/sem nono dígito", () => {
  assert(phoneVariants("5543991213714").includes("554391213714"));
  assert(phoneVariants("554391213714").includes("5543991213714"));
});

// A1 — fromMe / grupo / broadcast / status ignorados
Deno.test("elegibilidade inbound descarta fromMe, grupo, broadcast e status", () => {
  assertEquals(inboundEligibility(inbound(), "on-receive").process, true);
  assertEquals(inboundEligibility(inbound({ fromMe: true }), "on-receive").reason, "from_me");
  assertEquals(inboundEligibility(inbound({ isGroup: true }), "on-receive").reason, "group");
  assertEquals(inboundEligibility(inbound({ broadcast: true }), "on-receive").reason, "broadcast");
  assertEquals(inboundEligibility(inbound({ isNewsletter: true }), "on-receive").reason, "newsletter");
  assertEquals(inboundEligibility(inbound({ type: "MessageStatusCallback" }), "on-receive").reason, "status_callback:MessageStatusCallback");
  assertEquals(inboundEligibility(inbound({ text: null }), "on-receive").reason, "empty_payload");
});

// A3/A4 — conteúdo, timestamp e preview
Deno.test("conteúdo e mídia extraídos com preview seguro", () => {
  assertEquals(extractInboundContent(inbound()).messageText, "oi, quero saber mais");
  const audio = extractInboundContent(inbound({ text: null, audio: { audioUrl: "https://x/a.ogg" } }));
  assertEquals(audio.tipoMidia, "audio");
  assertEquals(audio.urlMidia, "https://x/a.ogg");
  assertEquals(safePreview("", "audio"), "📎 audio");
  assertEquals(safePreview("a\n b   c", null), "a b c");
  assertEquals(safePreview("x".repeat(300), null).length, 120);
  assertEquals(inboundTimestampIso(inbound()), new Date(1786472814001).toISOString());
  assertEquals(providerMessageId(inbound()), "3EB07BE9589F9C6713094D");
});

// B — backfill: cronológico, dedupe, fromMe fora
Deno.test("backfill seleciona apenas inbound elegível, deduplica e ordena", () => {
  const { candidates, skipped } = selectBackfillCandidates([
    { log_id: "l1", created_at: "2026-08-11T10:00:00Z", payload: inbound({ messageId: "B", momment: 1786472000000 }) as any },
    { log_id: "l2", created_at: "2026-08-11T09:00:00Z", payload: inbound({ messageId: "A", momment: 1786471000000 }) as any },
    { log_id: "l3", created_at: "2026-08-11T11:00:00Z", payload: inbound({ messageId: "B", momment: 1786472000000 }) as any },
    { log_id: "l4", created_at: "2026-08-11T12:00:00Z", payload: inbound({ fromMe: true, messageId: "C" }) as any },
  ]);
  assertEquals(candidates.map((c) => c.provider_message_id), ["A", "B"]);
  assertEquals(skipped.duplicate_in_logs, 1);
  assertEquals(skipped.from_me, 1);
});

// B — no máximo uma resposta por conversa; sem prospect não responde
Deno.test("consolidação gera no máximo uma resposta por conversa", () => {
  const replies = consolidateAgentReplies([
    { conversa_id: "c1", prospect_id: "p1", provider_message_id: "m1", mensagem: "antiga", telefone: "55", timestamp: "2026-08-11T10:00:00Z" },
    { conversa_id: "c1", prospect_id: "p1", provider_message_id: "m2", mensagem: "recente", telefone: "55", timestamp: "2026-08-11T12:00:00Z" },
    { conversa_id: "c2", prospect_id: null, provider_message_id: "m3", mensagem: "sem vinculo", telefone: "55", timestamp: "2026-08-11T12:00:00Z" },
  ] as any);
  assertEquals(replies.length, 1);
  assertEquals(replies[0].provider_message_id, "m2");
});

// D — warm-up Bullink: 15 respostas ficam sob 10/dia e 2/min
Deno.test("15 respostas do agente respeitam 10/dia e 2/min no D1", () => {
  const config = { warmup_enabled: true, warmup_start_date: "2026-08-11", daily_limit: 10 };
  const now = new Date("2026-08-11T15:00:00Z");
  assertEquals(effectiveDailyLimit(config, now).limit, 10);

  const items = Array.from({ length: 15 }, (_, i) => ({ id: `i${i}`, source_type: "ai_reply" }));
  const daily = simulateWarmupBatch({ items, config, sent_today: 0, max_per_minute: null, now });
  assertEquals(daily.sent.length, 10);
  assertEquals(daily.retained.length, 5);

  const minute = simulateWarmupBatch({ items, config, sent_today: 0, sent_last_minute: 0, max_per_minute: 2, now });
  assertEquals(minute.sent.length, 2);
});
