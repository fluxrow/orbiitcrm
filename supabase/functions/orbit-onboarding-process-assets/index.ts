import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ok, fail, optionsResponse, ErrorCodes } from "../_shared/responses.ts";

/**
 * Onboarding Inteligente — processador de materiais (v4, background).
 *
 * READ-ONLY em relação ao produto: NUNCA altera fluxos, templates, agenda,
 * Lead Score, campanhas, knowledge base ou Z-API. Apenas lê os assets do
 * bucket privado `orbit-media` e materializa:
 *   - orbit_onboarding_asset_insights (um por asset, com process_status/attempts/error)
 *   - orbit_onboarding_implementation_drafts (um consolidado por onboarding)
 *
 * Mudanças relevantes desta versão:
 *   - A request responde IMEDIATAMENTE (queued) e o trabalho pesado roda em
 *     background task, em lotes — sem processamento síncrono/sequencial longo.
 *   - Status individual por asset: queued -> running -> done|error, com attempts
 *     e last_attempt_at. Assets já `done` NÃO são reprocessados (salvo force=true).
 *   - Imagem: análise por visão/OCR (multimodal). Áudio: transcrição quando o
 *     provedor aceitar o container. Vídeo: catalogado por metadados.
 *
 * Input: { onboarding_id: string, asset_id?: string, force?: boolean }
 * Auth: JWT de membro do tenant.
 */

const MAX_TEXT_BYTES = 500 * 1024;      // 500 KB de texto por asset
const MAX_INLINE_BYTES = 18 * 1024 * 1024; // limite para enviar mídia inline ao modelo
const MAX_ASSETS = 24;
const BATCH_SIZE = 3;                    // paralelismo controlado
const TEXT_LIKE_MIMES = [
  "application/json",
  "text/",
  "application/xml",
  "application/x-yaml",
  "application/yaml",
];
const MODEL = "google/gemini-2.5-flash";
const AUDIO_FORMATS: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/opus": "ogg",
  "audio/mp4": "m4a",
  "audio/m4a": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/flac": "flac",
};

interface Body { onboarding_id: string; asset_id?: string; force?: boolean }

function isTextLike(mime: string | null | undefined): boolean {
  const m = (mime || "").toLowerCase();
  return TEXT_LIKE_MIMES.some((p) => m === p || m.startsWith(p));
}

function detectKindFromFilename(name: string, mime: string): string {
  const n = (name || "").toLowerCase();
  const m = (mime || "").toLowerCase();
  if (n.endsWith(".json") || m === "application/json") {
    if (n.includes("typebot") || n.includes("bot") || n.includes("flow")) return "typebot_flow";
    return "json_document";
  }
  if (m.startsWith("audio/")) return "audio_recording";
  if (m.startsWith("video/")) return "video_recording";
  if (m.startsWith("image/")) return "image_asset";
  if (n.endsWith(".md") || m === "text/markdown") return "markdown_document";
  if (n.includes("conversa") || n.includes("chat") || n.includes("transcript") || n.includes("treinamento")) {
    return "conversation_transcript";
  }
  if (n.includes("faq")) return "faq";
  if (n.endsWith(".pdf") || m === "application/pdf") return "presentation";
  if (m.startsWith("text/")) return "text_document";
  return "unknown";
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

async function callLovableAI(
  apiKey: string,
  systemPrompt: string,
  userContent: any,
): Promise<{ content: string; parsed?: any; tokens_in?: number; tokens_out?: number; error?: string }> {
  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      return { content: "", error: `AI ${resp.status}: ${t.slice(0, 300)}` };
    }
    const j = await resp.json();
    const content = j?.choices?.[0]?.message?.content ?? "";
    let parsed: any = undefined;
    try { parsed = JSON.parse(content); } catch { /* keep as string */ }
    return { content, parsed, tokens_in: j?.usage?.prompt_tokens, tokens_out: j?.usage?.completion_tokens };
  } catch (e) {
    return { content: "", error: (e as Error).message };
  }
}

