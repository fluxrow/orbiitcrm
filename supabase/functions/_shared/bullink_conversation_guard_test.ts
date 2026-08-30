import {
  BULLINK_EMPRESA_ID,
  BULLINK_MENTORSHIP_INCLUDES_RECORDED_REPLY,
  BULLINK_RECORDED_COURSE_DETAILS_REPLY,
  BULLINK_RECORDED_COURSE_REPLY,
  enforceBullinkConversationGuard,
  isExplicitRecordedCoursePriceRequest,
  isExplicitRecordedCourseRequest,
  isMentorshipRecordedContentInclusionQuestion,
  readBullinkOfficialPixKey,
} from "./bullink-conversation-guard.ts";

const OTHER_TENANT = "36f26579-0000-0000-0000-000000000000";

Deno.test("Bullink: remove 'Sou eu mesmo, Fernando' sem apagar a resposta útil", () => {
  const result = enforceBullinkConversationGuard({
    empresaId: BULLINK_EMPRESA_ID,
    inbound: "Pô, achei que estava falando com alguém de verdade",
    response: "Desculpa se soou repetitivo. Sou eu mesmo, Fernando, conduzindo direto. O que você quer entender?",
  });
  if (!result.changed || !result.reasons.includes("persona_self_confirmation")) throw new Error(JSON.stringify(result));
  if (/sou eu mesmo|fernando/i.test(result.text)) throw new Error(result.text);
  if (!result.text.includes("O que você quer entender?")) throw new Error(result.text);
});

Deno.test("Bullink: cobre equivalentes de autoconfirmação", () => {
  for (const response of [
    "É o Fernando mesmo falando com você. Como posso ajudar?",
    "Aqui é o Fernando Albuquerque. Vamos continuar?",
    "Eu sou o Fernando. O que ficou de dúvida?",
  ]) {
    const result = enforceBullinkConversationGuard({ empresaId: BULLINK_EMPRESA_ID, inbound: "Oi", response });
    if (!result.reasons.includes("persona_self_confirmation")) throw new Error(response);
    if (/fernando/i.test(result.text)) throw new Error(result.text);
  }
});

Deno.test("Bullink: interesse no formato gravado recebe explicação sem preço", () => {
  for (const inbound of ["E o formato gravado? O que tem nele?", "Como é o curso?", "Você tem aulas gravadas?"]) {
    if (!isExplicitRecordedCourseRequest(inbound)) throw new Error(`intent não detectada: ${inbound}`);
    if (isExplicitRecordedCoursePriceRequest(inbound)) throw new Error(`falso pedido de preço: ${inbound}`);
    const result = enforceBullinkConversationGuard({
      empresaId: BULLINK_EMPRESA_ID,
      inbound,
      response: "Você prefere começar com os 3 meses de mentoria individual?",
      previousAgentQuestions: [],
    });
    if (!result.reasons.includes("explicit_recorded_course_unanswered")) throw new Error(JSON.stringify(result));
    if (result.text !== BULLINK_RECORDED_COURSE_DETAILS_REPLY) throw new Error(result.text);
    if (/997|R\$/.test(result.text)) throw new Error(`preço antecipado: ${result.text}`);
  }
});

Deno.test("Bullink: preço do Curso só aparece quando o lead pede preço explicitamente", () => {
  for (const inbound of [
    "Qual o valor do curso?",
    "Quanto custa o gravado?",
    "Tem uma versão só de curso mais barata?",
    "Qual é o investimento no Curso Gravado?",
  ]) {
    if (!isExplicitRecordedCoursePriceRequest(inbound)) throw new Error(`preço não detectado: ${inbound}`);
    const result = enforceBullinkConversationGuard({
      empresaId: BULLINK_EMPRESA_ID,
      inbound,
      response: "O Curso Gravado tem módulos práticos e você segue no seu ritmo.",
    });
    if (result.text !== BULLINK_RECORDED_COURSE_REPLY) throw new Error(result.text);
    if (!/997/.test(result.text)) throw new Error(`preço ausente: ${result.text}`);
  }
});

