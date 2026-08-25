import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { decideConversationLease } from "./execution-lease.ts";

const NOW = 1_000_000;

Deno.test("dois eventos diferentes na mesma conversa: segundo aguarda", () => {
  assertEquals(decideConversationLease("event-b", [{ eventId: "event-a", status: "running", expiresAt: NOW + 60_000 }], NOW), "conversation_busy");
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
