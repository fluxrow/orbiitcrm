import {
  BULLINK_BUDGET_DOWNSELL_REPLY,
  BULLINK_COURSE_CONTINUITY_REPLY,
  BULLINK_EMPRESA_ID,
  BULLINK_LEAD_SOURCE_REPLY,
  BULLINK_MENTORSHIP_INCLUDES_RECORDED_REPLY,
  BULLINK_MENTORSHIP_PAYMENT_METHOD_REPLY,
  BULLINK_PRIMARY_OFFER_LOCK_REPLY,
  BULLINK_RECORDED_COURSE_DETAILS_REPLY,
  BULLINK_RECORDED_COURSE_PRICE_REPLY,
  BULLINK_RECORDED_COURSE_REPLY,
  BULLINK_RESULTS_TIMELINE_REPLY,
  enforceBullinkConversationGuard,
  inferBullinkConversationProductFocus,
  isExplicitRecordedCoursePriceRequest,
  isExplicitRecordedCourseRequest,
  isMentorshipRecordedContentInclusionQuestion,
  readBullinkOfficialCardUrl,
  readBullinkOfficialPixKey,
  shouldDeferBullinkSaleHandoff,
} from "./bullink-conversation-guard.ts";

const OTHER_TENANT = "36f26579-0000-0000-0000-000000000000";

Deno.test("Bullink: remove 'Sou eu mesmo, Fernando' sem apagar a resposta útil", () => {
  const result = enforceBullinkConversationGuard({
    empresaId: BULLINK_EMPRESA_ID,
    inbound: "Pô, achei que estava falando com alguém de verdade",
    response:
      "Desculpa se soou repetitivo. Sou eu mesmo, Fernando, conduzindo direto. O que você quer entender?",
  });
  if (
    !result.changed || !result.reasons.includes("persona_self_confirmation")
  ) throw new Error(JSON.stringify(result));
  if (/sou eu mesmo|fernando/i.test(result.text)) throw new Error(result.text);
  if (!result.text.includes("O que você quer entender?")) {
    throw new Error(result.text);
  }
});

Deno.test("Bullink: cobre equivalentes de autoconfirmação", () => {
  for (
    const response of [
      "É o Fernando mesmo falando com você. Como posso ajudar?",
      "Aqui é o Fernando Albuquerque. Vamos continuar?",
      "Eu sou o Fernando. O que ficou de dúvida?",
    ]
  ) {
    const result = enforceBullinkConversationGuard({
      empresaId: BULLINK_EMPRESA_ID,
      inbound: "Oi",
      response,
    });
    if (!result.reasons.includes("persona_self_confirmation")) {
      throw new Error(response);
    }
    if (/fernando/i.test(result.text)) throw new Error(result.text);
  }
});

Deno.test("Bullink: interesse no formato gravado sem objeção permanece na Mentoria", () => {
  for (
    const inbound of [
      "E o formato gravado? O que tem nele?",
      "Como é o curso?",
      "Você tem aulas gravadas?",
    ]
  ) {
    if (!isExplicitRecordedCourseRequest(inbound)) {
      throw new Error(`intent não detectada: ${inbound}`);
    }
    if (isExplicitRecordedCoursePriceRequest(inbound)) {
      throw new Error(`falso pedido de preço: ${inbound}`);
    }
    const result = enforceBullinkConversationGuard({
      empresaId: BULLINK_EMPRESA_ID,
      inbound,
      response: "Você prefere começar com os 3 meses de mentoria individual?",
      previousAgentQuestions: [],
    });
    if (
      !result.reasons.includes("secondary_requested_before_budget_objection")
    ) throw new Error(JSON.stringify(result));
    if (result.text !== BULLINK_MENTORSHIP_INCLUDES_RECORDED_REPLY) {
      throw new Error(result.text);
    }
    if (/997/.test(result.text)) {
      throw new Error(`downsell antecipado: ${result.text}`);
    }
  }
});

