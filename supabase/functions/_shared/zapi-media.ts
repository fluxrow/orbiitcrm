// Handler ISOLADO de mídia Z-API (imagem, vídeo, áudio, documento).
//
// POR QUE ISOLADO
//  • Antes, qualquer falha em resolver a URL da mídia caía silenciosamente no
//    endpoint de texto e a legenda era enviada como mensagem — perdendo o anexo.
//    Agora mídia sem URL resolvida é ERRO explícito (`media_url_unresolved`).
//  • O endpoint de documento da Z-API exige a extensão no path
//    (`/send-document/{ext}`); sem isso o envio falha.
//  • A URL assinada é gerada NO MOMENTO do envio com TTL longo, para o
//    provedor conseguir baixar o arquivo mesmo com retry (nunca URL expirada).

export type ZapiPayloadKind = "text" | "image" | "audio" | "video" | "document";

/** TTL da signed URL entregue ao provedor: 7 dias (tolera retries). */
export const MEDIA_SIGNED_URL_TTL_SECONDS = 7 * 24 * 60 * 60;

export const MEDIA_KINDS: ZapiPayloadKind[] = ["image", "audio", "video", "document"];

export function isMediaKind(kind: unknown): boolean {
  return MEDIA_KINDS.includes(String(kind ?? "") as ZapiPayloadKind);
}

/** Extensão (sem ponto) a partir de path/URL, ignorando querystring. */
export function extensionFromPath(source: string | null | undefined): string {
  const clean = String(source ?? "").split("?")[0].split("#")[0];
  const base = clean.split("/").pop() || "";
  const idx = base.lastIndexOf(".");
  if (idx <= 0 || idx === base.length - 1) return "";
  return base.slice(idx + 1).toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Nome de arquivo legível para documentos. */
export function documentFileName(
  payload: { file_name?: string | null; nome_arquivo?: string | null } | null | undefined,
  mediaSource: string | null | undefined,
): string {
  const explicit = (payload?.file_name || payload?.nome_arquivo || "").toString().trim();
  if (explicit) return explicit;
  const clean = String(mediaSource ?? "").split("?")[0];
  const base = decodeURIComponent(clean.split("/").pop() || "");
  return base || "documento";
}

/** Áudios que o WhatsApp aceita como mensagem de voz/áudio nativa. */
const NATIVE_AUDIO_EXT = new Set(["ogg", "oga", "opus", "mp3", "mpeg", "m4a", "aac", "wav", "amr"]);

export function isNativeAudioExtension(ext: string): boolean {
  return NATIVE_AUDIO_EXT.has(ext.toLowerCase());
}

export interface BuildMediaRequestInput {
  base: string;
  phone: string;
  kind: ZapiPayloadKind;
  /** Legenda; acompanha a mídia nativa (nunca vira mensagem separada). */
  caption?: string | null;
  /** URL HTTPS já assinada/acessível pelo provedor. */
  mediaUrl?: string | null;
  /** Path/URL original — usado para extensão e nome do arquivo. */
  mediaSource?: string | null;
  payload?: Record<string, unknown> | null;
}

export interface ZapiRequestSpec {
  url: string;
  body: Record<string, unknown>;
  kind: ZapiPayloadKind;
}

/**
 * Monta a requisição Z-API. Retorna null quando é mídia sem URL resolvida —
 * o chamador DEVE falhar explicitamente (nunca cair para texto).
 */
export function buildZapiRequest(input: BuildMediaRequestInput): ZapiRequestSpec | null {
  const { base, phone, kind } = input;
  const caption = (input.caption ?? "").toString();

  if (!isMediaKind(kind)) {
    return { url: `${base}/send-text`, body: { phone, message: caption }, kind: "text" };
  }

  const mediaUrl = input.mediaUrl || null;
  if (!mediaUrl) return null;

  const source = input.mediaSource || mediaUrl;
  const ext = extensionFromPath(source) || extensionFromPath(mediaUrl);

  if (kind === "image") {
    return { url: `${base}/send-image`, body: { phone, image: mediaUrl, caption }, kind };
  }
  if (kind === "video") {
    return { url: `${base}/send-video`, body: { phone, video: mediaUrl, caption }, kind };
  }
  if (kind === "audio") {
    // Áudio não nativo (ex.: webm gravado no browser) vai como documento para
    // não sumir da conversa.
    if (ext && !isNativeAudioExtension(ext)) {
      return {
        url: `${base}/send-document/${ext}`,
        body: { phone, document: mediaUrl, fileName: documentFileName(input.payload as any, source), caption },
        kind: "document",
      };
    }
    return { url: `${base}/send-audio`, body: { phone, audio: mediaUrl }, kind };
  }

  // document
  const docExt = ext || "pdf";
  return {
    url: `${base}/send-document/${docExt}`,
    body: {
      phone,
      document: mediaUrl,
      fileName: documentFileName(input.payload as any, source),
      caption,
    },
    kind: "document",
  };
}

/** Base da API Z-API para uma config (nunca logar o resultado). */
export function zapiBaseUrl(cfg: { instance_id?: string | null; token?: string | null }): string {
  return `https://api.z-api.io/instances/${cfg.instance_id}/token/${cfg.token}`;
}
