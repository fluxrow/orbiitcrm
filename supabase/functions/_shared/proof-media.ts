// Prova social — helpers puros compartilhados entre o agente e os testes.
// Regras de segurança:
//  - só dispara em pedido EXPLÍCITO de prova/depoimento/resultado;
//  - o payload de vídeo NUNCA carrega fileName/filename/nome local;
//  - a mensagem visível ao lead é apenas a legenda aprovada (sem storage_path).

export const PROOF_REQUEST_RE =
  /\b(prova|provas|comprova\w*|depoiment\w*|testemunh\w*|result\w*|case|cases|print|prints|alu[no]{2,}s?\s+(que|com)|funciona\s+mesmo)\b/i;

export function isProofRequest(texto: string | null | undefined): boolean {
  const t = (texto || "").toLowerCase();
  if (!t.trim()) return false;
  return PROOF_REQUEST_RE.test(t);
}

export function matchesTriggerKeywords(
  texto: string | null | undefined,
  keywords: unknown,
): boolean {
  const list = Array.isArray(keywords) ? keywords : [];
  if (list.length === 0) return true;
  const lower = (texto || "").toLowerCase();
  return list.some((k) => lower.includes(String(k).toLowerCase()));
}

export type ProofMedia = {
  id: string;
  kind: string;
  caption?: string | null;
  storage_path: string;
};

export function proofPayloadType(kind: string): "video" | "image" {
  return kind === "video" ? "video" : "image";
}

/** Payload enfileirado no outbox. Sem fileName e sem nome local do arquivo. */
export function buildProofOutboxPayload(media: ProofMedia) {
  return {
    mensagem: media.caption ?? "",
    storage_path: media.storage_path,
    media_library_id: media.id,
  };
}

/** Corpo nativo Z-API para vídeo — usado só quando envio real estiver liberado. */
export function buildZapiVideoBody(phone: string, signedUrl: string, caption: string) {
  return { phone, video: signedUrl, caption };
}