Deno.test("Bullink: pergunta de preço do Curso sem objeção não libera a alternativa", () => {
  for (
    const inbound of [
      "Qual o valor do curso?",
      "Quanto custa o gravado?",
      "Tem uma versão só de curso mais barata?",
      "Qual é o investimento no Curso Gravado?",
    ]
  ) {
    if (!isExplicitRecordedCoursePriceRequest(inbound)) {
      throw new Error(`preço não detectado: ${inbound}`);
    }
    const result = enforceBullinkConversationGuard({
      empresaId: BULLINK_EMPRESA_ID,
      inbound,
      response:
        "O Curso Gravado tem módulos práticos e você segue no seu ritmo.",
    });
    if (result.text !== BULLINK_PRIMARY_OFFER_LOCK_REPLY) {
      throw new Error(result.text);
    }
    if (/997/.test(result.text)) {
      throw new Error(`preço secundário indevido: ${result.text}`);
    }
    if (
      !result.reasons.includes("secondary_requested_before_budget_objection")
    ) throw new Error(JSON.stringify(result));
  }
});

Deno.test("Regressão Gabriela: pergunta pelo gravado e valores de cada responde só Mentoria", () => {
  const result = enforceBullinkConversationGuard({
    empresaId: BULLINK_EMPRESA_ID,
    inbound:
      "O gravado é certinho passo a passo, mas qual seria os valores de cada?",
    response:
      "A Mentoria fica R$ 6.500 à vista no PIX. O Curso Gravado custa R$ 997 à vista no PIX.",
    commercialState: { product_focus: "curso", budget_objection: false },
  });
  if (result.text !== BULLINK_PRIMARY_OFFER_LOCK_REPLY) {
    throw new Error(result.text);
  }
  if (/997|Curso Gravado/i.test(result.text)) {
    throw new Error(`cardápio não removido: ${result.text}`);
  }
  if (!result.reasons.includes("secondary_requested_before_budget_objection")) {
    throw new Error(JSON.stringify(result));
  }
});

Deno.test("Regressão Bullink 28/08: perguntas gerais reais permanecem somente na Mentoria", () => {
  for (
    const inbound of [
      "E o conteúdo gravado?",
      "Gostaria de saber mais sobre seu curso.",
      "Olá, como funciona o curso e a mentoria YouTube?",
    ]
  ) {
    const result = enforceBullinkConversationGuard({
      empresaId: BULLINK_EMPRESA_ID,
      inbound,
      response: BULLINK_RECORDED_COURSE_REPLY,
    });
    if (result.text !== BULLINK_MENTORSHIP_INCLUDES_RECORDED_REPLY) {
      throw new Error(result.text);
    }
    if (
      !result.reasons.includes("secondary_requested_before_budget_objection")
    ) {
      throw new Error(JSON.stringify(result));
    }
    if (/997|R\$/.test(result.text)) {
      throw new Error(`preço antecipado: ${result.text}`);
    }
  }
});

Deno.test("Bullink: mera menção ou recusa do curso não força a oferta", () => {
  for (
    const inbound of [
      "Não quero curso gravado",
      "Já fiz um curso antes e quero acompanhamento",
      "Já comprei conteúdo gravado e não gostei",
      "Curso gravado nunca funciona pra mim",
    ]
  ) {
    if (isExplicitRecordedCourseRequest(inbound)) {
      throw new Error(`falso positivo: ${inbound}`);
    }
    const response =
      "Entendi. O acompanhamento individual dura 3 meses. Qual é sua principal dúvida?";
    const result = enforceBullinkConversationGuard({
      empresaId: BULLINK_EMPRESA_ID,
      inbound,
      response,
    });
    if (result.changed || result.text !== response) {
      throw new Error(JSON.stringify(result));
    }
  }
});

Deno.test("Bullink: pergunta curta 'E o gravado?' continua sendo pedido explícito", () => {
  if (!isExplicitRecordedCourseRequest("E o gravado?")) {
    throw new Error("pedido curto não detectado");
  }
});

Deno.test("Bullink: conteúdo gravado incluso mantém a Mentoria como oferta ativa", () => {
  for (
    const inbound of [
      "Faz sim. Junto vem o conteúdo gravado?",
      "A Mentoria inclui o curso gravado?",
      "Esse valor inclui as aulas gravadas?",
      "Na mentoria eu tenho acesso ao conteúdo gravado?",
    ]
  ) {
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
    if (/R\$\s*997/.test(result.text)) {
      throw new Error(`downsell indevido: ${result.text}`);
    }
  }
});

