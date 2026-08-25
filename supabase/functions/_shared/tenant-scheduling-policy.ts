export const VIVER_EMPRESA_ID = "36f26579-66ad-4ef1-9788-141e4c727232";
export const VIVER_TIMEZONE = "America/Sao_Paulo";

export function schedulingPolicy<T extends object>(empresaId: string | null | undefined, token: T): T {
  if (empresaId !== VIVER_EMPRESA_ID) return { ...token };
  return { ...token, timezone: VIVER_TIMEZONE, availability_start: "13:00:00", availability_end: "17:00:00" } as T;
}

export function isAmbiguousSlotAcceptance(message: string, optionCount: number): boolean {
  if (optionCount < 2) return false;
  const text = String(message ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  return /^(ok|okay|pode ser|beleza|fechado|combinado|sim|ta bom|tudo bem)[!. ]*$/.test(text);
}

export function selectExplicitSuggestion(
  message: string,
  suggestions: Array<{ label?: string; label_full?: string; start?: string }>,
) {
  const text = String(message ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/\b(primeir[oa]|opcao 1|1\s*[ªa])\b/.test(text)) return suggestions[0];
  if (/\b(segund[oa]|opcao 2|2\s*[ªa])\b/.test(text)) return suggestions[1];
  return suggestions.find((s) => {
    const labels = [s.label, s.label_full].filter(Boolean).map((v) => String(v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase());
    return labels.some((label) => label.length >= 4 && text.includes(label));
  });
}