const ASSET_SYSTEM_PROMPT = `Você é analista de implantação de CRM. Recebe um material enviado por um cliente durante o onboarding.
Devolva JSON estrito com este formato:
{
  "detected_kind": "typebot_flow|conversation_transcript|faq|presentation|json_document|markdown_document|text_document|image_asset|audio_recording|video_recording|unknown",
  "summary": "resumo curto (máx 400 chars) em português",
  "highlights": ["até 8 bullets curtos com achados relevantes"],
  "questions": ["se for typebot/formulário: liste as perguntas capturadas"],
  "ocr_text": "texto legível extraído da imagem, se houver",
  "transcript": "transcrição do áudio, se houver",
  "cta": "se detectar CTA (agenda, telefone, link), diga qual",
  "tone_hints": "pistas de tom de voz observadas, se houver",
  "risks": ["riscos ou pontos ambíguos"]
}
NUNCA invente fatos que não estão no material. Campos sem evidência devem vir vazios ("" ou []).`;

interface AssetOutcome {
  asset_id: string;
  filename: string;
  detected_kind: string;
  summary?: string;
  error?: string;
  tokens_in?: number;
  tokens_out?: number;
}

async function processAsset(admin: any, lovableKey: string, ob: any, a: any): Promise<AssetOutcome> {
  const detectedKind = detectKindFromFilename(a.filename || "", a.mime || "");
  const mime = (a.mime || "").toLowerCase();
  let assetSummary: string | undefined;
  let extracted: any = { kind: detectedKind };
  let assetError: string | undefined;
  let modelUsed: string | undefined;
  let tokensIn = 0;
  let tokensOut = 0;

  await admin.from("orbit_onboarding_asset_insights").upsert({
    empresa_id: ob.empresa_id,
    onboarding_id: ob.id,
    asset_id: a.id,
    process_status: "running",
    last_attempt_at: new Date().toISOString(),
  }, { onConflict: "asset_id" });

  try {
    const needsDownload = isTextLike(mime) || mime.startsWith("image/") || mime.startsWith("audio/");
    let bytes: Uint8Array | null = null;
    if (needsDownload) {
      const { data: dl, error: dlErr } = await admin.storage.from("orbit-media").download(a.storage_path);
      if (dlErr || !dl) throw new Error(dlErr?.message || "download failed");
      bytes = new Uint8Array(await dl.arrayBuffer());
    }

    if (!lovableKey) {
      extracted = { heuristic_kind: detectedKind, note: "IA desabilitada (LOVABLE_API_KEY ausente)." };
      assetSummary = `${detectedKind} (${a.mime || "binário"}) catalogado sem análise de IA.`;
    } else if (isTextLike(mime) && bytes) {
      const slice = bytes.slice(0, MAX_TEXT_BYTES);
      const raw = new TextDecoder("utf-8", { fatal: false }).decode(slice);
      const truncated = bytes.byteLength > MAX_TEXT_BYTES;
      let parsedJson: any;
      if (mime.includes("json") || (a.filename || "").toLowerCase().endsWith(".json")) {
        try { parsedJson = JSON.parse(raw); } catch { /* ignora */ }
      }
      const ai = await callLovableAI(lovableKey, ASSET_SYSTEM_PROMPT, `Nome do arquivo: ${a.filename}
MIME: ${a.mime}
Detecção heurística: ${detectedKind}
${truncated ? "(conteúdo truncado em 500KB)\n" : ""}
Conteúdo:
"""
${raw}
"""`);
      modelUsed = MODEL;
      tokensIn += ai.tokens_in ?? 0;
      tokensOut += ai.tokens_out ?? 0;
      if (ai.error) assetError = ai.error;
      else if (ai.parsed) {
        extracted = { ...ai.parsed, heuristic_kind: detectedKind, truncated };
        if (parsedJson) extracted.raw_json_root_keys = Object.keys(parsedJson).slice(0, 30);
        assetSummary = String(ai.parsed.summary ?? "").slice(0, 800);
      } else {
        extracted = { raw_ai_content: ai.content.slice(0, 2000), heuristic_kind: detectedKind, truncated };
      }
    } else if (mime.startsWith("image/") && bytes) {
      if (bytes.byteLength > MAX_INLINE_BYTES) throw new Error("imagem maior que o limite inline (18MB)");
      const dataUrl = `data:${mime};base64,${bytesToBase64(bytes)}`;
      const ai = await callLovableAI(lovableKey, ASSET_SYSTEM_PROMPT, [
        { type: "text", text: `Analise esta imagem enviada pelo cliente (arquivo: ${a.filename}). Faça OCR do texto visível e descreva objetivamente o que aparece. Não invente números nem promessas.` },
        { type: "image_url", image_url: { url: dataUrl } },
      ]);
      modelUsed = MODEL;
      tokensIn += ai.tokens_in ?? 0;
      tokensOut += ai.tokens_out ?? 0;
      if (ai.error) assetError = ai.error;
      else if (ai.parsed) {
        extracted = { ...ai.parsed, heuristic_kind: detectedKind, analysis: "vision_ocr" };
        assetSummary = String(ai.parsed.summary ?? "").slice(0, 800);
      } else {
        extracted = { raw_ai_content: ai.content.slice(0, 2000), heuristic_kind: detectedKind, analysis: "vision_ocr" };
      }
    } else if (mime.startsWith("audio/") && bytes) {
      const fmt = AUDIO_FORMATS[mime];
      if (!fmt) {
        extracted = { heuristic_kind: detectedKind, note: `Container de áudio não suportado para transcrição: ${mime}` };
        assetSummary = `Áudio (${mime}) catalogado sem transcrição — container não suportado.`;
      } else if (bytes.byteLength > MAX_INLINE_BYTES) {
        extracted = { heuristic_kind: detectedKind, note: "Áudio maior que o limite inline (18MB) — sem transcrição." };
        assetSummary = `Áudio de ${Math.round(bytes.byteLength / 1024)} KB catalogado sem transcrição.`;
      } else {
        const ai = await callLovableAI(lovableKey, ASSET_SYSTEM_PROMPT, [
          { type: "text", text: `Transcreva integralmente este áudio enviado pelo cliente (arquivo: ${a.filename}) em português e resuma o conteúdo. Não invente trechos inaudíveis.` },
          { type: "input_audio", input_audio: { data: bytesToBase64(bytes), format: fmt } },
        ]);
        modelUsed = MODEL;
        tokensIn += ai.tokens_in ?? 0;
        tokensOut += ai.tokens_out ?? 0;
        if (ai.error) {
          assetError = ai.error;
          extracted = { heuristic_kind: detectedKind, note: "Falha na transcrição — asset catalogado por metadados." };
          assetSummary = `Áudio (${mime}) catalogado; transcrição indisponível.`;
        } else if (ai.parsed) {
          extracted = { ...ai.parsed, heuristic_kind: detectedKind, analysis: "audio_transcription" };
          assetSummary = String(ai.parsed.summary ?? "").slice(0, 800);
        } else {
          extracted = { raw_ai_content: ai.content.slice(0, 4000), heuristic_kind: detectedKind, analysis: "audio_transcription" };
        }
      }
    } else {
      // Vídeo e demais binários: catálogo por metadados nesta etapa.
      extracted = {
        heuristic_kind: detectedKind,
        analysis: "metadata_only",
        note: mime.startsWith("video/")
          ? "Vídeo catalogado por metadados nesta etapa (sem análise de quadros)."
          : "Binário não textual catalogado por metadados.",
        mime: a.mime,
        size_bytes: a.size_bytes,
      };
      assetSummary = `${detectedKind} (${a.mime || "binário"}) catalogado por metadados.`;
    }
  } catch (e) {
    assetError = (e as Error).message;
  }

  const finalKind = (extracted as any)?.detected_kind || detectedKind;
  const { data: cur } = await admin
    .from("orbit_onboarding_asset_insights")
    .select("attempts")
    .eq("asset_id", a.id)
    .maybeSingle();

  await admin.from("orbit_onboarding_asset_insights").upsert({
    empresa_id: ob.empresa_id,
    onboarding_id: ob.id,
    asset_id: a.id,
    detected_kind: finalKind,
    summary: assetSummary ?? null,
    extracted,
    error: assetError ?? null,
    model: modelUsed ?? null,
    tokens_in: tokensIn || null,
    tokens_out: tokensOut || null,
    process_status: assetError ? "error" : "done",
    attempts: Number(cur?.attempts ?? 0) + 1,
    last_attempt_at: new Date().toISOString(),
  }, { onConflict: "asset_id" });

  return {
    asset_id: a.id,
    filename: a.filename,
    detected_kind: finalKind,
    summary: assetSummary,
    error: assetError,
    tokens_in: tokensIn,
    tokens_out: tokensOut,
  };
}

