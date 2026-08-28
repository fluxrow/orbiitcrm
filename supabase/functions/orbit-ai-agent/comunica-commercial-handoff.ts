export const COMUNICA_EMPRESA_ID = "3b0894d5-87da-473d-a897-33b2d2f230f5";

export type QualificationField = {
  key: string;
  label: string;
  pergunta: string;
  tipo: string;
  required?: boolean;
  opcoes?: string[];
};

type JsonRecord = Record<string, unknown>;

function nonEmpty(value: unknown): boolean {
  return value !== null && value !== undefined &&
    String(value).trim().length > 0;
}

export function normalizeQualificationFields(
  value: unknown,
): QualificationField[] {
  const normalize = (
    raw: unknown,
    fallbackKey?: string,
  ): QualificationField | null => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const item = raw as JsonRecord;
    const key = String(item.key ?? fallbackKey ?? "").trim();
    if (!key) return null;
    const label = String(item.label ?? key).trim() || key;
    const pergunta = String(item.pergunta ?? label).trim() || label;
    const tipo = String(item.tipo ?? "text").trim() || "text";
    const opcoes = Array.isArray(item.opcoes)
      ? item.opcoes.map((option) => String(option).trim()).filter(Boolean)
      : undefined;
    return {
      key,
      label,
      pergunta,
      tipo,
      required: item.required === true,
      ...(opcoes?.length ? { opcoes } : {}),
    };
  };

  if (Array.isArray(value)) {
    return value.map((item) => normalize(item)).filter((
      item,
    ): item is QualificationField => item !== null);
  }
  if (value && typeof value === "object") {
    return Object.entries(value as JsonRecord)
      .map(([key, item]) => normalize(item, key))
      .filter((item): item is QualificationField => item !== null);
  }
  return [];
}

export function requiredQualificationMissing(
  fields: QualificationField[],
  ...answerSources: Array<unknown>
): QualificationField[] {
  const sources = answerSources.filter(
    (source): source is JsonRecord =>
      Boolean(source) && typeof source === "object" && !Array.isArray(source),
  );
  return fields.filter((field) => {
    if (field.required !== true) return false;
    return !sources.some((source) => nonEmpty(source[field.key]));
  });
}

export function comunicaQuoteReady(input: {
  empresaId: string | null | undefined;
  collectingQuote: boolean;
  baseRegistrationComplete: boolean;
  fields: QualificationField[];
  existingAnswers?: unknown;
  collectedAnswers?: unknown;
  extractedAnswers?: unknown;
}): { ready: boolean; missing: QualificationField[] } {
  if (
    input.empresaId !== COMUNICA_EMPRESA_ID || !input.collectingQuote ||
    !input.baseRegistrationComplete
  ) {
    return { ready: false, missing: [] };
  }
  const missing = requiredQualificationMissing(
    input.fields,
    input.existingAnswers,
    input.collectedAnswers,
    input.extractedAnswers,
  );
  return { ready: missing.length === 0, missing };
}

const HANDOFF_PROMISE =
  /\b(?:vou\s+encaminhar|irei\s+encaminhar|encaminhei|j[aá]\s+encaminhei|vou\s+passar|passei)\b/iu;

export function enforceComunicaNotificationTruth(input: {
  empresaId: string | null | undefined;
  response: string;
  quoteReady: boolean;
  notificationAttempted: boolean;
  notificationSent: boolean;
  alreadyNotified: boolean;
  nextMissingLabel?: string | null;
}): { text: string; changed: boolean; reason?: string } {
  if (input.empresaId !== COMUNICA_EMPRESA_ID) {
    return { text: input.response, changed: false };
  }

  if (input.quoteReady && input.notificationSent) {
    return {
      text:
        "Perfeito, já encaminhei as informações do seu pedido para nossa equipe comercial preparar o orçamento. O atendimento seguirá por aqui.",
      changed: input.response.trim() !==
        "Perfeito, já encaminhei as informações do seu pedido para nossa equipe comercial preparar o orçamento. O atendimento seguirá por aqui.",
      reason: "notification_confirmed",
    };
  }

  if (input.quoteReady && input.alreadyNotified) {
    return HANDOFF_PROMISE.test(input.response)
      ? {
        text:
          "As informações do seu pedido já estão com nossa equipe comercial. O atendimento seguirá por aqui.",
        changed: true,
        reason: "already_notified",
      }
      : { text: input.response, changed: false };
  }

  if (
    input.quoteReady && input.notificationAttempted && !input.notificationSent
  ) {
    return {
      text: "Perfeito, já registrei todas as informações do seu pedido.",
      changed: input.response.trim() !==
        "Perfeito, já registrei todas as informações do seu pedido.",
      reason: "notification_failed",
    };
  }

  if (!input.quoteReady && HANDOFF_PROMISE.test(input.response)) {
    const label = String(input.nextMissingLabel ?? "os dados que faltam").trim()
      .toLocaleLowerCase("pt-BR");
    return {
      text: `Para eu concluir o pedido, preciso confirmar ${label}.`,
      changed: true,
      reason: "qualification_incomplete",
    };
  }

  return { text: input.response, changed: false };
}
