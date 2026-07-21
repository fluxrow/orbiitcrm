import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAnthropic } from "../_shared/anthropic.ts";

const MAX_MEDIA_BYTES = 15 * 1024 * 1024;
const DOWNLOAD_TIMEOUT_MS = 20_000;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function safeExtension(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
    "audio/ogg": "ogg", "audio/opus": "opus", "audio/mpeg": "mp3", "audio/mp4": "m4a",
    "audio/wav": "wav", "audio/x-wav": "wav", "audio/webm": "webm",
  };
  return map[mime.toLowerCase()] || "bin";
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function assertPublicHttpsUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error("media_url_protocol_not_allowed");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || host === "169.254.169.254" || host === "metadata.google.internal") {
    throw new Error("media_url_host_not_allowed");
  }
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)?.slice(1).map(Number);
  if (ipv4 && (ipv4.some((part) => part > 255) || ipv4[0] === 10 || ipv4[0] === 127 || ipv4[0] === 0 || (ipv4[0] === 169 && ipv4[1] === 254) || (ipv4[0] === 172 && ipv4[1] >= 16 && ipv4[1] <= 31) || (ipv4[0] === 192 && ipv4[1] === 168) || (ipv4[0] === 100 && ipv4[1] >= 64 && ipv4[1] <= 127))) {
    throw new Error("media_url_host_not_allowed");
  }
  if (host === "::1" || host.startsWith("fe80:") || host.startsWith("fc") || host.startsWith("fd")) {
    throw new Error("media_url_host_not_allowed");
  }
  return url;
}

async function downloadMedia(url: string): Promise<{ bytes: Uint8Array; mime: string }> {
  const parsed = assertPublicHttpsUrl(url);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);
  try {
    const response = await fetch(parsed, { signal: controller.signal, redirect: "follow" });
    assertPublicHttpsUrl(response.url);
    if (!response.ok) throw new Error(`media_download_${response.status}`);
    const length = Number(response.headers.get("content-length") || 0);
    if (length > MAX_MEDIA_BYTES) throw new Error("media_too_large");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_MEDIA_BYTES) throw new Error("media_size_invalid");
    return { bytes, mime: (response.headers.get("content-type") || "application/octet-stream").split(";")[0] };
  } finally {
    clearTimeout(timeout);
  }
}

async function describeImage(bytes: Uint8Array, mime: string, caption: string): Promise<string> {
  if (!/^image\/(jpeg|png|webp|gif)$/i.test(mime)) throw new Error(`image_mime_unsupported:${mime}`);
  const result = await callAnthropic({
    system: "Descreva objetivamente a imagem recebida por um lead em uma conversa comercial. Não invente texto ilegível nem conclusões. Retorne somente a descrição útil em português do Brasil, em até 500 caracteres.",
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mime, data: bytesToBase64(bytes) } },
        { type: "text", text: caption ? `Legenda enviada pelo lead: ${caption}` : "Descreva o conteúdo relevante." },
      ],
    }],
    temperature: 0,
    max_tokens: 300,
  });
  if (!result.ok) throw new Error(`image_provider:${result.code}`);
  return result.text.trim();
}

interface AudioTranscription {
  text: string;
  provider: "elevenlabs" | "lovable";
  model: string;
}

function audioFormat(mime: string): string {
  const normalized = mime.toLowerCase();
  if (normalized.includes("mpeg")) return "mp3";
  if (normalized.includes("mp4")) return "m4a";
  if (normalized.includes("wav")) return "wav";
  if (normalized.includes("webm")) return "webm";
  return "ogg";
}

async function transcribeAudio(bytes: Uint8Array, mime: string, tenantKey?: string | null): Promise<AudioTranscription> {
  const elevenLabsKey = Deno.env.get("ELEVENLABS_API_KEY") || tenantKey || "";
  let response: Response;
  let provider: AudioTranscription["provider"];
  let model: string;
  if (elevenLabsKey) {
    const form = new FormData();
    form.append("file", new Blob([bytes], { type: mime }), `audio.${safeExtension(mime)}`);
    form.append("model_id", "scribe_v2");
    form.append("language_code", "por");
    provider = "elevenlabs";
    model = "scribe_v2";
    response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST", headers: { "xi-api-key": elevenLabsKey }, body: form,
    });
  } else {
    const lovableKey = Deno.env.get("LOVABLE_API_KEY") || "";
    if (!lovableKey) throw new Error("audio_provider_key_missing");
    provider = "lovable";
    model = "google/gemini-2.5-flash";
    response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovableKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: "Transcreva fielmente este audio em portugues do Brasil. Retorne somente a transcricao, sem comentarios, titulos ou markdown." },
            { type: "input_audio", input_audio: { data: bytesToBase64(bytes), format: audioFormat(mime) } },
          ],
        }],
      }),
    });
  }

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 200).replace(/\s+/g, " ");
    throw new Error(`audio_provider_${provider}_${response.status}:${detail}`);
  }
  const data = await response.json();
  const text = String(provider === "elevenlabs" ? data?.text : data?.choices?.[0]?.message?.content || "").trim();
  if (!text) throw new Error("audio_transcript_empty");
  return { text, provider, model };
}

