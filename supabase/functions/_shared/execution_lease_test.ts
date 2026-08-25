import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decideConversationLease } from "./execution-lease.ts";

const NOW = 1_000_000;

Deno.test("inbound B recebido durante A fica persistido para drenagem", () => {
  assertEquals(decideConversationLease("inbound-b", [{ eventId: "inbound-a", status: "running", expiresAt: NOW + 60_000 }], NOW), "event_queued");
});

Deno.test("retry do mesmo evento ativo ou concluído é idempotente", () => {
  assertEquals(decideConversationLease("event-a", [{ eventId: "event-a", status: "running", expiresAt: NOW + 60_000 }], NOW), "event_already_active");
  assertEquals(decideConversationLease("event-a", [{ eventId: "event-a", status: "finished", expiresAt: NOW - 1 }], NOW), "event_already_finished");
});

Deno.test("claim abandonado pode ser retomado somente após expiração", () => {
  assertEquals(decideConversationLease("event-a", [{ eventId: "event-a", status: "running", expiresAt: NOW - 1 }], NOW), "recover_expired");
});

Deno.test("evento novo adquire lease quando não há execução ativa", () => {
  assertEquals(decideConversationLease("event-b", [{ eventId: "event-a", status: "finished", expiresAt: NOW - 1 }], NOW), "acquire");
});

Deno.test("inbound B recebido depois da agregação de A continua na fila", () => {
  const afterAggregation = [{ eventId: "inbound-a", status: "running" as const, expiresAt: NOW + 60_000 }];
  assertEquals(decideConversationLease("inbound-b", afterAggregation, NOW + 10_001), "event_queued");
});

Deno.test("liberação do lease permite processamento único do B persistido", () => {
  const released = [
    { eventId: "inbound-a", status: "finished" as const, expiresAt: NOW - 1 },
    { eventId: "inbound-b", status: "queued" as const, expiresAt: NOW - 1 },
  ];
  assertEquals(decideConversationLease("inbound-b", released, NOW), "acquire_queued");
  const acquired = released.map((row) => row.eventId === "inbound-b"
    ? { ...row, status: "running" as const, expiresAt: NOW + 60_000 }
    : row);
  assertEquals(decideConversationLease("inbound-b", acquired, NOW), "event_already_active");
});

Deno.test("correlation ids diferentes não mudam a chave normativa do mesmo inbound", () => {
  const normativeInboundId = "7b45c1ce-f6d0-49f2-81af-4dd18c929996";
  const rows = [{ eventId: normativeInboundId, status: "finished" as const, expiresAt: NOW - 1 }];
  assertEquals(decideConversationLease(normativeInboundId, rows, NOW), "event_already_finished");
  assertEquals(decideConversationLease(normativeInboundId, rows, NOW), "event_already_finished");
});

Deno.test("fila A/B/C drena em ordem sem executar dois eventos juntos", () => {
  const whileA = [{ eventId: "A", status: "running" as const, expiresAt: NOW + 60_000 }];
  assertEquals(decideConversationLease("B", whileA, NOW), "event_queued");
  assertEquals(decideConversationLease("C", whileA, NOW), "event_queued");

  const afterA = [
    { eventId: "A", status: "finished" as const, expiresAt: NOW - 1 },
    { eventId: "B", status: "queued" as const, expiresAt: NOW - 1 },
    { eventId: "C", status: "queued" as const, expiresAt: NOW - 1 },
  ];
  assertEquals(decideConversationLease("B", afterA, NOW), "acquire_queued");
  const whileB = afterA.map((row) => row.eventId === "B"
    ? { ...row, status: "running" as const, expiresAt: NOW + 60_000 }
    : row);
  assertEquals(decideConversationLease("C", whileB, NOW), "event_queued");
  const afterB = whileB.map((row) => row.eventId === "B"
    ? { ...row, status: "finished" as const, expiresAt: NOW - 1 }
    : row);
  assertEquals(decideConversationLease("C", afterB, NOW), "acquire_queued");
});