Deno.test("Regressão Bullink 28/08: aceite da Mentoria seguido de dúvida sobre o gravado não faz downsell", () => {
  const result = enforceBullinkConversationGuard({
    empresaId: BULLINK_EMPRESA_ID,
    inbound: "faz sim\njunto vem o conteúdo gravado?",
    response:
      "Sim. Tenho o Curso Gravado por R$ 997 à vista no PIX, com o mesmo método da Mentoria, mas sem acompanhamento individual. Quer que eu te explique como funciona?",
  });
  if (result.text !== BULLINK_MENTORSHIP_INCLUDES_RECORDED_REPLY) {
    throw new Error(result.text);
  }
  if (!result.reasons.includes("mentorship_recorded_content_inclusion")) {
    throw new Error(JSON.stringify(result));
  }
});

Deno.test("Regressão Diogo 30/08: aula gravada ou ao vivo permanece na Mentoria em foco", () => {
  const result = enforceBullinkConversationGuard({
    empresaId: BULLINK_EMPRESA_ID,
    inbound: "Tem aula gravada ou só ao vivo? Aulas todos os dias?",
    response: BULLINK_RECORDED_COURSE_REPLY,
    commercialState: { product_focus: "mentoria" },
  });
  if (result.text !== BULLINK_MENTORSHIP_INCLUDES_RECORDED_REPLY) {
    throw new Error(result.text);
  }
  if (!result.reasons.includes("mentorship_recorded_content_inclusion")) {
    throw new Error(JSON.stringify(result));
  }
});

Deno.test("Bullink: objeção financeira recebe downsell imediato e respeitoso", () => {
  const result = enforceBullinkConversationGuard({
    empresaId: BULLINK_EMPRESA_ID,
    inbound: "Está muito alto pra mim",
    response: "A Mentoria custa R$ 6.500 no PIX ou 12x de R$ 650. Faz sentido?",
  });
  if (!result.reasons.includes("budget_objection_without_downsell")) {
    throw new Error(JSON.stringify(result));
  }
  if (!/Curso Gravado/.test(result.text) || !/997/.test(result.text)) {
    throw new Error(result.text);
  }
  if (/6\.500|12x/.test(result.text)) throw new Error(result.text);
});

Deno.test("Regressão Rogério 29/08: alcance financeiro exige Curso com R$ 997", () => {
  const result = enforceBullinkConversationGuard({
    empresaId: BULLINK_EMPRESA_ID,
    inbound: "sim, faz. mas infelizmente está fora do meu alcance financeiro",
    response:
      "Entendo. Tenho o Curso Gravado com o mesmo método. Faz sentido pra você?",
  });
  if (!result.reasons.includes("budget_objection_without_downsell")) {
    throw new Error(JSON.stringify(result));
  }
  if (!/Curso Gravado/.test(result.text) || !/997/.test(result.text)) {
    throw new Error(result.text);
  }
});

Deno.test("Regressão Ivan 30/08: expectativa financeira exige downsell imediato", () => {
  for (
    const inbound of [
      "Acho um pouco acima do valor da minha expectativa",
      "Fica acima da expectativa",
      "Nesse momento não teria esse investimento",
      "Muito além do meu orçamento",
    ]
  ) {
    const result = enforceBullinkConversationGuard({
      empresaId: BULLINK_EMPRESA_ID,
      inbound,
      response:
        "Entendo. O parcelamento ajuda. Fica dentro da sua expectativa?",
    });
    if (result.text !== BULLINK_BUDGET_DOWNSELL_REPLY) {
      throw new Error(`${inbound}: ${result.text}`);
    }
  }
});

Deno.test("Regressão Marcelo 31/08: 'além do que eu posso' exige Curso com preço", () => {
  const result = enforceBullinkConversationGuard({
    empresaId: BULLINK_EMPRESA_ID,
    inbound:
      "Entendo sua história, mas esse valor no momento é além do que eu posso",
    response:
      "Entendo. Tenho uma opção mais acessível em formato gravado. Quer conhecer?",
  });
  if (result.text !== BULLINK_BUDGET_DOWNSELL_REPLY) {
    throw new Error(result.text);
  }
  if (!result.reasons.includes("budget_objection_without_downsell")) {
    throw new Error(JSON.stringify(result));
  }
});

