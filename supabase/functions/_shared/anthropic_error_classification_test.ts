import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyAnthropicError } from "./anthropic.ts";

Deno.test("classifica saldo insuficiente mesmo quando o provedor responde 400", () => {
  assertEquals(
    classifyAnthropicError(
      400,
      '{"error":{"message":"Your credit balance is too low"}}',
    ),
    "credits",
  );
});

Deno.test("não confunde erro comum de validação com crédito", () => {
  assertEquals(classifyAnthropicError(400, "invalid request"), "unknown");
});
