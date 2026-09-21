export const VIVER_PRODUCT_LADDER_EMPRESA_ID =
  "36f26579-66ad-4ef1-9788-141e4c727232";

const LOW_CAPITAL_VALUES = new Set([
  "ate r 1 500 00",
  "de r 1 600 00 a r 3 000 00",
]);

function normalize(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function isViverLowCapital(value: unknown): boolean {
  const normalized = normalize(value);
  if (LOW_CAPITAL_VALUES.has(normalized)) return true;
  const digits = normalized.match(/\d+/g)?.join("") ?? "";
  const amount = Number(digits.slice(0, 4));
  return Number.isFinite(amount) && amount > 0 && amount <= 3000;
}

export function enforceViverProductLadder(input: {
  empresaId: unknown;
  response: unknown;
  capitalValue: unknown;
}): { text: string; changed: boolean; reason?: string } {
  const text = String(input.response ?? "").trim();
  if (
    String(input.empresaId ?? "") !== VIVER_PRODUCT_LADDER_EMPRESA_ID ||
    !isViverLowCapital(input.capitalValue)
  ) return { text, changed: false };

  const normalized = normalize(text);
  const individualInvite =
    /\b(conversa individual|call individual|conversa comigo|agendar uma conversa|marcar uma conversa)\b/.test(normalized) ||
    /\b(meta de r? ?50 mil|buscar r? ?50 mil)\b/.test(normalized) ||
    /\bessa conversa (e|eh) sem custo\b/.test(normalized) ||
    (/\b(melhor|qual) (dia|horario|periodo)\b/.test(normalized) && /\b(conversa|call)\b/.test(normalized));
  if (!individualInvite) return { text, changed: false };

  return {
    text:
      "A orientação inicial é sem custo. Pelo seu momento, o passo mais útil agora é a aula em grupo de quarta-feira às 19h30, onde vou mostrar como organizar as primeiras vendas e a equipe. Quer receber o acesso?",
    changed: true,
    reason: "low_capital_individual_call_blocked",
  };
}
