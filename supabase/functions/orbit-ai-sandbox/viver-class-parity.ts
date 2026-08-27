export type SandboxConversationMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

export const VIVER_CLASS_TEMPLATE_NAME = "Aula Grupo - Envio Link";
const CLASS_CONTEXT_RE = /\b(?:aula|encontro)\b/iu;
const ACCESS_OFFER_RE =
  /(?:quer|gostaria|posso).{0,50}(?:link|acesso|participar)|(?:link|acesso).{0,40}(?:aula|participar)|(?:consegue|pode|vai).{0,40}participar/iu;
const AFFIRMATIVE_RE =
  /^(?:(?:sim|s|quero|gostaria|pode|pode\s+sim|manda|envia|claro|com\s+certeza|tenho\s+(?:sim|interesse)|eu\s+quero|quero\s+sim)[.!?,\s]*|sim\b.{0,50}\b(?:quero|pode|liber\w*|mand\w*|envi\w*)\b.*|(?:eu\s+)?quero\b.{0,50}\b(?:particip\w*|acesso|aula)\b.*|pode\b.{0,50}\b(?:liber\w*|mand\w*|envi\w*)\b.*)$/iu;
const URL_RE = /https?:\/\/[^\s<>()]+/giu;
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu;
const EMAIL_DECLINE_RE =
  /\b(?:n[aã]o\s+(?:tenho|quero|vou|posso)|sem\s+e-?mail|manda\s+(?:por\s+)?aqui|s[oó]\s+(?:por\s+)?aqui)\b/iu;
const CLASS_EMAIL_REQUEST_RE = /qual e-mail.{0,120}(?:Google Agenda|convite da aula)/iu;

function cleanUrl(url: string): string {
  return url.replace(/[),.;!?]+$/u, "");
}

export function extractCanonicalClassUrl(templateBody: string | null | undefined): string | null {
  const urls = (templateBody || "").match(URL_RE)?.map(cleanUrl) || [];
  const meetUrls = urls.filter((url) => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" && parsed.hostname === "meet.google.com" && parsed.pathname.length > 1;
    } catch {
      return false;
    }
  });
  return meetUrls.length === 1 ? meetUrls[0] : null;
}

export function extractClassInviteEmail(text: string): string | null {
  return (text || "").match(EMAIL_RE)?.[0]?.trim().toLowerCase() || null;
}

export function declinedClassInviteEmail(text: string): boolean {
  return EMAIL_DECLINE_RE.test((text || "").trim());
}

export function buildClassInviteEmailRequest(name: string | null | undefined): string {
  const safeName = (name || "").trim();
  return `${safeName ? `${safeName}, perfeito! ` : "Perfeito! "}Qual e-mail você quer usar para eu enviar o convite da aula e os lembretes pelo Google Agenda? Se preferir não informar, tudo bem — eu envio o acesso por aqui.`;
}

export function previousAssistantOfferedClassAccess(
  messages: ReturnType<typeof sandboxConversationMessages>,
  latestInboundText: string,
): boolean {
  if (!AFFIRMATIVE_RE.test((latestInboundText || "").trim())) return false;
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.direcao === "IN") continue;
    const text = message.mensagem || "";
    return CLASS_CONTEXT_RE.test(text) && ACCESS_OFFER_RE.test(text);
  }
  return false;
}

export function buildCanonicalClassDelivery(
  templateBody: string,
  name: string | null | undefined,
): string {
  const safeName = (name || "").trim() || "tudo bem";
  return templateBody.replaceAll("{{nome}}", safeName).trim();
}

export function sandboxConversationMessages(messages: SandboxConversationMessage[]) {
  return messages.map((message, index) => ({
    direcao: message.role === "user" ? "IN" : "OUT",
    mensagem: message.content,
    timestamp: new Date(index * 1000).toISOString(),
  }));
}

export function sandboxClassEmailStepPending(messages: SandboxConversationMessage[]): boolean {
  const previousAssistant = [...messages].reverse().find((message) => message.role === "assistant");
  return Boolean(previousAssistant && CLASS_EMAIL_REQUEST_RE.test(previousAssistant.content || ""));
}