Deno.test("Regressão Bullink 28/08: perguntas gerais reais não recebem R$ 997", () => {
  for (const inbound of [
    "E o conteúdo gravado?",
    "Gostaria de saber mais sobre seu curso.",
    "Olá, como funciona o curso e a mentoria YouTube?",
  ]) {
    const result = enforceBullinkConversationGuard({
      empresaId: BULLINK_EMPRESA_ID,
      inbound,
      response: BULLINK_RECORDED_COURSE_REPLY,
    });
    if (result.text !== BULLINK_RECORDED_COURSE_DETAILS_REPLY) throw new Error(result.text);
    if (!result.reasons.includes("recorded_course_price_not_requested")) {
      throw new Error(JSON.stringify(result));
    }
    if (/997|R\$/.test(result.text)) throw new Error(`preço antecipado: ${result.text}`);
  }
});

Deno.test("Bullink: mera menção ou recusa do curso não força a oferta", () => {
  for (const inbound of [
    "Não quero curso gravado",
    "Já fiz um curso antes e quero acompanhamento",
    "Já comprei conteúdo gravado e não gostei",
    "Curso gravado nunca funciona pra mim",
  ]) {
    if (isExplicitRecordedCourseRequest(inbound)) throw new Error(`falso positivo: ${inbound}`);
    const response = "Entendi. O acompanhamento individual dura 3 meses. Qual é sua principal dúvida?";
    const result = enforceBullinkConversationGuard({ empresaId: BULLINK_EMPRESA_ID, inbound, response });
    if (result.changed || result.text !== response) throw new Error(JSON.stringify(result));
  }
});

Deno.test("Bullink: pergunta curta 'E o gravado?' continua sendo pedido explícito", () => {
  if (!isExplicitRecordedCourseRequest("E o gravado?")) throw new Error("pedido curto não detectado");
});

Deno.test("Bullink: conteúdo gravado incluso mantém a Mentoria como oferta ativa", () => {
  for (const inbound of [
    "Faz sim. Junto vem o conteúdo gravado?",
    "A Mentoria inclui o curso gravado?",
    "Esse valor inclui as aulas gravadas?",
    "Na mentoria eu tenho acesso ao conteúdo gravado?",
  ]) {
    if (!isMentorshipRecordedContentInclusionQuestion(inbound)) {
      throw new Error(`inclusão não detectada: ${inbound}`);
    }
    if (isExplicitRecordedCourseRequest(inbound)) {
      throw new Error(`falso pedido de curso avulso: ${inbound}`);
    }
    const result = enforceBullinkConversationGuard({
      empresaId: BULLINK_EMPRESA_ID,
      inbound,
      response: BULLINK_RECORDED_COURSE_REPLY,
    });
    if (!result.reasons.includes("mentorship_recorded_content_inclusion")) {
      throw new Error(JSON.stringify(result));
    }
    if (result.text !== BULLINK_MENTORSHIP_INCLUDES_RECORDED_REPLY) {
      throw new Error(result.text);
    }
    if (/R\$\s*997/.test(result.text)) throw new Error(`downsell indevido: ${result.text}`);
  }
});

Deno.test("Regressão Bullink 28/08: aceite da Mentoria seguido de dúvida sobre o gravado não faz downsell", () => {
  const result = enforceBullinkConversationGuard({
    empresaId: BULLINK_EMPRESA_ID,
    inbound: "faz sim\njunto vem o conteúdo gravado?",
    response: "Sim. Tenho o Curso Gravado por R$ 997 à vista no PIX, com o mesmo método da Mentoria, mas sem acompanhamento individual. Quer que eu te explique como funciona?",
  });
  if (result.text !== BULLINK_MENTORSHIP_INCLUDES_RECORDED_REPLY) throw new Error(result.text);
  if (!result.reasons.includes("mentorship_recorded_content_inclusion")) throw new Error(JSON.stringify(result));
});

