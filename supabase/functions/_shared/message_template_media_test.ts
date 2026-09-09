import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildTemplateOutboxPayload,
  templateMediaAuthority,
  templatePayloadType,
} from "./message-template-media.ts";

Deno.test("audio template is routed as native audio and wins over image", () => {
  const template = { audio_url: "https://example.test/opening.mp3", imagem_url: "https://example.test/image.jpg" };
  assertEquals(templatePayloadType(template), "audio");
  assertEquals(buildTemplateOutboxPayload(template, "Posso continuar?"), {
    mensagem: "Posso continuar?",
    url_midia: "https://example.test/opening.mp3",
  });
  assertEquals(templateMediaAuthority(template), "https://example.test/opening.mp3");
});

Deno.test("image and text templates keep their previous routing", () => {
  assertEquals(templatePayloadType({ imagem_url: "https://example.test/image.jpg" }), "image");
  assertEquals(templatePayloadType({}), "text");
  assertEquals(buildTemplateOutboxPayload({}, "Olá"), { mensagem: "Olá", url_midia: null });
});