async function runBackground(admin: any, lovableKey: string, ob: any, assets: any[], skipDraft: boolean, userId: string) {
  const outcomes: AssetOutcome[] = [];
  for (let i = 0; i < assets.length; i += BATCH_SIZE) {
    const batch = assets.slice(i, i + BATCH_SIZE);
    const res = await Promise.all(
      batch.map((a) =>
        processAsset(admin, lovableKey, ob, a).catch((e) => ({
          asset_id: a.id,
          filename: a.filename,
          detected_kind: "unknown",
          error: (e as Error).message,
        } as AssetOutcome)),
      ),
    );
    outcomes.push(...res);
  }

  let totalTokensIn = outcomes.reduce((s, o) => s + (o.tokens_in ?? 0), 0);
  let totalTokensOut = outcomes.reduce((s, o) => s + (o.tokens_out ?? 0), 0);
  if (skipDraft) return;

  // Draft consolidado usa TODOS os insights do onboarding (não só o lote).
  const { data: allInsights } = await admin
    .from("orbit_onboarding_asset_insights")
    .select("asset_id, detected_kind, summary, error")
    .eq("onboarding_id", ob.id);
  const insightsSummary = allInsights ?? outcomes;

  let draft: any = { flows: [], templates: [], cadences: [], knowledge: [], lead_score: {}, notes: "" };
  let draftModel: string | undefined;
  let draftError: string | undefined;

  if (lovableKey) {
    const consolidatedPrompt = `Você é o assistente de implantação Orbit. Consolide um RASCUNHO de plano de implantação a partir:
1) das respostas do onboarding (JSON abaixo),
2) dos insights extraídos de cada material (JSON abaixo).

REGRAS DUROS:
- Não invente fluxos, templates ou métricas — só use o que aparece nas respostas ou nos insights.
- Este é APENAS um rascunho de sugestão para revisão humana. Nada será aplicado automaticamente.
- Devolva JSON estrito no formato:
{
  "flows": [ { "name": "", "trigger": "", "steps_summary": "", "based_on": "" } ],
  "templates": [ { "channel": "whatsapp|email", "purpose": "", "draft": "", "based_on": "" } ],
  "cadences": [ { "audience": "priority|hot|cold", "steps": ["D+0 ...", "D+1 ..."] } ],
  "knowledge": [ { "title": "", "source": "asset|response", "notes": "" } ],
  "lead_score": { "priority_signals": [], "hot_signals": [], "cold_signals": [] },
  "notes": "observações e riscos em markdown curto"
}`;
    const ai = await callLovableAI(lovableKey, consolidatedPrompt, `Responses:
${JSON.stringify(ob.responses ?? {}, null, 2).slice(0, 40_000)}

Insights dos materiais (${insightsSummary.length}):
${JSON.stringify(insightsSummary, null, 2).slice(0, 20_000)}`);
    draftModel = MODEL;
    if (ai.error) draftError = ai.error;
    else if (ai.parsed) draft = { ...draft, ...ai.parsed };
    else if (ai.content) draft.notes = ai.content.slice(0, 4000);
    totalTokensIn += ai.tokens_in ?? 0;
    totalTokensOut += ai.tokens_out ?? 0;
  } else {
    draft.notes = "Rascunho gerado sem IA (LOVABLE_API_KEY ausente). Apenas metadados dos materiais foram catalogados.";
  }

  let summaryMd = "";
  try {
    const lines: string[] = [];
    lines.push(`# Rascunho inteligente — ${ob.cliente_empresa ?? ob.cliente_nome ?? "Onboarding"}`);
    lines.push("");
    lines.push(`Materiais analisados: ${insightsSummary.length}`);
    if (draft.flows?.length) {
      lines.push("\n## Fluxos sugeridos");
      for (const f of draft.flows) lines.push(`- **${f.name}** — ${f.trigger}: ${f.steps_summary}`);
    }
    if (draft.templates?.length) {
      lines.push("\n## Templates sugeridos");
      for (const t of draft.templates) lines.push(`- [${t.channel}] ${t.purpose}`);
    }
    if (draft.cadences?.length) {
      lines.push("\n## Cadências");
      for (const c of draft.cadences) lines.push(`- ${c.audience}: ${(c.steps || []).join(" · ")}`);
    }
    if (draft.notes) { lines.push("\n## Notas"); lines.push(String(draft.notes)); }
    summaryMd = lines.join("\n");
  } catch (_) { /* ignore */ }

  await admin.from("orbit_onboarding_implementation_drafts").upsert({
    empresa_id: ob.empresa_id,
    onboarding_id: ob.id,
    status: "draft",
    draft,
    summary_markdown: summaryMd,
    assets_considered: insightsSummary.length,
    model: draftModel ?? null,
    tokens_in: totalTokensIn || null,
    tokens_out: totalTokensOut || null,
    error: draftError ?? null,
    created_by: userId,
  }, { onConflict: "onboarding_id" });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY") ?? "";

    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return fail(ErrorCodes.UNAUTHORIZED, "Missing bearer token", 401, undefined, req);
    }
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return fail(ErrorCodes.UNAUTHORIZED, "Invalid session", 401, undefined, req);
    }
    const userId = claimsData.claims.sub as string;

    const body = (await req.json().catch(() => ({}))) as Body;
    if (!body?.onboarding_id) {
      return fail(ErrorCodes.VALIDATION_ERROR, "onboarding_id obrigatório", 400, undefined, req);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: ob, error: obErr } = await admin
      .from("orbit_client_onboardings")
      .select("id, empresa_id, cliente_nome, cliente_empresa, responses, status, archived")
      .eq("id", body.onboarding_id)
      .maybeSingle();
    if (obErr || !ob) return fail(ErrorCodes.NOT_FOUND, "Onboarding não encontrado", 404, undefined, req);
    if (ob.archived) return fail(ErrorCodes.FORBIDDEN, "Onboarding arquivado", 403, undefined, req);

    const { data: membership } = await admin
      .from("user_empresa_memberships")
      .select("user_id")
      .eq("user_id", userId).eq("empresa_id", ob.empresa_id).maybeSingle();
    if (!membership) {
      return fail(ErrorCodes.FORBIDDEN, "Usuário não pertence ao tenant do onboarding", 403, undefined, req);
    }

    let assetsQuery = admin
      .from("orbit_onboarding_assets")
      .select("id, storage_path, filename, mime, size_bytes, section_key, field_key")
      .eq("onboarding_id", ob.id)
      .order("created_at", { ascending: true })
      .limit(MAX_ASSETS);
    if (body.asset_id) assetsQuery = assetsQuery.eq("id", body.asset_id);
    const { data: assets, error: asErr } = await assetsQuery;
    if (asErr) return fail(ErrorCodes.INTERNAL_ERROR, asErr.message, 500, undefined, req);

    // Não reprocessar assets já concluídos (salvo force=true ou run pontual).
    const { data: done } = await admin
      .from("orbit_onboarding_asset_insights")
      .select("asset_id, process_status")
      .eq("onboarding_id", ob.id);
    const doneSet = new Set(
      (done ?? []).filter((d: any) => d.process_status === "done").map((d: any) => d.asset_id),
    );
    const pending = (assets ?? []).filter((a) => body.force || !doneSet.has(a.id));

    // Marca a fila antes de responder — a UI já vê "queued" no primeiro refetch.
    for (const a of pending) {
      await admin.from("orbit_onboarding_asset_insights").upsert({
        empresa_id: ob.empresa_id,
        onboarding_id: ob.id,
        asset_id: a.id,
        process_status: "queued",
      }, { onConflict: "asset_id" });
    }

    const skipDraft = !!body.asset_id;
    const work = runBackground(admin, lovableKey, ob, pending, skipDraft, userId)
      .catch((e) => console.error("[process-assets] background falhou:", (e as Error).message));
    // Background task: a resposta HTTP sai imediatamente.
    const runtime = (globalThis as any).EdgeRuntime;
    if (runtime?.waitUntil) runtime.waitUntil(work);

    return ok({
      onboarding_id: ob.id,
      mode: "background",
      assets_total: (assets ?? []).length,
      assets_queued: pending.length,
      assets_skipped_done: (assets ?? []).length - pending.length,
      // Compat com a UI atual:
      assets_processed: pending.length,
      insights: pending.map((a) => ({
        asset_id: a.id,
        filename: a.filename,
        detected_kind: detectKindFromFilename(a.filename || "", a.mime || ""),
        process_status: "queued",
      })),
      draft_status: skipDraft ? "unchanged" : "queued",
      ai_enabled: !!lovableKey,
    }, undefined, req);
  } catch (e) {
    return fail(ErrorCodes.INTERNAL_ERROR, (e as Error).message, 500, undefined, req);
  }
});
