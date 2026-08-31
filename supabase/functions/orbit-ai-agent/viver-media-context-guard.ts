import { VIVER_EMPRESA_ID } from "./viver-meeting-guard.ts";

export const VIVER_EXTRA_AGGREGATION_DELAY_MS = 5_000;
export const VIVER_MEDIA_CONTEXT_WAIT_MAX_MS = 15_000;
export const VIVER_MEDIA_CONTEXT_POLL_MS = 1_000;

export type PendingInboundMedia = {
  tipo_midia?: string | null;
  media_extracted_text?: string | null;
  media_processing_status?: string | null;
  media_processing_error?: string | null;
};

export function viverAdditionalAggregationDelayMs(empresaId: string | null | undefined): number {
  return empresaId === VIVER_EMPRESA_ID ? VIVER_EXTRA_AGGREGATION_DELAY_MS : 0;
}

export function hasUnresolvedInboundMedia(messages: PendingInboundMedia[] | null | undefined): boolean {
  return (messages || []).some((message) => {
    const mediaType = String(message.tipo_midia || "").toLowerCase();
    if (mediaType !== "audio" && mediaType !== "image" && mediaType !== "imagem") return false;
    if (String(message.media_extracted_text || "").trim()) return false;
    if (String(message.media_processing_error || "").trim()) return false;

    const status = String(message.media_processing_status || "").toLowerCase();
    return !["processed", "completed", "failed", "error"].includes(status);
  });
}
