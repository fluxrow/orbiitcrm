import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  detectLocationCollection,
  sanitizeLocationCollection,
  enforceNoLocationCollection,
  LOCATION_GUARD_FALLBACK,
} from "./no-location-collection.ts";

const BLOCKED = [
  "Qual cidade você mora?",
  "Qual é a sua cidade?",
  "Perfeito, então o caminho está mais claro. Pra finalizar: qual é a sua cidade?",
  "Agora só falta me dizer a sua cidade e estado para finalizar o cadastro.",
  "Anotado. Você mora em qual cidade?",
  "Me informa seu estado, por favor.",
  "De onde você fala?",
  "Onde você mora?",
  "Em que cidade você atua?",
  "Só pra completar o cadastro, me passa a localização.",
];

const ALLOWED = [
  "A mentoria é 100% online, então independe da cidade.",
  "Show, anotei. Qual é o seu objetivo com o canal?",
  "Mentoria no cartão fica 12x de R$ 642,44.",
  "Prefere fazer à vista no PIX ou parcelado no cartão de crédito?",
  "Te mando um vídeo com resultados de alunos agora.",
  "Fechado, vou te enviar o link de pagamento oficial da InfinitePay.",
  "Qual nicho você pretende trabalhar?",
  "Você já tem canal ativo hoje?",
];

Deno.test("NL1: pedidos de localização e cadastro são detectados", () => {
  for (const t of BLOCKED) {
    assert(detectLocationCollection(t).violates, `deveria bloquear: ${t}`);
  }
});

Deno.test("NL2: conversa comercial legítima não é bloqueada", () => {
  for (const t of ALLOWED) {
    assertEquals(detectLocationCollection(t).violates, false, `não deveria bloquear: ${t}`);
  }
});

Deno.test("NL3: sanitização remove apenas a sentença ofensiva", () => {
  const out = sanitizeLocationCollection(
    "Faz sentido pra você. Pra finalizar: qual é a sua cidade? Prefere PIX ou cartão?",
  );
  assertEquals(out, "Faz sentido pra você. Prefere PIX ou cartão?");
  assertEquals(detectLocationCollection(out).violates, false);
});

Deno.test("NL4: fallback neutro quando sobra texto vazio", () => {
  const r = enforceNoLocationCollection("Qual cidade você mora?", true);
  assertEquals(r.text, LOCATION_GUARD_FALLBACK);
  assert(r.fallbackUsed);
  assertEquals(detectLocationCollection(r.text).violates, false);
  assert(!/pix|cart[ãa]o|link/i.test(r.text));
});

Deno.test("NL5: tenant sem a trava mantém comportamento anterior", () => {
  const original = "Qual é a sua cidade?";
  const r = enforceNoLocationCollection(original, false);
  assertEquals(r.text, original);
  assertEquals(r.changed, false);
});

Deno.test("NL6: cidade informada espontaneamente pelo lead não gera reação proibida", () => {
  const ok = "Boa! Então vamos falar do que importa: o que você quer alcançar em 3 meses?";
  assertEquals(detectLocationCollection(ok).violates, false);
});

Deno.test("NL7: preço/PIX/prova social sem regressão sob a trava ativa", () => {
  const msgs = [
    "Para você fica melhor à vista no PIX ou parcelado no cartão de crédito?",
    "No cartão fica 12x de R$ 642,44.",
    "Chave PIX enviada. Me manda o comprovante depois?",
    "Vou te mandar um vídeo curto com resultados reais de alunos.",
  ];
  for (const m of msgs) {
    assertEquals(enforceNoLocationCollection(m, true).text, m, `regressão em: ${m}`);
  }
});
