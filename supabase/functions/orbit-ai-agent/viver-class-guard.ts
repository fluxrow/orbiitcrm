export const VIVER_CLASS_TEMPLATE_NAME = "Aula Grupo - Envio Link";
export const VIVER_CLASS_TIME_ZONE = "America/Sao_Paulo";

export type ConversationMessage = {
  direcao?: string | null;
  mensagem?: string | null;
  timestamp?: string | null;
};

const CLASS_CONTEXT_RE = /\b(?:aula|encontro)\b/iu;
const ACCESS_OFFER_RE =
  /(?:quer|gostaria|posso).{0,50}(?:link|acesso|participar)|(?:link|acesso).{0,40}(?:aula|participar)/iu;
const AFFIRMATIVE_RE =
  /^(?:sim|s|quero|gostaria|pode|pode\s+sim|manda|envia|claro|com\s+certeza|tenho\s+(?:sim|interesse)|eu\s+quero|quero\s+sim)[.!?,\s]*$/iu;
const URL_RE = /https?:\/\/[^\s<>()]+/giu;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu;
const EMAIL_DECLINE_RE =
  /\b(?:n[aã]o\s+(?:tenho|quero|vou|posso)|sem\s+e-?mail|manda\s+(?:por\s+)?aqui|s[oó]\s+(?:por\s+)?aqui)\b/iu;

function cleanUrl(url: string): string {
  return url.replace(/[),.;!?]+$/u, "");
}

export function extractCanonicalClassUrl(
  templateBody: string | null | undefined,
): string | null {
  const urls = (templateBody || "").match(URL_RE)?.map(cleanUrl) || [];
  const meetUrls = urls.filter((url) => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" &&
        parsed.hostname === "meet.google.com" && parsed.pathname.length > 1;
    } catch {
      return false;
    }
  });
  return meetUrls.length === 1 ? meetUrls[0] : null;
}

export function isExplicitClassAcceptance(text: string): boolean {
  return AFFIRMATIVE_RE.test((text || "").trim());
}

export function extractClassInviteEmail(text: string): string | null {
  const match = (text || "").match(EMAIL_RE)?.[0]?.trim().toLowerCase();
  return match || null;
}

export function declinedClassInviteEmail(text: string): boolean {
  return EMAIL_DECLINE_RE.test((text || "").trim());
}

export function buildClassInviteEmailRequest(
  name: string | null | undefined,
): string {
  const safeName = (name || "").trim();
  return `${
    safeName ? `${safeName}, perfeito! ` : "Perfeito! "
  }Qual e-mail você quer usar para eu enviar o convite da aula e os lembretes pelo Google Agenda? Se preferir não informar, tudo bem — eu envio o acesso por aqui.`;
}

export function previousAssistantOfferedClassAccess(
  messages: ConversationMessage[],
  latestInboundText: string,
): boolean {
  if (!isExplicitClassAcceptance(latestInboundText)) return false;
  const chronological = [...messages].sort((a, b) =>
    Date.parse(a.timestamp || "") - Date.parse(b.timestamp || "")
  );
  for (let i = chronological.length - 1; i >= 0; i--) {
    const message = chronological[i];
    if (message.direcao === "IN") continue;
    const text = message.mensagem || "";
    return CLASS_CONTEXT_RE.test(text) && ACCESS_OFFER_RE.test(text);
  }
  return false;
}

export function renderCanonicalClassTemplate(
  templateBody: string,
  name: string | null | undefined,
): string {
  const safeName = (name || "").trim() || "tudo bem";
  return templateBody.replaceAll("{{nome}}", safeName).trim();
}

export function viverClassPhase(
  now = new Date(),
  durationMinutes = 90,
): "upcoming" | "in_progress" | "next_week" {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: VIVER_CLASS_TIME_ZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || "";
  if (value("weekday") !== "Tue") return "upcoming";
  const minutes = Number(value("hour")) * 60 + Number(value("minute"));
  const startsAt = 19 * 60 + 30;
  if (minutes < startsAt) return "upcoming";
  if (minutes < startsAt + durationMinutes) return "in_progress";
  return "next_week";
}

export function buildCanonicalClassDelivery(
  templateBody: string,
  name: string | null | undefined,
  now = new Date(),
): string {
  const phase = viverClassPhase(now);
  if (phase !== "in_progress") {
    return renderCanonicalClassTemplate(templateBody, name);
  }
  const canonicalUrl = extractCanonicalClassUrl(templateBody);
  if (!canonicalUrl) throw new Error("class_link_authority_missing");
  const safeName = (name || "").trim();
  return `${
    safeName ? `${safeName}, a` : "A"
  } aula já está acontecendo. Entre agora por este link: ${canonicalUrl}`;
}

export function enforceCanonicalClassLink(
  response: string,
  templateBody: string | null | undefined,
  name?: string | null,
  now = new Date(),
): { text: string; changed: boolean; reason?: string } {
  if (!CLASS_CONTEXT_RE.test(response || "")) {
    return { text: response, changed: false };
  }
  const links = (response.match(URL_RE) || []).map(cleanUrl);
  if (links.length === 0) return { text: response, changed: false };
  const canonicalUrl = extractCanonicalClassUrl(templateBody);
  if (!canonicalUrl) {
    return {
      text:
        "Não consegui confirmar o acesso da aula agora. Você quer que eu verifique isso antes de te enviar?",
      changed: true,
      reason: "class_link_authority_missing",
    };
  }
  if (links.every((link) => link === canonicalUrl)) {
    return { text: response, changed: false };
  }
  return {
    text: buildCanonicalClassDelivery(templateBody!, name, now),
    changed: true,
    reason: "non_authoritative_class_link",
  };
}
