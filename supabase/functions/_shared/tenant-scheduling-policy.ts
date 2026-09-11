export const VIVER_EMPRESA_ID = "36f26579-66ad-4ef1-9788-141e4c727232";
export const VIVER_TIMEZONE = "America/Sao_Paulo";

export type ViverRescheduleState = {
  active: boolean;
  requested_at?: string | null;
  reason?: "change_day" | "declined_today" | null;
};

function normalizeSchedulingText(message: string): string {
  return String(message ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export function detectsViverDayChangeIntent(message: string): boolean {
  const text = normalizeSchedulingText(message);
  return /\b(?:outro\s+(?:dia|horario)|amanha|dia\s+(?:[0-3]?\d|seguinte)|proxima\s+semana|semana\s+que\s+vem|nao\s+(?:posso|consigo)\s+hoje|hoje\s+nao\s+(?:posso|consigo)|preciso\s+(?:de\s+)?outro\s+dia)\b/.test(text);
}

export function declinesViverCurrentDay(message: string): boolean {
  const text = normalizeSchedulingText(message);
  return /\b(?:nao\s+(?:posso|consigo)\s+hoje|hoje\s+nao\s+(?:posso|consigo)|preciso\s+(?:de\s+)?outro\s+dia|outro\s+dia)\b/.test(text);
}

export function hasExplicitSchedulingDate(message: string): boolean {
  const text = normalizeSchedulingText(message);
  return /\bamanha\b|\b(?:domingo|segunda(?:-feira)?|terca(?:-feira)?|quarta(?:-feira)?|quinta(?:-feira)?|sexta(?:-feira)?|sabado)\b|\bdia\s+(?:[0-3]?\d)\b|\b(?:0?[1-9]|[12]\d|3[01])[\/.\-](?:0?[1-9]|1[0-2])(?:[\/.\-]\d{2,4})?\b/.test(text);
}

export function hasExplicitSchedulingTime(message: string): boolean {
  const text = normalizeSchedulingText(message);
  return /\b(?:as\s+)?(?:[01]?\d|2[0-3])(?::[0-5]\d|h(?:[0-5]\d)?)\b/.test(text);
}

export function shouldClarifyViverReschedule(input: {
  empresaId: string | null | undefined;
  message: string;
  state?: ViverRescheduleState | null;
  selectedPreviouslyProposedSlot?: boolean;
}): { blocked: boolean; nextState: ViverRescheduleState | null; reason?: string } {
  if (input.empresaId !== VIVER_EMPRESA_ID) return { blocked: false, nextState: input.state ?? null };
  const changeIntent = detectsViverDayChangeIntent(input.message);
  const active = input.state?.active === true || changeIntent;
  if (!active) return { blocked: false, nextState: null };

  const hasDateAndTime = hasExplicitSchedulingDate(input.message) && hasExplicitSchedulingTime(input.message);
  if (hasDateAndTime || input.selectedPreviouslyProposedSlot === true) {
    return { blocked: false, nextState: null };
  }
  return {
    blocked: true,
    nextState: {
      active: true,
      requested_at: input.state?.requested_at ?? null,
      reason: declinesViverCurrentDay(input.message) ? "declined_today" : (input.state?.reason ?? "change_day"),
    },
    reason: changeIntent ? "viver_reschedule_requested" : "viver_reschedule_awaiting_explicit_date_time",
  };
}

export function schedulingPolicy<T extends object>(empresaId: string | null | undefined, token: T): T {
  if (empresaId !== VIVER_EMPRESA_ID) return { ...token };
  return { ...token, timezone: VIVER_TIMEZONE, availability_start: "13:00:00", availability_end: "17:00:00" } as T;
}

export function isAmbiguousSlotAcceptance(message: string, optionCount: number): boolean {
  if (optionCount < 2) return false;
  const text = normalizeSchedulingText(message);
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
