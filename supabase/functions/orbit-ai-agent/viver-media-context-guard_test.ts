import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { VIVER_EMPRESA_ID } from "./viver-meeting-guard.ts";
import {
  hasUnresolvedInboundMedia,
  VIVER_EXTRA_AGGREGATION_DELAY_MS,
  viverAdditionalAggregationDelayMs,
} from "./viver-media-context-guard.ts";

Deno.test("espera adicional de agregacao fica isolada ao tenant Viver", () => {
  assertEquals(viverAdditionalAggregationDelayMs(VIVER_EMPRESA_ID), VIVER_EXTRA_AGGREGATION_DELAY_MS);
  assertEquals(viverAdditionalAggregationDelayMs("4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18"), 0);
  assertEquals(viverAdditionalAggregationDelayMs(null), 0);
});

Deno.test("audio pendente bloqueia snapshot de contexto", () => {
  assertEquals(hasUnresolvedInboundMedia([{
    tipo_midia: "audio",
    media_processing_status: "processing",
    media_extracted_text: null,
  }]), true);
});

Deno.test("audio processado libera snapshot com transcricao", () => {
  assertEquals(hasUnresolvedInboundMedia([{
    tipo_midia: "audio",
    media_processing_status: "processed",
    media_extracted_text: "Tenho vinte e nove revendedoras.",
  }]), false);
});

Deno.test("erro terminal de midia nao cria espera infinita", () => {
  assertEquals(hasUnresolvedInboundMedia([{
    tipo_midia: "audio",
    media_processing_status: "failed",
    media_processing_error: "transcription_failed",
  }]), false);
});

Deno.test("mensagem de texto nunca aciona espera de midia", () => {
  assertEquals(hasUnresolvedInboundMedia([{
    tipo_midia: "text",
    media_processing_status: null,
  }]), false);
});
