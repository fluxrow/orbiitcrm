import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  detectEmailCollection,
  sanitizeEmailCollection,
  enforceNoEmailCollection,
  EMAIL_GUARD_FALLBACK,
} from "./no-email-collection.ts";

const BLOCKED = [
  "Qual seu melhor email?",
  "Qual é o seu e-mail principal?",
  "Me passa teu e-mail",
  "Preciso do email para liberar acesso.",
  "Vou precisar do seu e-mail para enviar os detalhes.",
  "Pode me informar seu endereço eletrônico?",
  "Confirma seu e-mail para o cadastro?",
];

const ALLOWED = [
  "Não enviamos por e-mail, seguimos por aqui mesmo.",
  "A gente não usa e-mail nesse processo, tudo acontece no WhatsApp.",
  "Show, anotei. Qual é o seu objetivo com o canal?",
  "Mentoria no cartão fica 12x de R$ 642,44.",
  "Prefere fazer à vista no PIX ou parcelado no cartão de crédito?",
  "Te mando um vídeo com resultados de alunos agora.",
];

Deno.test("NE1: pedidos de e-mail são detectados", () => {
  for (const t of BLOCKED) {
    assert(detectEmailCollection(t).violates, `deveria bloquear: ${t}`);
  }
});

Deno.test("NE2: respostas informativas e comerciais são permitidas", () => {
  for (const t of ALLOWED) {
    assertEquals(detectEmailCollection(t).violates, false, `não deveria bloquear: ${t}`);
  }
});

Deno.test("NE3: sanitização remove apenas a sentença de coleta", () => {
  const out = sanitizeEmailCollection(
    "Perfeito, faz sentido pra você. Me passa seu melhor e-mail? Prefere PIX ou cartão?",
  );
  assertEquals(out, "Perfeito, faz sentido pra você. Prefere PIX ou cartão?");
  assertEquals(detectEmailCollection(out).violates, false);
});

Deno.test("NE4: fallback neutro quando sobra texto vazio", () => {
  const r = enforceNoEmailCollection("Qual seu melhor e-mail?", true);
  assertEquals(r.text, EMAIL_GUARD_FALLBACK);
  assert(r.fallbackUsed);
  assertEquals(detectEmailCollection(r.text).violates, false);
  assert(!/pix|cartão|link/i.test(r.text));
});

Deno.test("NE5: e-mail espontâneo do lead não gera pedido de confirmação", () => {
  // Texto do agente após lead informar e-mail: apenas segue a conversa.
  const ok = "Anotado. Quer que eu te explique como funcionam os 3 meses de acompanhamento?";
  assertEquals(detectEmailCollection(ok).violates, false);
  // Já uma confirmação explícita do endereço é bloqueada.
  assert(detectEmailCollection("Confirma seu e-mail, por favor?").violates);
});

Deno.test("NE6: tenant sem a trava mantém comportamento anterior", () => {
  const original = "Qual seu melhor e-mail?";
  const r = enforceNoEmailCollection(original, false);
  assertEquals(r.text, original);
  assertEquals(r.changed, false);
});

Deno.test("NE7: notificações internas com e-mail existente permanecem intactas", () => {
  const notif = "Novo lead qualificado: Marcus. E-mail: marcus@teste.com. Telefone: 5547999999999.";
  // A trava só é aplicada ao texto de resposta do agente; ainda assim o padrão
  // informativo não é classificado como coleta.
  assertEquals(detectEmailCollection(notif).violates, false);
  assertEquals(enforceNoEmailCollection(notif, true).text, notif);
});

Deno.test("NE8: preço/PIX/cartão e prova social sem regressão", () => {
  const msgs = [
    "Perfeito! Para você, fica melhor fazer à vista no PIX ou parcelado no cartão de crédito?",
    "No cartão fica 12x de R$ 642,44, link: https://pay.hypercash.com.br/pt/payment-link/043ec27e-a362-4d27-82c3-f66f61b867bb",
    "Chave PIX: 3decde76-2e47-410a-8193-8bd3a50317d7. Me manda o comprovante depois?",
    "Vou te mandar um vídeo curto com resultados reais de alunos.",
  ];
  for (const m of msgs) {
    assertEquals(enforceNoEmailCollection(m, true).text, m, `regressão em: ${m}`);
  }
});
