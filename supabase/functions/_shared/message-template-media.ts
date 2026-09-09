export type MessageTemplateMedia = {
  imagem_url?: string | null;
  audio_url?: string | null;
};

export type TemplatePayloadType = "text" | "image" | "audio";

export function templatePayloadType(template: MessageTemplateMedia): TemplatePayloadType {
  if (template.audio_url) return "audio";
  if (template.imagem_url) return "image";
  return "text";
}

export function buildTemplateOutboxPayload(
  template: MessageTemplateMedia,
  mensagem: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const payloadType = templatePayloadType(template);
  const mediaUrl = payloadType === "audio" ? template.audio_url : template.imagem_url;
  return {
    mensagem,
    url_midia: mediaUrl ?? null,
    ...extra,
  };
}

export function templateMediaAuthority(template: MessageTemplateMedia): string | null {
  return template.audio_url ?? template.imagem_url ?? null;
}