serve(async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const auth = req.headers.get("Authorization") || "";
  if (!serviceKey || auth !== `Bearer ${serviceKey}`) return json({ ok: false, error: "unauthorized" }, 401);

  const { message_id, dry_run = false } = await req.json().catch(() => ({}));
  if (!message_id) return json({ ok: false, error: "message_id_required" }, 400);
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: claimed } = await supabase
    .from("orbit_mensagens")
    .update({ media_processing_status: "processing", media_processing_error: null })
    .eq("id", message_id)
    .eq("direcao", "IN")
    .eq("media_processing_status", "pending")
    .select("*")
    .maybeSingle();
  if (!claimed) return json({ ok: true, skipped: "not_pending" });

  try {
    const { data: conversation } = await supabase.from("orbit_conversas").select("id, prospect_id, human_talk, ai_processing").eq("id", claimed.conversa_id).single();
    if (!conversation?.id || !conversation?.prospect_id) throw new Error("conversation_not_found");
    const { data: prospect } = await supabase.from("orbit_prospects").select("id, telefone").eq("id", conversation.prospect_id).single();
    if (!prospect?.id) throw new Error("prospect_not_found");
    const { data: config } = await supabase.from("orbit_ai_config").select("modo_automatico, inbound_image_understanding_enabled, inbound_audio_transcription_enabled, tts_api_key").eq("empresa_id", claimed.empresa_id).maybeSingle();
    const type = String(claimed.tipo_midia || "").toLowerCase();
    const enabled = type === "image" ? config?.inbound_image_understanding_enabled : type === "audio" ? config?.inbound_audio_transcription_enabled : false;
    if (!enabled) {
      await supabase.from("orbit_mensagens").update({ media_processing_status: "disabled", media_processed_at: new Date().toISOString() }).eq("id", message_id);
      return json({ ok: true, skipped: "feature_disabled" });
    }

    const media = await downloadMedia(String(claimed.url_midia || ""));
    const path = `${claimed.empresa_id}/inbound/${claimed.conversa_id}/${claimed.id}.${safeExtension(media.mime)}`;
    const { error: uploadError } = await supabase.storage.from("orbit-media").upload(path, media.bytes, { contentType: media.mime, upsert: true });
    if (uploadError) throw new Error(`media_storage:${uploadError.message}`);

    const audio = type === "audio"
      ? await transcribeAudio(media.bytes, media.mime, config?.tts_api_key)
      : null;
    const extracted = type === "image"
      ? await describeImage(media.bytes, media.mime, String(claimed.mensagem || ""))
      : audio!.text;
    const prefix = type === "image" ? "Imagem recebida" : "Transcrição do áudio recebido";
    const original = String(claimed.mensagem || "").replace(/^📎\s*(image|audio)$/i, "").trim();
    const agentText = `${original ? `${original}\n` : ""}[${prefix}: ${extracted}]`;
    await supabase.from("orbit_mensagens").update({
      storage_path: path,
      media_processing_status: "processed",
      media_extracted_text: extracted,
      media_processing_error: null,
      media_processed_at: new Date().toISOString(),
      media_provider: type === "image" ? "anthropic" : audio!.provider,
      media_model: type === "image" ? "tenant-default" : audio!.model,
    }).eq("id", message_id);

    let agentInvoked = false;
    if (!dry_run && config?.modo_automatico && !conversation.human_talk) {
      const { data: lock } = await supabase.from("orbit_conversas").update({ ai_processing: true }).eq("id", conversation.id).eq("ai_processing", false).select("id");
      if (lock?.length) {
        agentInvoked = true;
        const invokeAgent = fetch(`${supabaseUrl}/functions/v1/orbit-ai-agent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}`, "x-orbit-internal-secret": Deno.env.get("ORBIT_AI_AGENT_SECRET") || "" },
          body: JSON.stringify({ conversa_id: conversation.id, prospect_id: prospect.id, mensagem: agentText, telefone: prospect.telefone }),
        }).catch((error) => console.error("[media-processor] agent invoke failed", error));
        // Keep the worker alive until the downstream agent accepts the request.
        // @ts-ignore EdgeRuntime is provided by Supabase Edge Runtime.
        if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(invokeAgent);
      }
    }
    return json({ ok: true, processed: true, type, dry_run: !!dry_run, agent_invoked: agentInvoked });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown";
    await supabase.from("orbit_mensagens").update({
      media_processing_status: "failed", media_processing_error: reason.slice(0, 500), media_processed_at: new Date().toISOString(),
    }).eq("id", message_id);
    console.error("[media-processor] failed", { message_id, reason });
    return json({ ok: false, error: reason }, 422);
  }
});
