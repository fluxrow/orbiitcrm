// Testes automatizados para o AgentSandbox (orbit-ai-sandbox).
//
// A resposta do LLM não é determinística, então os testes cobrem:
//   1) O system prompt gerado por `buildSystemPrompt` — garante que os
//      guardrails anti-autorrevelação (SDR/IA/robô), anti-emoji, anti-"site"
//      e anti-"Lead" estão presentes; e que sem prompt_identidade a função
//      não deve gerar prompt genérico (o handler retorna 409 antes disso).
//   2) Um validador `assertSandboxReplyIsClean` para qualquer texto de
//      resposta — real ou fixture — que falha se violar as mesmas regras,
//      incluindo autorrevelação como SDR/IA/robô/assistente.
//
// Testes de contrato HTTP (401/400/403/409) do handler são cobertos por
// smoke autenticado em ambiente com sessão real; o handler encerra cedo
// antes de qualquer chamada ao LLM nesses casos.

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

const EMOJI_RE = /[\p{Extended_Pictographic}\p{Emoji_Presentation}]/u;
const SELF_REVEAL_RE = /\b(SDR|Sales Development Representative|IA|intelig[eê]ncia artificial|rob[oô]|bot|assistente virtual)\b/i;

export function assertSandboxReplyIsClean(reply: string, opts: { leadNome?: string } = {}) {
  assertFalse(EMOJI_RE.test(reply), `resposta contém emoji: ${reply}`);
  assertFalse(/\bsite\b/i.test(reply), `resposta menciona "site" indevidamente: ${reply}`);
  assertFalse(SELF_REVEAL_RE.test(reply), `resposta se autorrevela como SDR/IA/robô: ${reply}`);
  if (!opts.leadNome || !opts.leadNome.trim()) {
    assertFalse(/\bLead\b/.test(reply), `resposta chama a pessoa de "Lead" sem nome: ${reply}`);
  }
}

Deno.test("buildSystemPrompt injeta guardrails anti-autorrevelação e do webhook Typebot", () => {
  const prompt = buildSystemPrompt(
    { prompt_identidade: "Você é Fernanda, representante da Viver Semijoias." },
    TYPEBOT_LEAD_SEM_NOME,
    "inbound_webhook",
  );

  // Anti-autorrevelação (global)
  assertStringIncludes(prompt, "NUNCA se apresente como");
  assertStringIncludes(prompt, "SDR");
  assertStringIncludes(prompt, "IA");
  assertStringIncludes(prompt, "robô");
  assertStringIncludes(prompt, "assistente virtual");
  assertStringIncludes(prompt, "representante da empresa");

  // Identidade preservada do tenant
  assertStringIncludes(prompt, "Viver Semijoias");

  // Guardrails do gatilho
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
  try { assertSandboxReplyIsClean("Oi, tudo bem? 😊", { leadNome: "" }); } catch { threw = true; }
  assert(threw, "esperava falha por emoji");
});

Deno.test("assertSandboxReplyIsClean falha quando resposta menciona 'site'", () => {
  let threw = false;
  try { assertSandboxReplyIsClean("Vi que voce se cadastrou no site.", { leadNome: "" }); } catch { threw = true; }
  assert(threw, "esperava falha por 'site'");
});

Deno.test("assertSandboxReplyIsClean falha quando chama a pessoa de 'Lead' sem nome", () => {
  let threw = false;
  try { assertSandboxReplyIsClean("Oi, Lead! Tudo bem?", { leadNome: "" }); } catch { threw = true; }
  assert(threw, "esperava falha por chamar de 'Lead' sem nome");
});

Deno.test("assertSandboxReplyIsClean falha quando a resposta se autorrevela como SDR", () => {
  let threw = false;
  try { assertSandboxReplyIsClean("Oi! Sou o SDR responsavel pelo seu atendimento.", { leadNome: "" }); } catch { threw = true; }
  assert(threw, "esperava falha por autorrevelação SDR");
});

Deno.test("assertSandboxReplyIsClean falha quando resposta se identifica como IA/robô/assistente virtual", () => {
  for (const bad of [
    "Oi, sou uma IA da Viver.",
    "Sou um robô treinado pela empresa.",
    "Sou seu assistente virtual da Viver Semijoias.",
    "Sou uma inteligencia artificial da Viver.",
  ]) {
    let threw = false;
    try { assertSandboxReplyIsClean(bad, { leadNome: "Fernanda" }); } catch { threw = true; }
    assert(threw, `esperava falha para autorrevelação: ${bad}`);
  }
});
