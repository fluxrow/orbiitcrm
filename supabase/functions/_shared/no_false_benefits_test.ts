import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  detectFalseBenefits,
  enforceNoFalseBenefits,
  readFalseBenefitsGuardConfig,
  sanitizeFalseBenefits,
} from "./no-false-benefits.ts";

Deno.test("flag ausente/false => guard desligado (outros tenants intactos)", () => {
  assertEquals(readFalseBenefitsGuardConfig(null), null);
  assertEquals(readFalseBenefitsGuardConfig({}), null);
  assertEquals(readFalseBenefitsGuardConfig({ false_benefits_guard: { enabled: false } }), null);
  assertEquals(readFalseBenefitsGuardConfig({ false_benefits_guard: { enabled: true } }), { enabled: true });
  const original = "Você terá acesso à IA especialista e ao grupo de WhatsApp.";
  assertEquals(enforceNoFalseBenefits(original, false).text, original);
});

Deno.test("A. entregáveis verdadeiros passam", () => {
  const t = "São 3 meses de acompanhamento individual direto comigo. Definimos nicho validado, idiomas e a estrutura do canal.";
  assertEquals(detectFalseBenefits(t).violates, false);
  assertEquals(enforceNoFalseBenefits(t, true).changed, false);
});

Deno.test("B/C. negativa honesta sobre IA e grupo passa", () => {
  const b = "Acesso a IA não faz parte da oferta. O acompanhamento é individual comigo por 3 meses.";
  const c = "Não temos grupo de WhatsApp. O acompanhamento é individual direto comigo.";
  assertEquals(detectFalseBenefits(b).violates, false);
  assertEquals(detectFalseBenefits(c).violates, false);
});

Deno.test("D. promessa falsa é detectada e sanitizada por cláusula", () => {
  const t = "São 3 meses comigo. Você terá acesso à IA especialista e ao grupo de WhatsApp.";
  const v = detectFalseBenefits(t);
  assertEquals(v.violates, true);
  const out = enforceNoFalseBenefits(t, true);
  assertEquals(out.changed, true);
  assertEquals(out.text, "São 3 meses comigo.");
});

Deno.test("D2. promessa isolada cai no fallback honesto", () => {
  const out = enforceNoFalseBenefits("Libero pra você a ferramenta de IA da mentoria.", true);
  assertEquals(out.fallbackUsed, true);
  assertEquals(detectFalseBenefits(out.text).violates, false);
});

Deno.test("E. uso técnico de IA no método é permitido", () => {
  const t = "Sim, o método usa IA na produção dos vídeos e na pesquisa de nicho. Quer entender o processo?";
  assertEquals(detectFalseBenefits(t).violates, false);
});

Deno.test("F. regressão: preço, PIX e prova social intactos", () => {
  const t = "A mentoria é R$ 6.500 no PIX ou 12x de R$ 650. Te mando um resultado de aluno agora.";
  assertEquals(detectFalseBenefits(t).violates, false);
  assertEquals(sanitizeFalseBenefits(t), t);
});

Deno.test("G. grupo/comunidade prometidos são bloqueados", () => {
  assertEquals(detectFalseBenefits("Você entra na comunidade exclusiva de alunos.").violates, true);
  assertEquals(detectFalseBenefits("Tem suporte em grupo todos os dias.").violates, true);
});
