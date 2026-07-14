import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ok, fail, optionsResponse, ErrorCodes } from "../_shared/responses.ts";

/**
 * Onboarding Inteligente v3 — Fase 3: processador de materiais.
 *
 * READ-ONLY. NUNCA altera fluxos, templates, agenda, Lead Score, campanhas,
 * knowledge base ou Z-API. Apenas lê os assets do bucket privado
 * `orbit-media` e materializa:
 *   - orbit_onboarding_asset_insights (um por asset)
 *   - orbit_onboarding_implementation_drafts (um consolidado por onboarding)
 *
 * Input: { onboarding_id: string }
 * Auth: JWT do tenant admin (JWT verification ativado no config).
 */

const MAX_TEXT_BYTES = 500 * 1024;   // 500 KB por asset processado
const MAX_ASSETS = 12;               // limite defensivo por corrida
const TEXT_LIKE_MIMES = [
  "application/json",
  "text/",
  "application/xml",
  "application/x-yaml",
  "application/yaml",
];
const MODEL = "google/gemini-2.5-flash";

interface Body { onboarding_id: string; asset_id?: string }

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

async function callLovableAI(apiKey: string, systemPrompt: string, userPrompt: string): Promise<{
  content: string;
  parsed?: any;
  tokens_in?: number;
  tokens_out?: number;
  error?: string;
}> {
  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
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
    return {
      content,
      parsed,
      tokens_in: j?.usage?.prompt_tokens,
      tokens_out: j?.usage?.completion_tokens,
    };
  } catch (e) {
    return { content: "", error: (e as Error).message };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse(req);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableKey = Deno.env.get("LOVABLE_API_KEY") ?? "";

    // ── Auth (JWT do usuário admin do tenant) ──
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return fail(ErrorCodes.UNAUTHORIZED, "Missing bearer token", 401, undefined, req);
    }
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
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

    // Carrega onboarding + valida acesso do usuário no tenant
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

    // Assets do onboarding (opcionalmente filtrando por asset_id específico)
    let assetsQuery = admin
      .from("orbit_onboarding_assets")
      .select("id, storage_path, filename, mime, size_bytes, section_key, field_key")
      .eq("onboarding_id", ob.id)
      .order("created_at", { ascending: true })
      .limit(MAX_ASSETS);
    if (body.asset_id) assetsQuery = assetsQuery.eq("id", body.asset_id);
    const { data: assets, error: asErr } = await assetsQuery;
    if (asErr) return fail(ErrorCodes.INTERNAL_ERROR, asErr.message, 500, undefined, req);

    const insightsSummary: Array<{
      asset_id: string; filename: string; detected_kind: string;
      summary?: string; error?: string;
    }> = [];

    let totalTokensIn = 0;
    let totalTokensOut = 0;

    for (const a of assets ?? []) {
      const detectedKind = detectKindFromFilename(a.filename || "", a.mime || "");
      const canReadText = isTextLike(a.mime);

      let assetSummary: string | undefined;
      let extracted: any = { kind: detectedKind };
      let assetError: string | undefined;
      let modelUsed: string | undefined;

      if (canReadText) {
        try {
          const { data: dl, error: dlErr } = await admin.storage
            .from("orbit-media")
            .download(a.storage_path);
          if (dlErr || !dl) throw new Error(dlErr?.message || "download failed");
          const buf = new Uint8Array(await dl.arrayBuffer());
          const slice = buf.slice(0, MAX_TEXT_BYTES);
          const raw = new TextDecoder("utf-8", { fatal: false }).decode(slice);
          const truncated = buf.byteLength > MAX_TEXT_BYTES;

          // Se JSON válido → parseia bruto (útil pra Typebot)
          let parsedJson: any;
          if ((a.mime || "").includes("json") || (a.filename || "").toLowerCase().endsWith(".json")) {
            try { parsedJson = JSON.parse(raw); } catch { /* ignora */ }
          }

          if (lovableKey) {
            const sys = `Você é analista de implantação de CRM. Recebe um material enviado por um cliente durante o onboarding.
Devolva JSON estrito com este formato:
{
  "detected_kind": "typebot_flow|conversation_transcript|faq|presentation|json_document|markdown_document|text_document|unknown",
  "summary": "resumo curto (máx 400 chars) em português",
  "highlights": ["até 8 bullets curtos com achados relevantes"],
  "questions": ["se for typebot/formulário: liste as perguntas capturadas"],
  "cta": "se detectar CTA (agenda, telefone, link), diga qual",
  "tone_hints": "pistas de tom de voz observadas, se houver",
  "risks": ["riscos ou pontos ambíguos"]
}
NUNCA invente fatos que não estão no material. Campos sem evidência devem vir vazios ("" ou []).`;
            const userMsg = `Nome do arquivo: ${a.filename}
MIME: ${a.mime}
Detecção heurística: ${detectedKind}
${truncated ? "(conteúdo truncado em 500KB)\n" : ""}
Conteúdo:
"""
${raw}
"""`;
            const ai = await callLovableAI(lovableKey, sys, userMsg);
            modelUsed = MODEL;
            if (ai.error) {
              assetError = ai.error;
            } else if (ai.parsed) {
              extracted = { ...ai.parsed, heuristic_kind: detectedKind, truncated };
              if (parsedJson) extracted.raw_json_root_keys = Object.keys(parsedJson).slice(0, 30);
              assetSummary = String(ai.parsed.summary ?? "").slice(0, 800);
            } else {
              extracted = { raw_ai_content: ai.content.slice(0, 2000), heuristic_kind: detectedKind, truncated };
            }
            if (ai.tokens_in) totalTokensIn += ai.tokens_in;
            if (ai.tokens_out) totalTokensOut += ai.tokens_out;
          } else {
            // Fallback sem IA: só heurística
            extracted = {
              heuristic_kind: detectedKind,
              truncated,
              preview: raw.slice(0, 500),
              root_keys: parsedJson ? Object.keys(parsedJson).slice(0, 30) : undefined,
            };
            assetSummary = `Arquivo ${detectedKind} de ${Math.round(buf.byteLength / 1024)} KB (IA desabilitada — sem LOVABLE_API_KEY).`;
          }
        } catch (e) {
          assetError = (e as Error).message;
        }
      } else {
        // Áudio/vídeo/imagem: não decodificamos — apenas registramos metadata
        extracted = {
          heuristic_kind: detectedKind,
          note: "Conteúdo binário não textual — transcrição/OCR fora do escopo desta fase.",
        };
        assetSummary = `${detectedKind} (${a.mime || "binário"}) registrado sem transcrição.`;
      }

      const { error: upErr } = await admin
        .from("orbit_onboarding_asset_insights")
        .upsert({
          empresa_id: ob.empresa_id,
          onboarding_id: ob.id,
          asset_id: a.id,
          detected_kind: (extracted as any)?.detected_kind || detectedKind,
          summary: assetSummary ?? null,
          extracted,
          error: assetError ?? null,
          model: modelUsed ?? null,
        }, { onConflict: "asset_id" });

      insightsSummary.push({
        asset_id: a.id,
        filename: a.filename,
        detected_kind: (extracted as any)?.detected_kind || detectedKind,
        summary: assetSummary,
        error: upErr?.message || assetError,
      });
    }

    // ── Draft consolidado ──
    let draft: any = {
      flows: [],
      templates: [],
      cadences: [],
      knowledge: [],
      lead_score: {},
      notes: "",
    };
    let summaryMd = "";
    let draftModel: string | undefined;
    let draftError: string | undefined;

    // Se for um run parcial (asset_id específico), NÃO recompute o draft consolidado
    // — evita sobrescrever o rascunho completo com base em apenas 1 material.
    const skipDraft = !!body.asset_id;

    if (!skipDraft && lovableKey) {
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
      const userMsg = `Responses:
${JSON.stringify(ob.responses ?? {}, null, 2).slice(0, 40_000)}

Insights dos materiais (${insightsSummary.length}):
${JSON.stringify(insightsSummary, null, 2).slice(0, 20_000)}`;
      const ai = await callLovableAI(lovableKey, consolidatedPrompt, userMsg);
      draftModel = MODEL;
      if (ai.error) {
        draftError = ai.error;
      } else if (ai.parsed) {
        draft = { ...draft, ...ai.parsed };
      } else if (ai.content) {
        draft.notes = ai.content.slice(0, 4000);
      }
      if (ai.tokens_in) totalTokensIn += ai.tokens_in;
      if (ai.tokens_out) totalTokensOut += ai.tokens_out;
    } else {
      draft.notes = "Rascunho gerado sem IA (LOVABLE_API_KEY ausente). Apenas metadados dos materiais foram catalogados.";
    }

    // Markdown de resumo (best-effort)
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

    const { error: draftErr } = await admin
      .from("orbit_onboarding_implementation_drafts")
      .upsert({
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

    if (draftErr) return fail(ErrorCodes.INTERNAL_ERROR, `Falha ao gravar draft: ${draftErr.message}`, 500, undefined, req);

    return ok({
      onboarding_id: ob.id,
      assets_processed: insightsSummary.length,
      insights: insightsSummary,
      draft_status: "draft",
      tokens_in: totalTokensIn,
      tokens_out: totalTokensOut,
      ai_enabled: !!lovableKey,
    }, undefined, req);
  } catch (e) {
    return fail(ErrorCodes.INTERNAL_ERROR, (e as Error).message, 500, undefined, req);
  }
});
