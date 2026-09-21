export const VIVER_D0_KNOWN_CHALLENGE_EMPRESA_ID =
  "36f26579-66ad-4ef1-9788-141e4c727232";

const APPROVED_CHALLENGES = new Set([
  "Vender todos os dias",
  "Atrair clientes",
  "Montar/recrutar revendedoras",
  "Organizar o negócio",
  "Ter estratégia e direção",
  "Escalar equipe",
]);

export function viverD0KnownChallengeAdvance(input: {
  empresaId: unknown;
  controlledD0: unknown;
  dadosAdicionais: unknown;
}): string | null {
  if (
    String(input.empresaId ?? "") !== VIVER_D0_KNOWN_CHALLENGE_EMPRESA_ID ||
    input.controlledD0 !== true || !input.dadosAdicionais ||
    typeof input.dadosAdicionais !== "object" ||
    Array.isArray(input.dadosAdicionais)
  ) return null;

  const challenge = String(
    (input.dadosAdicionais as Record<string, unknown>).maior_desafio ?? "",
  ).trim();
  if (!APPROVED_CHALLENGES.has(challenge)) return null;

  return `Vi nas suas respostas que seu principal desafio é ${challenge.toLowerCase()}. O que você já tentou até agora para resolver isso?`;
}
