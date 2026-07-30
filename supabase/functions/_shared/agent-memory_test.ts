import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.208.0/assert/mod.ts";
import {
  hydrateCanonicalFacts,
  buildCanonicalFactsBlock,
  detectRepetition,
  recentAgentQuestions,
  buildDeterministicFallback,
  stripPersonaReintroduction,
  containsPersonaReintroduction,
  detectQuestionField,
  resolveCanonicalKey,
} from "./agent-memory.ts";
import { normalizeAgentText } from "./pt-br-normalizer.ts";

function finalize(text: string, allowIntro = false) {
  const n = normalizeAgentText(text);
  return allowIntro ? n : normalizeAgentText(stripPersonaReintroduction(n));
}

// Cenário Ebsamar: Typebot já enviou nível e localização.
const prospectEbsamar = {
  nome_contato: "Ana",
  cidade: "Belo Horizonte",
  estado: "MG",
  dados_adicionais: {
    objetivo_nivel: "Mestrado",
    area_pretendida: "Educação",
  },
};

Deno.test("hidrata fatos do formulário (nível + localização)", () => {
  const facts = hydrateCanonicalFacts({ prospect: prospectEbsamar, aiContexto: {}, mensagens: [] });
  assertEquals(facts.objetivo_nivel.value, "Mestrado");
  assertEquals(facts.cidade.value, "Belo Horizonte");
  assertEquals(facts.estado.value, "MG");
  assertEquals(facts.nome.value, "Ana");
});

Deno.test("hidrata fatos aninhados no raw do Typebot", () => {
  const facts = hydrateCanonicalFacts({
    prospect: { dados_adicionais: { raw: { nivel_pretendido: "Doutorado", cidade: "Recife" } } },
  });
  assertEquals(facts.objetivo_nivel.value, "Doutorado");
  assertEquals(facts.cidade.value, "Recife");
});

Deno.test("bloco canônico é autoritativo no prompt", () => {
  const block = buildCanonicalFactsBlock(hydrateCanonicalFacts({ prospect: prospectEbsamar }));
  assertStringIncludes(block, "FATOS CANÔNICOS");
  assertStringIncludes(block, "Mestrado");
  assertStringIncludes(block, "NUNCA pergunte novamente");
});

Deno.test("prioridade: correção explícita > ai_contexto > prospect > dados_adicionais", () => {
  const facts = hydrateCanonicalFacts({
    prospect: prospectEbsamar,
    aiContexto: { campos_coletados: { cidade: "Contagem" } },
    mensagens: [{ direcao: "IN", mensagem: "na verdade é doutorado, me confundi" }],
  });
  assertEquals(facts.cidade.value, "Contagem");
  assertEquals(facts.cidade.source, "ai_contexto");
  assertEquals(facts.objetivo_nivel.value, "doutorado");
  assertEquals(facts.objetivo_nivel.source, "correction");
});

Deno.test("REGRESSÃO: não pode perguntar mestrado ou doutorado quando já é Mestrado", () => {
  const facts = hydrateCanonicalFacts({ prospect: prospectEbsamar });
  const v = detectRepetition("Legal! Você busca mestrado ou doutorado?", facts, []);
  assert(v.violates);
  assertEquals(v.reason, "asks_known_field");
  assertEquals(v.field, "objetivo_nivel");
});

Deno.test("REGRESSÃO: não pode perguntar cidade/estado já conhecidos", () => {
  const facts = hydrateCanonicalFacts({ prospect: prospectEbsamar });
  assert(detectRepetition("De qual cidade você fala?", facts, []).violates);
  assert(detectRepetition("Qual estado você mora?", facts, []).violates);
});

Deno.test("não bloqueia pergunta sobre campo realmente ausente", () => {
  const facts = hydrateCanonicalFacts({ prospect: prospectEbsamar });
  assertEquals(detectRepetition("Qual área você pretende seguir?", facts, []).violates, true);
  assertEquals(detectRepetition("Como está sua rotina de estudos hoje?", facts, []).violates, false);
});

Deno.test("não confunde pergunta de prazo com objetivo já conhecido", () => {
  const facts = hydrateCanonicalFacts({ prospect: prospectEbsamar });
  assertEquals(detectQuestionField("Quando você pretende iniciar o mestrado?"), "prazo");
  assertEquals(detectRepetition("Quando você pretende iniciar o mestrado?", facts, []).violates, false);
});

Deno.test("bloqueia repetição de pergunta recente do agente", () => {
  const mensagens = [
    { direcao: "OUT", mensagem: "Você já tem um projeto de pesquisa escrito?" },
    { direcao: "IN", mensagem: "ainda nao" },
  ];
  const prev = recentAgentQuestions(mensagens);
  assertEquals(prev.length, 1);
  const v = detectRepetition("Você já tem um projeto de pesquisa escrito?", {}, prev);
  assert(v.violates);
  assertEquals(v.reason, "repeats_recent_question");
});

Deno.test("fallback determinístico pergunta apenas o próximo campo ausente", () => {
  const facts = hydrateCanonicalFacts({ prospect: prospectEbsamar });
  const out = buildDeterministicFallback(
    facts,
    [
      { key: "objetivo_nivel", pergunta: "Você busca mestrado ou doutorado?" },
      { key: "cidade", pergunta: "Qual sua cidade?" },
      { key: "prazo", pergunta: "Para quando você precisa disso" },
    ],
  );
  assertEquals(out, "Para quando você precisa disso?");
});

Deno.test("REGRESSÃO: resposta a áudio não reapresenta a persona nem traz travessão", () => {
  const raw = "Oi! Aqui é a Patrícia — recebi seu áudio, voce pode me contar mais?";
  const out = finalize(raw, false);
  assertEquals(containsPersonaReintroduction(out), false);
  assertEquals(out.includes("Patrícia"), false);
  assertEquals(out.includes("—"), false);
  assertEquals(out.includes("–"), false);
  assertStringIncludes(out, "você");
});

Deno.test("REGRESSÃO: remove saudação nominal junto da reapresentação", () => {
  const out = finalize("Oi, Ebsamar! Aqui é a Patrícia mesmo. Entendi o que você explicou no áudio.", false);
  assertEquals(out, "Entendi o que você explicou no áudio.");
});

Deno.test("variantes de reapresentação são removidas", () => {
  for (const v of ["Sou a Patrícia, tudo bem?", "É a Patrícia mesmo!", "Quem fala é a Patrícia."]) {
    assert(containsPersonaReintroduction(v), v);
  }
  assertEquals(containsPersonaReintroduction("Vou te explicar o processo do edital."), false);
});

Deno.test("primeira mensagem preserva apresentação", () => {
  const raw = "Oi! Aqui é a Patrícia. Como posso ajudar?";
  assertStringIncludes(finalize(raw, true), "Patrícia");
});

Deno.test("aliases tenant-neutros resolvem chaves de origem", () => {
  assertEquals(resolveCanonicalKey("nivel_pretendido"), "objetivo_nivel");
  assertEquals(resolveCanonicalKey("Município"), "cidade");
  assertEquals(resolveCanonicalKey("linha de pesquisa"), "area_pretendida");
  assertEquals(resolveCanonicalKey("faixa de investimento"), "renda_capital");
  assertEquals(resolveCanonicalKey("campo_inexistente_xyz"), null);
});