Deno.test("Bullink: objeção financeira recebe downsell imediato e respeitoso", () => {
  const result = enforceBullinkConversationGuard({
    empresaId: BULLINK_EMPRESA_ID,
    inbound: "Está muito alto pra mim",
    response: "A Mentoria custa R$ 6.500 no PIX ou 12x de R$ 650. Faz sentido?",
  });
  if (!result.reasons.includes("budget_objection_without_downsell")) throw new Error(JSON.stringify(result));
  if (!/Curso Gravado/.test(result.text) || !/997/.test(result.text)) throw new Error(result.text);
  if (/6\.500|12x/.test(result.text)) throw new Error(result.text);
});

Deno.test("Regressão Rogério 29/08: alcance financeiro exige Curso com R$ 997", () => {
  const result = enforceBullinkConversationGuard({
    empresaId: BULLINK_EMPRESA_ID,
    inbound: "sim, faz. mas infelizmente está fora do meu alcance financeiro",
    response: "Entendo. Tenho o Curso Gravado com o mesmo método. Faz sentido pra você?",
  });
  if (!result.reasons.includes("budget_objection_without_downsell")) throw new Error(JSON.stringify(result));
  if (!/Curso Gravado/.test(result.text) || !/997/.test(result.text)) throw new Error(result.text);
});

Deno.test("Regressão Rogério 29/08: aceite do Curso entrega PIX sem ciclo de permissões", () => {
  const fakeKey = "11111111-2222-3333-4444-555555555555";
  const extracted = readBullinkOfficialPixKey({
    prompt_regras: `Após escolha por PIX, use exclusivamente a chave ${fakeKey} e peça o comprovante.`,
  });
  if (extracted !== fakeKey) throw new Error("chave oficial não extraída");
  const result = enforceBullinkConversationGuard({
    empresaId: BULLINK_EMPRESA_ID,
    inbound: "sim",
    response: "Perfeito. Quer que eu te passe os dados agora?",
    commercialState: {
      product_focus: "curso",
      price_informed: { product: "curso" },
      awaiting_offer_confirmation: "curso",
    },
    officialPixKey: fakeKey,
  });
  if (!result.reasons.includes("course_purchase_confirmation_without_payment_details")) {
    throw new Error(JSON.stringify(result));
  }
  if (!result.text.includes(fakeKey) || !/R\$ 997/.test(result.text) || !/comprovante/i.test(result.text)) {
    throw new Error(result.text);
  }
  if (/quer que eu|posso te passar/i.test(result.text)) throw new Error(result.text);
});

Deno.test("Bullink: pergunta exatamente repetida é removida", () => {
  const repeated = "Você prefere começar com os 3 meses de mentoria individual?";
  const result = enforceBullinkConversationGuard({
    empresaId: BULLINK_EMPRESA_ID,
    inbound: "Pode explicar melhor?",
    response: repeated,
    previousAgentQuestions: [repeated],
  });
  if (!result.reasons.includes("repeated_question")) throw new Error(JSON.stringify(result));
  if (result.text === repeated || !result.text) throw new Error(result.text);
});

Deno.test("Regressão do diálogo real: duas perguntas sobre gravado não recebem Mentoria repetida", () => {
  const previous = ["Você prefere começar com os 3 meses de mentoria individual?"];
  const result = enforceBullinkConversationGuard({
    empresaId: BULLINK_EMPRESA_ID,
    inbound: "Como é o formato gravado?",
    response: "Você prefere começar com os 3 meses de mentoria individual?",
    previousAgentQuestions: previous,
  });
  if (result.text !== BULLINK_RECORDED_COURSE_DETAILS_REPLY) throw new Error(result.text);
  if (!result.reasons.includes("explicit_recorded_course_unanswered")) throw new Error(JSON.stringify(result));
});

Deno.test("Isolamento: outro tenant permanece byte-for-byte", () => {
  const original = "Sou eu mesmo, Fernando. Você prefere a Mentoria?";
  const result = enforceBullinkConversationGuard({
    empresaId: OTHER_TENANT,
    inbound: "Está caro, tem curso gravado?",
    response: original,
    previousAgentQuestions: ["Você prefere a Mentoria?"],
  });
  if (result.changed || result.text !== original || result.reasons.length) throw new Error(JSON.stringify(result));
});