Deno.test("Regressão Marcelo 31/08: histórico do downsell recupera foco do Curso", () => {
  const recentMessages = [
    {
      direcao: "OUT",
      mensagem: "O investimento da Mentoria é R$ 6.500 à vista no PIX.",
    },
    {
      direcao: "IN",
      mensagem: "Esse valor no momento é além do que eu posso.",
    },
    {
      direcao: "OUT",
      mensagem:
        "Tenho uma opção mais acessível com o mesmo método em formato gravado, sem acompanhamento individual.",
    },
    { direcao: "IN", mensagem: "Se não for atrapalhar, pode explicar." },
    {
      direcao: "OUT",
      mensagem: "O Curso Gravado funciona em aulas no seu ritmo. Te interessa?",
    },
    { direcao: "IN", mensagem: "Interessa." },
  ];
  const focus = inferBullinkConversationProductFocus({
    empresaId: BULLINK_EMPRESA_ID,
    recentMessages,
    stateFocus: "mentoria",
  });
  if (focus !== "curso") throw new Error(`foco incorreto: ${focus}`);

  const result = enforceBullinkConversationGuard({
    empresaId: BULLINK_EMPRESA_ID,
    inbound: "A questão maior que eu precisaria saber ainda é o preço",
    response: "Entendo.",
    recentMessages,
    commercialState: { product_focus: "mentoria" },
  });
  if (result.text !== BULLINK_RECORDED_COURSE_PRICE_REPLY) {
    throw new Error(result.text);
  }
  if (!result.reasons.includes("course_context_price_unanswered")) {
    throw new Error(JSON.stringify(result));
  }
  if (!/R\$ 997/.test(result.text)) {
    throw new Error(`preço ausente: ${result.text}`);
  }
});

Deno.test("Bullink: conteúdo gravado incluso mantém o foco da Mentoria", () => {
  const focus = inferBullinkConversationProductFocus({
    empresaId: BULLINK_EMPRESA_ID,
    recentMessages: [
      { direcao: "OUT", mensagem: BULLINK_MENTORSHIP_INCLUDES_RECORDED_REPLY },
      { direcao: "IN", mensagem: "E qual o preço?" },
    ],
    stateFocus: "mentoria",
  });
  if (focus !== "mentoria") throw new Error(`foco incorreto: ${focus}`);
});

Deno.test("Regressão Marcos 30/08: origem do contato nunca é descartada", () => {
  for (
    const inbound of [
      "Inicialmente onde você viu minhas respostas?",
      "Bullink? O que é isso?",
    ]
  ) {
    const result = enforceBullinkConversationGuard({
      empresaId: BULLINK_EMPRESA_ID,
      inbound,
      response: "Voltando ao que importa: a Mentoria faz sentido para você?",
    });
    if (result.text !== BULLINK_LEAD_SOURCE_REPLY) throw new Error(result.text);
    if (!result.reasons.includes("lead_source_question_unanswered")) {
      throw new Error(JSON.stringify(result));
    }
  }
});

Deno.test("Regressão Luiz 30/08: prazo de resultado é respondido sem downsell inventado", () => {
  const result = enforceBullinkConversationGuard({
    empresaId: BULLINK_EMPRESA_ID,
    inbound:
      "Qual o prazo médio para um mentorado atingir faturamento de R$ 10.000 por mês?",
    response: "Faz mais sentido para você? Tenho o Curso Gravado por R$ 997.",
    commercialState: { product_focus: "mentoria" },
  });
  if (result.text !== BULLINK_RESULTS_TIMELINE_REPLY) {
    throw new Error(result.text);
  }
  if (!result.reasons.includes("results_timeline_question_unanswered")) {
    throw new Error(JSON.stringify(result));
  }
});

Deno.test("Regressão Fernando 01/09: pergunta de payback não repete preço", () => {
  const result = enforceBullinkConversationGuard({
    empresaId: BULLINK_EMPRESA_ID,
    inbound:
      "Em quanto tempo é esperado o retorno e o payback do investimento?",
    response:
      "Não trabalho com prazo ou garantia de retorno. A Mentoria custa R$ 6.500 à vista no PIX ou 12x de R$ 650 no cartão. Quer seguir com a inscrição?",
    recentMessages: [{
      direcao: "OUT",
      mensagem:
        "O investimento é R$ 6.500 à vista no PIX ou 12x de R$ 650 no cartão.",
    }],
    commercialState: { product_focus: "mentoria" },
  });
  if (result.text !== BULLINK_RESULTS_TIMELINE_REPLY) {
    throw new Error(result.text);
  }
  if (!result.reasons.includes("results_timeline_question_unanswered")) {
    throw new Error(JSON.stringify(result));
  }
  if (/6[.]?500|12x|650/.test(result.text)) {
    throw new Error(`preço repetido: ${result.text}`);
  }
});

