import { describe, it, expect } from "vitest";
import { normalizeSearchTerm, isSearchable } from "@/hooks/useOrbitSearch";
import { guessAudioMime } from "@/pages/orbit/ConversasPage";

describe("busca global — normalização do termo", () => {
  it("faz trim e minúsculas", () => {
    expect(normalizeSearchTerm("  Ana Maria  ")).toBe("ana maria");
  });

  it("exige ao menos 2 caracteres", () => {
    expect(isSearchable("a")).toBe(false);
    expect(isSearchable(" ")).toBe(false);
    expect(isSearchable("an")).toBe(true);
  });

  it("aceita telefone formatado ou não", () => {
    expect(isSearchable("(31) 98735-5864")).toBe(true);
    expect(isSearchable("31987355864")).toBe(true);
  });
});

describe("player de áudio — MIME", () => {
  it("infere OGG/Opus para inbound do WhatsApp", () => {
    expect(guessAudioMime("orbit/audio/abc.ogg")).toBe("audio/ogg; codecs=opus");
    expect(guessAudioMime("https://x.com/a.opus?token=1")).toBe("audio/ogg; codecs=opus");
  });

  it("respeita outros formatos conhecidos", () => {
    expect(guessAudioMime("a.mp3")).toBe("audio/mpeg");
    expect(guessAudioMime("a.m4a")).toBe("audio/mp4");
    expect(guessAudioMime("a.webm")).toBe("audio/webm");
    expect(guessAudioMime("a.wav")).toBe("audio/wav");
  });

  it("faz fallback seguro para OGG/Opus quando desconhecido", () => {
    expect(guessAudioMime(null)).toBe("audio/ogg; codecs=opus");
    expect(guessAudioMime("arquivo-sem-extensao")).toBe("audio/ogg; codecs=opus");
  });
});
