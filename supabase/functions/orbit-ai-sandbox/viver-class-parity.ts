export type SandboxConversationMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

const CLASS_EMAIL_REQUEST_RE = /qual e-mail.{0,120}(?:Google Agenda|convite da aula)/iu;

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
