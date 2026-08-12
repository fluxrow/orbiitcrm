/**
 * Regras de horário de atendimento do agente.
 *
 * Contrato (opt-in por tenant):
 *  - responder_fora_horario = true  => atendimento 24h: NENHUM fallback de horário,
 *    nenhuma checagem de janela, segue a geração normal.
 *  - responder_fora_horario != true => mantém o comportamento legado (fallback fora
 *    da janela horario_inicio..horario_fim, no fuso America/Sao_Paulo).
 *
 * Não interfere com cutoff, human_talk, quarentena, cancel_on_reply, guard comercial,
 * cota/cadência ou kill switch — esses gates continuam sendo avaliados fora daqui.
 */
export interface BusinessHoursConfig {
  responder_fora_horario?: boolean | null;
  horario_inicio?: string | null;
  horario_fim?: string | null;
  mensagem_fora_horario?: string | null;
}

export function isAlwaysOn(config: BusinessHoursConfig | null | undefined): boolean {
  return config?.responder_fora_horario === true;
}

export function currentSaoPauloTime(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hh = parts.find((p) => p.type === "hour")!.value;
  const mm = parts.find((p) => p.type === "minute")!.value;
  return `${hh}:${mm}`;
}

export function isWithinBusinessHours(
  config: BusinessHoursConfig | null | undefined,
  currentTime: string,
): boolean {
  const start = (config?.horario_inicio || "08:00").substring(0, 5);
  const end = (config?.horario_fim || "18:00").substring(0, 5);
  return currentTime >= start && currentTime <= end;
}

export interface OutsideHoursDecision {
  /** true => interromper o processamento e (opcionalmente) enviar o fallback. */
  halt: boolean;
  /** Texto do fallback, se houver. */
  fallbackMessage: string | null;
  reason: "always_on" | "within_hours" | "outside_hours";
}

export function evaluateBusinessHours(
  config: BusinessHoursConfig | null | undefined,
  currentTime: string,
): OutsideHoursDecision {
  if (isAlwaysOn(config)) {
    return { halt: false, fallbackMessage: null, reason: "always_on" };
  }
  if (isWithinBusinessHours(config, currentTime)) {
    return { halt: false, fallbackMessage: null, reason: "within_hours" };
  }
  return {
    halt: true,
    fallbackMessage: config?.mensagem_fora_horario?.trim() ? config.mensagem_fora_horario : null,
    reason: "outside_hours",
  };
}
