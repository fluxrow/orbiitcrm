import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildCanonicalClassDelivery,
  extractCanonicalClassUrl,
  previousAssistantOfferedClassAccess,
  sandboxClassEmailStepPending,
  sandboxConversationMessages,
} from "./viver-class-parity.ts";

Deno.test("sandbox Viver reconhece aceite somente após oferta explícita da aula", () => {
  const messages = [
    { role: "assistant" as const, content: "Quer que eu libere o acesso para a aula de terça-feira?" },
    { role: "user" as const, content: "Sim" },
  ];
  assertEquals(previousAssistantOfferedClassAccess(sandboxConversationMessages(messages), "Sim"), true);
});

Deno.test("sandbox Viver reconhece aceite natural com pedido de liberação", () => {
  const messages = [
    { role: "assistant" as const, content: "A aula é terça-feira às 19:30. Quer que eu libere seu acesso?" },
    { role: "user" as const, content: "Sim, quero que libere o acesso." },
  ];
  assertEquals(previousAssistantOfferedClassAccess(sandboxConversationMessages(messages), messages[1].content), true);
});

Deno.test("sandbox Viver reconhece confirmação de participação no horário da aula", () => {
  const messages = [
    { role: "assistant" as const, content: "A aula é terça-feira às 19:30. Você consegue participar nesse horário?" },
    { role: "user" as const, content: "Sim, quero que libere o acesso." },
  ];
  assertEquals(previousAssistantOfferedClassAccess(sandboxConversationMessages(messages), messages[1].content), true);
});

Deno.test("sandbox Viver reconhece a etapa opcional de e-mail", () => {
  assertEquals(sandboxClassEmailStepPending([
    {
      role: "assistant",
      content: "Qual e-mail você quer usar para eu enviar o convite da aula e os lembretes pelo Google Agenda?",
    },
    { role: "user", content: "manda por aqui" },
  ]), true);
});

Deno.test("sandbox Viver não confunde pergunta genérica com etapa de e-mail", () => {
  assertEquals(sandboxClassEmailStepPending([
    { role: "assistant", content: "Qual é seu melhor e-mail?" },
  ]), false);
});

Deno.test("sandbox Viver aceita somente um Meet canônico e substitui o nome", () => {
  const template = "Oi, {{nome}}. Acesse: https://meet.google.com/abc-defg-hij";
  assertEquals(extractCanonicalClassUrl(template), "https://meet.google.com/abc-defg-hij");
  assertEquals(buildCanonicalClassDelivery(template, "Mariana"), "Oi, Mariana. Acesse: https://meet.google.com/abc-defg-hij");
});
