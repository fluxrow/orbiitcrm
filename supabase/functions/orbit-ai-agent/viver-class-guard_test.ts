import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildCanonicalClassDelivery,
  buildClassInviteEmailRequest,
  declinedClassInviteEmail,
  enforceCanonicalClassLink,
  extractCanonicalClassUrl,
  extractClassInviteEmail,
  isExplicitClassAcceptance,
  previousAssistantOfferedClassAccess,
  renderCanonicalClassTemplate,
  viverClassPhase,
} from "./viver-class-guard.ts";

const canonical =
  `Perfeito, {{nome}}. Aqui esta o link da aula ao vivo: https://meet.google.com/esz-wgwt-pge\n\nA aula sera na terca-feira, as 19:30.`;

Deno.test("aceite explícito após oferta de acesso entrega template canônico", () => {
  const messages = [
    {
      direcao: "OUT",
      mensagem: "Quer que eu te mande o link para participar da aula?",
      timestamp: "2026-08-25T18:00:00Z",
    },
    { direcao: "IN", mensagem: "Sim", timestamp: "2026-08-25T18:01:00Z" },
  ];
  assertEquals(previousAssistantOfferedClassAccess(messages, "Sim"), true);
  const rendered = renderCanonicalClassTemplate(canonical, "Eunice");
  assert(rendered.includes("Eunice"));
  assert(rendered.includes("https://meet.google.com/esz-wgwt-pge"));
});

Deno.test("sim para pergunta sem aula não dispara link", () => {
  const messages = [
    {
      direcao: "OUT",
      mensagem: "Você já trabalha com revendedoras?",
      timestamp: "2026-08-25T18:00:00Z",
    },
    { direcao: "IN", mensagem: "Sim", timestamp: "2026-08-25T18:01:00Z" },
  ];
  assertEquals(previousAssistantOfferedClassAccess(messages, "Sim"), false);
});

Deno.test("confirmação vaga ou texto livre não é interpretado como aceite", () => {
  const messages = [{
    direcao: "OUT",
    mensagem: "Quer receber o acesso da aula?",
  }];
  assertEquals(previousAssistantOfferedClassAccess(messages, "não sei"), false);
  assertEquals(
    previousAssistantOfferedClassAccess(messages, "tenho sim uma loja"),
    false,
  );
});

Deno.test("extrai somente um Google Meet canônico", () => {
  assertEquals(
    extractCanonicalClassUrl(canonical),
    "https://meet.google.com/esz-wgwt-pge",
  );
  assertEquals(
    extractCanonicalClassUrl("https://viverjoias.com.br/aula-gratis"),
    null,
  );
  assertEquals(
    extractCanonicalClassUrl(`${canonical} https://meet.google.com/outro`),
    null,
  );
});

Deno.test("substitui landing page e link histórico pelo template canônico", () => {
  for (
    const wrong of [
      "Aula: https://viverjoias.com.br/aula-gratis",
      "Link da aula: https://vivermais.online/aulagratuita",
      "Link da aula: https://meet.google.com/historico",
      "Link da aula: https://bit.ly/endereco-inventado",
    ]
  ) {
    const guarded = enforceCanonicalClassLink(wrong, canonical, "Franciane");
    assertEquals(guarded.changed, true);
    assertEquals(guarded.reason, "non_authoritative_class_link");
    assert(guarded.text.includes("https://meet.google.com/esz-wgwt-pge"));
    assert(!guarded.text.includes("historico"));
  }
});

Deno.test("preserva link canônico e respostas sem conteúdo de aula", () => {
  assertEquals(
    enforceCanonicalClassLink(
      "Link da aula: https://meet.google.com/esz-wgwt-pge",
      canonical,
    ).changed,
    false,
  );
  assertEquals(
    enforceCanonicalClassLink(
      "Entendi. Qual é seu principal desafio?",
      canonical,
    ).changed,
    false,
  );
});

Deno.test("controle temporal distingue antes, durante e depois da aula em São Paulo", () => {
  assertEquals(viverClassPhase(new Date("2026-08-25T22:29:59Z")), "upcoming");
  assertEquals(
    viverClassPhase(new Date("2026-08-25T22:30:00Z")),
    "in_progress",
  );
  assertEquals(viverClassPhase(new Date("2026-08-26T00:00:00Z")), "next_week");
});

Deno.test("durante a aula usa linguagem presente e o link canônico", () => {
  const text = buildCanonicalClassDelivery(
    canonical,
    "Franciane",
    new Date("2026-08-25T22:39:00Z"),
  );
  assert(text.includes("já está acontecendo"));
  assert(text.includes("https://meet.google.com/esz-wgwt-pge"));
  assert(!text.includes("sera na terca"));
});

Deno.test("falha fechada se não houver autoridade válida para link de aula", () => {
  const guarded = enforceCanonicalClassLink(
    "Link da aula: https://viverjoias.com.br/aula-gratis",
    null,
  );
  assertEquals(guarded.changed, true);
  assertEquals(guarded.reason, "class_link_authority_missing");
  assert(!guarded.text.includes("http"));
});

Deno.test("aceite pode coletar e-mail para convite sem torná-lo obrigatório", () => {
  assertEquals(
    extractClassInviteEmail("Pode mandar em Pessoa.Exemplo+agenda@Email.com"),
    "pessoa.exemplo+agenda@email.com",
  );
  assertEquals(extractClassInviteEmail("manda por aqui"), null);
  assertEquals(
    declinedClassInviteEmail("Não quero passar e-mail, manda por aqui"),
    true,
  );
  assert(
    buildClassInviteEmailRequest("Ana").includes(
      "Se preferir não informar, tudo bem",
    ),
  );
});

Deno.test("aceite natural após oferta explícita da aula", () => {
  assertEquals(isExplicitClassAcceptance("Sim, quero que libere o acesso."), true);
  assertEquals(isExplicitClassAcceptance("Quero participar da aula"), true);
  assertEquals(isExplicitClassAcceptance("Pode me enviar o acesso"), true);
});