Deno.test("Bullink: histórico real bloqueia preço repetido fora de pergunta comercial", () => {
  const result = enforceBullinkConversationGuard({
    empresaId: BULLINK_EMPRESA_ID,
    inbound: "E como funciona?",
    response:
      "Nos 3 meses você tem acesso direto comigo para tirar dúvidas. O investimento é R$ 6.500 à vista no PIX ou 12x de R$ 650 no cartão. Qual parte você quer que eu detalhe mais?",
    recentMessages: [{
      direcao: "OUT",
      mensagem:
        "A Mentoria custa R$ 6.500 à vista no PIX ou 12x de R$ 650 no cartão.",
    }],
    commercialState: { product_focus: "mentoria" },
  });
  if (!result.reasons.includes("repeated_mentorship_price")) {
    throw new Error(JSON.stringify(result));
  }
  if (/6[.]?500|12x|650/.test(result.text)) {
    throw new Error(`preço repetido: ${result.text}`);
  }
  if (!result.text.includes("acesso direto comigo")) {
    throw new Error(`resposta útil removida: ${result.text}`);
  }
});

Deno.test("Bullink: pedido explícito permite repetir preço", () => {
  const response =
    "Claro. O investimento é R$ 6.500 à vista no PIX ou 12x de R$ 650 no cartão.";
  const result = enforceBullinkConversationGuard({
    empresaId: BULLINK_EMPRESA_ID,
    inbound: "Pode repetir o valor e as condições de pagamento?",
    response,
    recentMessages: [{
      direcao: "OUT",
      mensagem:
        "A Mentoria custa R$ 6.500 à vista no PIX ou 12x de R$ 650 no cartão.",
    }],
    commercialState: { product_focus: "mentoria" },
  });
  if (
    result.text !== response ||
    result.reasons.includes("repeated_mentorship_price")
  ) {
    throw new Error(JSON.stringify(result));
  }
});

Deno.test("Bullink: Curso não é oferecido sem pedido, objeção ou foco anterior", () => {
  const result = enforceBullinkConversationGuard({
    empresaId: BULLINK_EMPRESA_ID,
    inbound: "Quero entender melhor a mentoria",
    response: "Tenho também o Curso Gravado por R$ 997. Quer conhecer?",
    commercialState: { product_focus: "mentoria" },
  });
  if (!result.reasons.includes("unsolicited_recorded_course_offer")) {
    throw new Error(JSON.stringify(result));
  }
  if (/curso|997/i.test(result.text)) throw new Error(result.text);
});

Deno.test("Regressão Ivan 30/08: interesse no Curso não volta sozinho para a Mentoria", () => {
  const result = enforceBullinkConversationGuard({
    empresaId: BULLINK_EMPRESA_ID,
    inbound: "Interessante",
    response:
      "Quer seguir com a Mentoria completa ou prefere pensar mais um pouco?",
    commercialState: {
      product_focus: "curso",
      budget_objection: true,
      budget_objection_verified: true,
    },
  });
  if (result.text !== BULLINK_COURSE_CONTINUITY_REPLY) {
    throw new Error(result.text);
  }
  if (!result.reasons.includes("course_context_regressed_to_mentorship")) {
    throw new Error(JSON.stringify(result));
  }
  if (/997/.test(result.text)) {
    throw new Error(`preço repetido: ${result.text}`);
  }
});

Deno.test("Regressão Rogério 29/08: aceite do Curso entrega PIX sem ciclo de permissões", () => {
  const fakeKey = "11111111-2222-3333-4444-555555555555";
  const extracted = readBullinkOfficialPixKey({
    prompt_regras:
      `Após escolha por PIX, use exclusivamente a chave ${fakeKey} e peça o comprovante.`,
  });
  if (extracted !== fakeKey) throw new Error("chave oficial não extraída");
  const result = enforceBullinkConversationGuard({
    empresaId: BULLINK_EMPRESA_ID,
    inbound: "sim",
    response: "Perfeito. Quer que eu te passe os dados agora?",
    commercialState: {
      product_focus: "curso",
      budget_objection: true,
      budget_objection_verified: true,
      price_informed: { product: "curso" },
      awaiting_offer_confirmation: "curso",
    },
    officialPixKey: fakeKey,
  });
  if (
    !result.reasons.includes(
      "course_purchase_confirmation_without_payment_details",
    )
  ) {
    throw new Error(JSON.stringify(result));
  }
  if (
    !result.text.includes(fakeKey) || !/R\$ 997/.test(result.text) ||
    !/comprovante/i.test(result.text)
  ) {
    throw new Error(result.text);
  }
  if (/quer que eu|posso te passar/i.test(result.text)) {
    throw new Error(result.text);
  }
});

