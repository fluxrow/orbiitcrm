export interface AudioTranscription {
  text: string;
  provider: "elevenlabs" | "lovable";
  model: string;
}

export interface AudioTranscriptionSecrets {
  tenantElevenLabsKey?: string | null;
  globalElevenLabsKey?: string | null;
  lovableKey?: string | null;
}

export interface AudioTranscriptionDependencies {
  fetchImpl?: typeof fetch;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function safeExtension(mime: string): string {
  const normalized = mime.toLowerCase();
  if (normalized.includes("mpeg")) return "mp3";
  if (normalized.includes("mp4")) return "m4a";
  if (normalized.includes("wav")) return "wav";
  if (normalized.includes("webm")) return "webm";
  if (normalized.includes("opus")) return "opus";
  return "ogg";
}

function audioFormat(mime: string): string {
  const extension = safeExtension(mime);
  return extension === "opus" ? "ogg" : extension;
}

function normalizedKeys(secrets: AudioTranscriptionSecrets): string[] {
  const keys = [secrets.tenantElevenLabsKey, secrets.globalElevenLabsKey]
    .map((key) => String(key ?? "").trim())
    .filter(Boolean);
  return [...new Set(keys)];
}

function failureCode(provider: string, response?: Response): string {
  return response ? `${provider}_${response.status}` : `${provider}_network`;
}

/**
 * Transcreve com failover determinístico e erros sanitizados.
 * A credencial tenant-scoped tem precedência; falhas de autenticação, rede,
 * limite ou conteúdo vazio avançam para o próximo provedor disponível.
 */
export async function transcribeAudio(
  bytes: Uint8Array,
  mime: string,
  secrets: AudioTranscriptionSecrets,
  dependencies: AudioTranscriptionDependencies = {},
): Promise<AudioTranscription> {
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const failures: string[] = [];

  for (const [index, elevenLabsKey] of normalizedKeys(secrets).entries()) {
    const providerCode = index === 0
      ? "elevenlabs_primary"
      : "elevenlabs_fallback";
    try {
      const form = new FormData();
      form.append(
        "file",
        new Blob([bytes as unknown as BlobPart], { type: mime }),
        `audio.${safeExtension(mime)}`,
      );
      form.append("model_id", "scribe_v2");
      form.append("language_code", "por");
      const response = await fetchImpl(
        "https://api.elevenlabs.io/v1/speech-to-text",
        {
          method: "POST",
          headers: { "xi-api-key": elevenLabsKey },
          body: form,
        },
      );
      if (!response.ok) {
        failures.push(failureCode(providerCode, response));
        continue;
      }
      const data = await response.json().catch(() => ({}));
      const text = String(data?.text ?? "").trim();
      if (!text) {
        failures.push(`${providerCode}_empty`);
        continue;
      }
      return { text, provider: "elevenlabs", model: "scribe_v2" };
    } catch {
      failures.push(failureCode(providerCode));
    }
  }

  const lovableKey = String(secrets.lovableKey ?? "").trim();
  if (lovableKey) {
    try {
      const model = "google/gemini-2.5-flash";
      const response = await fetchImpl(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            temperature: 0,
            messages: [{
              role: "user",
              content: [
                {
                  type: "text",
                  text:
                    "Transcreva fielmente este audio em portugues do Brasil. Retorne somente a transcricao, sem comentarios, titulos ou markdown.",
                },
                {
                  type: "input_audio",
                  input_audio: {
                    data: bytesToBase64(bytes),
                    format: audioFormat(mime),
                  },
                },
              ],
            }],
          }),
        },
      );
      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        const text = String(data?.choices?.[0]?.message?.content ?? "").trim();
        if (text) return { text, provider: "lovable", model };
        failures.push("lovable_empty");
      } else {
        failures.push(failureCode("lovable", response));
      }
    } catch {
      failures.push(failureCode("lovable"));
    }
  }

  if (failures.length === 0) failures.push("provider_key_missing");
  throw new Error(`audio_transcription_unavailable:${failures.join(",")}`);
}
