import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { transcribeAudio } from "./audio-transcription.ts";

const AUDIO = new Uint8Array([1, 2, 3, 4]);

Deno.test("audio uses tenant ElevenLabs key before the global key", async () => {
  const usedKeys: string[] = [];
  const result = await transcribeAudio(AUDIO, "audio/ogg", {
    tenantElevenLabsKey: "tenant-key",
    globalElevenLabsKey: "global-key",
  }, {
    fetchImpl: ((_url: string | URL | Request, init?: RequestInit) => {
      usedKeys.push(new Headers(init?.headers).get("xi-api-key") ?? "");
      return Promise.resolve(Response.json({ text: "transcrição válida" }));
    }) as typeof fetch,
  });

  assertEquals(result.provider, "elevenlabs");
  assertEquals(usedKeys, ["tenant-key"]);
});

Deno.test("audio falls back after ElevenLabs authentication failure", async () => {
  const urls: string[] = [];
  const result = await transcribeAudio(AUDIO, "audio/ogg", {
    tenantElevenLabsKey: "invalid-tenant-key",
    lovableKey: "lovable-key",
  }, {
    fetchImpl: ((input: string | URL | Request) => {
      const url = String(input);
      urls.push(url);
      if (url.includes("elevenlabs")) {
        return Promise.resolve(
          new Response("credential rejected", { status: 401 }),
        );
      }
      return Promise.resolve(
        Response.json({
          choices: [{ message: { content: "fallback válido" } }],
        }),
      );
    }) as typeof fetch,
  });

  assertEquals(result, {
    text: "fallback válido",
    provider: "lovable",
    model: "google/gemini-2.5-flash",
  });
  assertEquals(urls.length, 2);
});

Deno.test("audio reports only sanitized provider failures", async () => {
  const secretBody = "authentication detail that must not leak";
  const error = await assertRejects(
    () =>
      transcribeAudio(AUDIO, "audio/ogg", {
        tenantElevenLabsKey: "private-key",
        lovableKey: "private-fallback-key",
      }, {
        fetchImpl: (() =>
          Promise.resolve(
            new Response(secretBody, { status: 401 }),
          )) as typeof fetch,
      }),
    Error,
    "audio_transcription_unavailable:elevenlabs_primary_401,lovable_401",
  );

  assertEquals(error.message.includes(secretBody), false);
  assertEquals(error.message.includes("private-key"), false);
});