Deno.test("Regressão 01/09: estado legado sem prova não libera Curso", () => {
  const result = enforceBullinkConversationGuard({
    empresaId: BULLINK_EMPRESA_ID,
    inbound: "Quero avaliar com calma antes de decidir",
    response:
      "Tenho o Curso Gravado por R$ 997 à vista no PIX. Quer que eu explique?",
    commercialState: {
      product_focus: "curso",
      budget_objection: true,
      budget_objection_verified: false,
    },
    recentMessages: [
      {
        direcao: "IN",
        mensagem: "Estou avaliando as condições e o retorno esperado.",
      },
    ],
  });
  if (!result.reasons.includes("unsolicited_recorded_course_offer")) {
    throw new Error(JSON.stringify(result));
  }
  if (/curso|997/i.test(result.text)) {
    throw new Error(`oferta secundária indevida: ${result.text}`);
  }
});

Deno.test("Regressão Bullink 31/08: aceite da Mentoria pergunta a forma de pagamento", () => {
  const result = enforceBullinkConversationGuard({
    empresaId: BULLINK_EMPRESA_ID,
    inbound: "Sim",
    response: "Perfeito! Então te envio os dados. Qual é o melhor horário?",
    commercialState: {
      product_focus: "mentoria",
      price_informed: { product: "mentoria" },
      awaiting_offer_confirmation: "mentoria",
    },
  });
  if (result.text !== BULLINK_MENTORSHIP_PAYMENT_METHOD_REPLY) {
    throw new Error(result.text);
  }
  if (
    !result.reasons.includes(
      "mentorship_purchase_confirmation_without_payment_choice",
    )
  ) {
    throw new Error(JSON.stringify(result));
  }
  if (/hor[aá]rio/i.test(result.text)) throw new Error(result.text);
});

Deno.test("Bullink: aceite da Mentoria reconstrói oferta pelo diálogo se o estado estiver atrasado", () => {
  const result = enforceBullinkConversationGuard({
    empresaId: BULLINK_EMPRESA_ID,
    inbound: "sim",
    response: "Perfeito. Vou pedir para a equipe falar com você.",
    recentMessages: [{
      direcao: "OUT",
      sender_type: "ai",
      mensagem:
        "A Mentoria custa R$ 6.500 à vista no PIX ou 12x de R$ 650 no cartão. Faz sentido para você?",
    }],
    commercialState: {
      product_focus: null,
      price_informed: null,
      awaiting_offer_confirmation: null,
    },
  });
  if (result.text !== BULLINK_MENTORSHIP_PAYMENT_METHOD_REPLY) {
    throw new Error(result.text);
  }
});

Deno.test("Bullink: escolha PIX após aceite entrega somente a chave oficial", () => {
  const key = "11111111-2222-3333-4444-555555555555";
  const result = enforceBullinkConversationGuard({
    empresaId: BULLINK_EMPRESA_ID,
    inbound: "PIX",
    response: "Perfeito. Qual é o melhor horário?",
    commercialState: {
      product_focus: "mentoria",
      price_informed: { product: "mentoria" },
      awaiting_offer_confirmation: null,
      awaiting_payment_method: true,
      closing_intent_at: "2026-08-31T16:07:00.000Z",
    },
    officialPixKey: key,
  });
  if (
    !result.reasons.includes("mentorship_pix_choice_without_payment_details")
  ) throw new Error(JSON.stringify(result));
  if (!result.text.includes(key) || !/comprovante/i.test(result.text)) {
    throw new Error(result.text);
  }
  if (/hor[aá]rio|cart[aã]o/i.test(result.text)) throw new Error(result.text);
});

