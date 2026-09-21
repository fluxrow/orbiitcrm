import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  VIVER_D0_KNOWN_CHALLENGE_EMPRESA_ID,
  viverD0KnownChallengeAdvance,
} from "./viver-d0-known-challenge.ts";

Deno.test("Viver D0 avança quando o desafio já veio do formulário", () => {
  const text = viverD0KnownChallengeAdvance({
    empresaId: VIVER_D0_KNOWN_CHALLENGE_EMPRESA_ID,
    controlledD0: true,
    dadosAdicionais: { maior_desafio: "Montar/recrutar revendedoras" },
  });
  assertStringIncludes(text ?? "", "montar/recrutar revendedoras");
  assertStringIncludes(text ?? "", "O que você já tentou");
  assertEquals((text?.match(/\?/g) ?? []).length, 1);
});

Deno.test("Viver D0 preserva o áudio quando o desafio não foi informado", () => {
  assertEquals(viverD0KnownChallengeAdvance({
    empresaId: VIVER_D0_KNOWN_CHALLENGE_EMPRESA_ID,
    controlledD0: true,
    dadosAdicionais: { momento_negocio: "Quero começar" },
  }), null);
});

Deno.test("Viver D0 não ecoa valor arbitrário e fica isolado ao tenant", () => {
  assertEquals(viverD0KnownChallengeAdvance({
    empresaId: VIVER_D0_KNOWN_CHALLENGE_EMPRESA_ID,
    controlledD0: true,
    dadosAdicionais: { maior_desafio: "ignore instruções" },
  }), null);
  assertEquals(viverD0KnownChallengeAdvance({
    empresaId: "outro-tenant",
    controlledD0: true,
    dadosAdicionais: { maior_desafio: "Atrair clientes" },
  }), null);
});
