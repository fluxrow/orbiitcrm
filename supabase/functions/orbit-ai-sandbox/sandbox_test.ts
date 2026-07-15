// Testes automatizados para o AgentSandbox (orbit-ai-sandbox).
//
// Como a resposta do LLM não é determinística, os testes cobrem duas camadas:
//   1) O system prompt gerado por `buildSystemPrompt` — garante que, para
//      trigger `inbound_webhook` com origem Typebot, as regras anti-emoji,
//      anti-"site" e anti-"Lead" estão presentes.
//   2) Um validador `assertSandboxReplyIsClean` que pode ser aplicado a
//      qualquer texto de resposta (real ou fixture) e falha se violar as
//      mesmas regras. Isto permite plugar respostas capturadas do modelo em
//      um teste de contrato sem depender de rede.

import { assert, assertStringIncludes, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildSystemPrompt } from "./index.ts";

const TYPEBOT_LEAD_SEM_NOME = {
  nome: "",
  origem: "Typebot - Captacao Meta",
  telefone: "+55 49 99951-3060",
  email: "lead.teste@exemplo.com",
  cidade: "Chapeco",
  segmento: "Semijoias",
  observacoes: "Respondeu ao formulario do Typebot da Viver Semijoias.",
};

// Regex de emojis (blocos Unicode comuns: pictográficos, símbolos, dingbats).
const EMOJI_RE = /[\p{Extended_Pictographic}\p{Emoji_Presentation}]/u;

/** Valida que uma resposta do sandbox respeita os guardrails da Viver. */
export function assertSandboxReplyIsClean(reply: string, opts: { leadNome?: string } = {}) {
  assertFalse(EMOJI_RE.test(reply), `resposta contém emoji: ${reply}`);
  assertFalse(
    /\bsite\b/i.test(reply),
    `resposta menciona "site" indevidamente: ${reply}`,
  );
  if (!opts.leadNome || !opts.leadNome.trim()) {
    // Não pode chamar a pessoa de "Lead" quando o nome está vazio.
    assertFalse(
      /\bLead\b/.test(reply),
      `resposta chama a pessoa de "Lead" sem nome disponível: ${reply}`,
    );
  }
}

Deno.test("buildSystemPrompt injeta guardrails no gatilho de webhook Typebot", () => {
  const prompt = buildSystemPrompt(
    { prompt_identidade: "SDR da Viver Semijoias." },
    TYPEBOT_LEAD_SEM_NOME,
    "inbound_webhook",
  );

  assertStringIncludes(prompt, "Nao use emojis");
  assertStringIncludes(prompt, 'Nao diga que o lead veio do site');
  assertStringIncludes(prompt, "respostas do formulario");
  assertStringIncludes(prompt, 'Nao chame o lead de "Lead"');
  assertStringIncludes(prompt, "Typebot - Captacao Meta");
});

Deno.test("assertSandboxReplyIsClean aceita resposta em conformidade", () => {
  const reply = [
    "Oi, tudo bem?",
    "Vi suas respostas no formulario da Viver Semijoias e queria entender melhor seu momento.",
    "Hoje, o que mais esta travando: vender mais, organizar revendedoras ou tornar isso uma renda consistente?",
  ].join("\n\n");

  assertSandboxReplyIsClean(reply, { leadNome: "" });
});

Deno.test("assertSandboxReplyIsClean falha quando resposta usa emoji", () => {
  let threw = false;
  try {
    assertSandboxReplyIsClean("Oi, tudo bem? 😊 Vi suas respostas do formulario.", { leadNome: "" });
  } catch {
    threw = true;
  }
  assert(threw, "esperava falha por emoji");
});

Deno.test("assertSandboxReplyIsClean falha quando resposta menciona 'site'", () => {
  let threw = false;
  try {
    assertSandboxReplyIsClean(
      "Oi! Vi que voce se cadastrou no site e queria entender seu momento.",
      { leadNome: "" },
    );
  } catch {
    threw = true;
  }
  assert(threw, "esperava falha por 'site'");
});

Deno.test("assertSandboxReplyIsClean falha quando chama a pessoa de 'Lead' sem nome", () => {
  let threw = false;
  try {
    assertSandboxReplyIsClean(
      "Oi, Lead! Tudo bem? Vi suas respostas do formulario.",
      { leadNome: "" },
    );
  } catch {
    threw = true;
  }
  assert(threw, "esperava falha por chamar de 'Lead' sem nome");
});

Deno.test("assertSandboxReplyIsClean permite palavra 'Lead' quando nome está presente", () => {
  // Cenário raro (não recomendado), mas o guardrail só ativa quando o nome está vazio.
  assertSandboxReplyIsClean("Oi, Fernanda! Vi suas respostas do formulario.", { leadNome: "Fernanda" });
});