Deno.test("Bullink: escolha cartão após aceite entrega somente o link oficial", () => {
  const url = "https://link.infinitepay.io/empresa/oferta-segura";
  const extracted = readBullinkOfficialCardUrl({
    prompt_regras: `Para cartão, use exclusivamente ${url}.`,
  });
  if (extracted !== url) throw new Error(`link não extraído: ${extracted}`);
  const result = enforceBullinkConversationGuard({
    empresaId: BULLINK_EMPRESA_ID,
    inbound: "Prefiro no cartão",
    response: "Perfeito. Vou verificar e te aviso.",
    commercialState: {
      product_focus: "mentoria",
      price_informed: { product: "mentoria" },
      awaiting_offer_confirmation: null,
      awaiting_payment_method: true,
      closing_intent_at: "2026-08-31T16:07:00.000Z",
    },
    officialCardUrl: url,
  });
  if (
    !result.reasons.includes("mentorship_card_choice_without_payment_details")
  ) throw new Error(JSON.stringify(result));
  if (!result.text.includes(url) || !/12x de R\$ 650/i.test(result.text)) {
    throw new Error(result.text);
  }
  if (/pix|hor[aá]rio/i.test(result.text)) throw new Error(result.text);
});

Deno.test("Bullink: configuração incompleta nunca inventa dado de pagamento", () => {
  const result = enforceBullinkConversationGuard({
    empresaId: BULLINK_EMPRESA_ID,
    inbound: "PIX",
    response: "Vou confirmar os dados corretos e sigo com você por aqui.",
    commercialState: {
      product_focus: "mentoria",
      price_informed: { product: "mentoria" },
      awaiting_offer_confirmation: null,
      awaiting_payment_method: true,
      closing_intent_at: "2026-08-31T16:07:00.000Z",
    },
    officialPixKey: null,
  });
  if (result.changed) throw new Error(JSON.stringify(result));
  if (/chave|https?:\/\//i.test(result.text)) throw new Error(result.text);
});

Deno.test("Bullink: venda permanece com a IA até concluir dados de pagamento", () => {
  if (
    !shouldDeferBullinkSaleHandoff({
      empresaId: BULLINK_EMPRESA_ID,
      intent: "venda_fechada",
      officialPixKey: "11111111-2222-3333-4444-555555555555",
      officialCardUrl: "https://link.infinitepay.io/empresa/oferta-segura",
    })
  ) throw new Error("checkout completo deveria adiar handoff");
  if (
    shouldDeferBullinkSaleHandoff({
      empresaId: OTHER_TENANT,
      intent: "venda_fechada",
      officialPixKey: "11111111-2222-3333-4444-555555555555",
      officialCardUrl: "https://link.infinitepay.io/empresa/oferta-segura",
    })
  ) throw new Error("outro tenant não pode mudar");
  if (
    shouldDeferBullinkSaleHandoff({
      empresaId: BULLINK_EMPRESA_ID,
      intent: "venda_fechada",
      officialPixKey: null,
      officialCardUrl: null,
    })
  ) throw new Error("configuração incompleta deve manter fallback humano");
});

Deno.test("Bullink: pergunta exatamente repetida é removida", () => {
  const repeated =
    "Você prefere começar com os 3 meses de mentoria individual?";
  const result = enforceBullinkConversationGuard({
    empresaId: BULLINK_EMPRESA_ID,
    inbound: "Pode explicar melhor?",
    response: repeated,
    previousAgentQuestions: [repeated],
  });
  if (!result.reasons.includes("repeated_question")) {
    throw new Error(JSON.stringify(result));
  }
  if (result.text === repeated || !result.text) throw new Error(result.text);
});

Deno.test("Regressão do diálogo real: pergunta sobre gravado sem objeção mantém oferta principal", () => {
  const previous = [
    "Você prefere começar com os 3 meses de mentoria individual?",
  ];
  const result = enforceBullinkConversationGuard({
    empresaId: BULLINK_EMPRESA_ID,
    inbound: "Como é o formato gravado?",
    response: "Você prefere começar com os 3 meses de mentoria individual?",
    previousAgentQuestions: previous,
  });
  if (result.text !== BULLINK_MENTORSHIP_INCLUDES_RECORDED_REPLY) {
    throw new Error(result.text);
  }
  if (!result.reasons.includes("secondary_requested_before_budget_objection")) {
    throw new Error(JSON.stringify(result));
  }
});

Deno.test("Isolamento: outro tenant permanece byte-for-byte", () => {
  const original = "Sou eu mesmo, Fernando. Você prefere a Mentoria?";
  const result = enforceBullinkConversationGuard({
    empresaId: OTHER_TENANT,
    inbound: "Está caro, tem curso gravado?",
    response: original,
    previousAgentQuestions: ["Você prefere a Mentoria?"],
  });
  if (result.changed || result.text !== original || result.reasons.length) {
    throw new Error(JSON.stringify(result));
  }
});
