import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { getOrbitZapiRuntimeConfig, getOrbitZapiRealSendBlockReason } from "../_shared/orbit-zapi.ts";
import { auditZapiSendAttempt } from "../_shared/zapi-audit.ts";
import { signOrbitMediaUrl } from "../_shared/orbit-media.ts";
import { callAnthropic, toAnthropicMessages, ANTHROPIC_DEFAULT_MODEL } from "../_shared/anthropic.ts";
import {
  getTokenForEmpresa,
  ensureFreshAccessToken,
  checkAvailability,
  createCalendarEvent,
} from "../_shared/google-calendar.ts";
import { isAdapterEnabled, enqueueOutbox } from "../_shared/orbit-whatsapp-outbox.ts";

// ── Estado da conversa (máquina de estados) ──
type ConversationState = "novo" | "aguardando_resposta" | "auto_reply_detected" | "human_detected" | "qualificando" | "qualificado" | "handoff" | "encerrado";

// ── Classificação de mensagem ──
type MessageClassification = "human_probable" | "auto_reply" | "uncertain";

// Mapeamento: intenção detectada → contexto da biblioteca de áudios
const INTENCAO_TO_AUDIO_CONTEXTO: Record<string, string> = {
  "saudacao": "apresentacao",
  "orcamento": "preco",
  "agradecimento": "encerramento",
};

interface LeadContext {
  lead: {
    id: string;
    personName: string | null;
    contactName: string | null;
    companyName: string | null;
    city: string | null;
    email: string | null;
    demandType: string | null;
    isRecurring: boolean | null;
    status: string | null;
    source: string | null;
    owner: string | null;
  };
  conversation: {
    origin: "outbound_campaign" | "inbound";
    state: ConversationState;
    isFirstInteraction: boolean;
    introAlreadySent: boolean;
  };
  missingFields: Record<string, boolean>;
}

// ── Validação de dados extraídos ──
function validateExtractedData(dados: Record<string, any>): Record<string, any> {
  const validated: Record<string, any> = {};

  for (const [campo, valor] of Object.entries(dados)) {
    if (valor === null || valor === undefined || String(valor).trim() === "") continue;

    const strVal = String(valor).trim();

    switch (campo) {
      case "email_principal":
        if (strVal.includes("@") && strVal.includes(".")) {
          validated[campo] = strVal.toLowerCase();
        } else {
          console.log(`[orbit-ai-agent] Email inválido descartado: ${strVal}`);
        }
        break;

      case "nome_fantasia": {
        // Heurística: empresa não deve ser nome de pessoa simples (2 palavras curtas sem maiúsculas internas)
        const words = strVal.split(/\s+/);
        const looksLikePersonName = words.length === 2 && words.every(w => w.length <= 10 && /^[A-ZÀ-Ú][a-zà-ú]+$/.test(w));
        if (looksLikePersonName) {
          console.log(`[orbit-ai-agent] Nome de empresa parece nome de pessoa, descartado: ${strVal}`);
        } else {
          validated[campo] = strVal;
        }
        break;
      }

      case "cidade":
        // Cidade não deve conter números
        if (/\d/.test(strVal)) {
          console.log(`[orbit-ai-agent] Cidade com números descartada: ${strVal}`);
        } else {
          validated[campo] = strVal;
        }
        break;

      default:
        validated[campo] = strVal;
        break;
    }
  }

  return validated;
}

// ── Classificar mensagem como humana, automática ou incerta ──
async function classifyMessage(mensagem: string): Promise<{ classification: MessageClassification; confidence: number }> {
  try {
    const result = await callAnthropic({
      model: ANTHROPIC_DEFAULT_MODEL,
      max_tokens: 100,
      temperature: 0.1,
      system: `Classifique esta mensagem de WhatsApp recebida em resposta a uma campanha comercial.
Categorias:
- auto_reply: mensagem automática, institucional, menu de opções, horário de atendimento, "mensagem automática", "assistente virtual", "em instantes responderemos", "seja bem-vindo à empresa X", "digite 1, 2, 3", recepção automática
- human_probable: saudação real (oi, olá, bom dia), pergunta contextual (quem fala, do que se trata), resposta natural (sim, sou eu, pode falar, eu cuido), demonstração de atenção/interesse
- uncertain: muito vaga, sem evidência suficiente (ok, ?, ., alô)

Responda APENAS com JSON: {"classification": "...", "confidence": 0.0-1.0}`,
      messages: [{ role: "user", content: `Mensagem: "${mensagem}"` }],
    });

    if (!result.ok) {
      console.error("[orbit-ai-agent] Erro na classificação:", result.status, result.error);
      return { classification: "uncertain", confidence: 0.5 };
    }

    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const cls = parsed.classification;
      if (cls === "human_probable" || cls === "auto_reply" || cls === "uncertain") {
        return { classification: cls, confidence: parsed.confidence || 0.5 };
      }
    }
    return { classification: "uncertain", confidence: 0.5 };
  } catch (err) {
    console.error("[orbit-ai-agent] Erro classificação:", err);
    return { classification: "uncertain", confidence: 0.5 };
  }
}

// ── Notificar comercial sobre interação humana detectada ──
async function notifyCommercialHumanDetected(
  supabase: any,
  params: {
    prospect: any;
    telefone_lead: string;
    mensagem: string;
    classification: MessageClassification | string;
    empresa_id: string | null;
    isDemo: boolean;
  }
) {
  const { prospect, telefone_lead, mensagem, classification, empresa_id, isDemo } = params;

  // Determinar vendedor a notificar — DEVE ser da mesma empresa que o prospect.
  // Nada de fallback hardcoded entre tenants (vazamento de dados).
  let vendedorId: string | null = prospect?.responsavel_id || null;

  // Se o responsável existe mas é de outra empresa, ignorar.
  if (vendedorId && empresa_id) {
    const { data: resp } = await supabase
      .from("profiles")
      .select("empresa_id")
      .eq("id", vendedorId)
      .maybeSingle();
    if (resp?.empresa_id && resp.empresa_id !== empresa_id) {
      console.warn("[orbit-ai-agent] Responsável de empresa diferente — ignorando", { vendedorId, empresa_id });
      vendedorId = null;
    }
  }

  // Fallback: primeiro admin/owner da MESMA empresa com telefone preenchido
  if (!vendedorId && empresa_id) {
    const { data: candidato } = await supabase
      .from("profiles")
      .select("id, telefone")
      .eq("empresa_id", empresa_id)
      .not("telefone", "is", null)
      .limit(1)
      .maybeSingle();
    vendedorId = candidato?.id || null;
  }

  if (!vendedorId) {
    console.log("[orbit-ai-agent] Sem vendedor da empresa para notificar — pulando notificação", { empresa_id });
    return;
  }

  const { data: vendedorProfile } = await supabase
    .from("profiles")
    .select("id, nome, telefone, empresa_id")
    .eq("id", vendedorId)
    .single();

  // Última checagem: nunca notificar alguém de outra empresa
  if (empresa_id && vendedorProfile?.empresa_id && vendedorProfile.empresa_id !== empresa_id) {
    console.warn("[orbit-ai-agent] Vendedor resolvido pertence a outra empresa — abortando notificação");
    return;
  }

  const { data: vendedorPe } = await supabase
    .from("pe_users")
    .select("whatsapp, phone")
    .eq("id", vendedorId)
    .maybeSingle();

  const vendedorWhatsapp = vendedorPe?.whatsapp || vendedorPe?.phone || vendedorProfile?.telefone;
  if (!vendedorWhatsapp) {
    console.log("[orbit-ai-agent] Vendedor sem WhatsApp para notificação comercial");
    return;
  }


  const leadPhone = telefone_lead?.replace(/\D/g, "") || "";
  const waLink = `https://wa.me/${leadPhone}`;
  const dataHora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

  // Helper to get display name
  const getDisplayName = (p: any): string => {
    const nome = p?.nome_razao || "";
    const digits = nome.replace(/\D/g, "");
    const isPhone = /^\d{8,}$/.test(digits) && digits.length >= 8;
    const isPlaceholder = nome.startsWith("WhatsApp ");
    return (isPhone || isPlaceholder) ? (p?.nome_fantasia || "Não informado") : (nome || "Não informado");
  };

  const motivo = (classification || "").toString();
  const titulo =
    motivo === "venda_fechada" ? "Venda confirmada"
    : motivo === "agendar_call" ? "Call agendada"
    : motivo === "falar_humano" ? "Lead pediu atendimento humano"
    : "Novo sinal comercial";

  const notificacao = [
    `${titulo} — ${getDisplayName(prospect)}`,
    `Mensagem: "${(mensagem || "").substring(0, 200)}"`,
    `Conversa: ${waLink}`,
    `${dataHora}`,
  ].join("\n");

  const vendedorPhone = vendedorWhatsapp.replace(/\D/g, "");

  if (isDemo) {
    console.log("[orbit-ai-agent] Demo — notificação comercial simulada:", vendedorPhone);
    return;
  }

  const zapiConfig = await getOrbitZapiRuntimeConfig(supabase, empresa_id);
  const notifyBlockReason = getOrbitZapiRealSendBlockReason(zapiConfig);
  if (notifyBlockReason) {
    console.warn("[orbit-ai-agent] Notificação comercial bloqueada:", notifyBlockReason);
    await auditZapiSendAttempt(supabase, {
      empresa_id,
      function_name: "orbit-ai-agent",
      action: "notify_vendedor",
      blocked: true,
      block_reason: "ZAPI_REAL_SEND_BLOCKED",
      zapi_config_id: zapiConfig?.id ?? null,
      payload_summary: { telefone: vendedorPhone },
    });
    return;
  }

  if (zapiConfig?.instance_id && zapiConfig?.token) {
    const response = await fetch(
      `https://api.z-api.io/instances/${zapiConfig.instance_id}/token/${zapiConfig.token}/send-text`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Client-Token": zapiConfig.client_token || "",
        },
        body: JSON.stringify({ phone: vendedorPhone, message: notificacao }),
      }
    );
    console.log("[orbit-ai-agent] Notificação comercial enviada:", response.ok);
  }
}

// ── Calcular próximo estado da conversa ──
function computeNextState(
  currentState: ConversationState,
  intencao: string,
  cadastroCompleto: boolean,
  isHandoff: boolean,
  messageClassification?: MessageClassification
): ConversationState {
  if (isHandoff) return "handoff";
  if (cadastroCompleto) return "qualificado";
  if (intencao === "falar_humano") return "handoff";
  
  // Transições baseadas em classificação de mensagem
  if (messageClassification === "auto_reply" && (currentState === "aguardando_resposta" || currentState === "novo")) {
    return "auto_reply_detected";
  }
  if (messageClassification === "human_probable" && (currentState === "aguardando_resposta" || currentState === "novo" || currentState === "auto_reply_detected")) {
    return "human_detected";
  }
  
  if (currentState === "human_detected") return "qualificando";
  if (currentState === "aguardando_resposta" || currentState === "novo") return "qualificando";
  if (currentState === "qualificando" && cadastroCompleto) return "qualificado";
  return (currentState as string) === "novo" ? "qualificando" : currentState;
}

// ── Montar leadContext estruturado ──
function buildLeadContext(
  prospect: any,
  conversa: any,
  aiContexto: any,
  camposFaltantes: string[],
  primeiraInteracao: boolean
): LeadContext {
  const isFromCampaign = aiContexto.origin === "outbound_campaign";
  const introAlreadySent = aiContexto.intro_already_sent === true;
  const currentState: ConversationState = aiContexto.estado || "novo";

  const missingFields: Record<string, boolean> = {};
  const fieldMap: Record<string, string> = {
    nome_fantasia: "companyName",
    nome_contato: "contactName",
    cidade: "city",
    email_principal: "email",
    segmento: "demandType",
  };

  for (const campo of camposFaltantes) {
    const key = fieldMap[campo] || campo;
    missingFields[key] = true;
  }

  // isRecurring vem do ai_contexto
  if (aiContexto.is_recurring === null || aiContexto.is_recurring === undefined) {
    missingFields["isRecurring"] = true;
  }

  return {
    lead: {
      id: prospect?.id || "",
      personName: prospect?.nome_razao || null,
      contactName: prospect?.nome_contato || null,
      companyName: prospect?.nome_fantasia || null,
      city: prospect?.cidade || null,
      email: prospect?.email_principal || null,
      demandType: prospect?.segmento || null,
      isRecurring: aiContexto.is_recurring ?? null,
      status: prospect?.status_qualificacao || null,
      source: prospect?.origem_contato || null,
      owner: prospect?.responsavel_id || null,
    },
    conversation: {
      origin: isFromCampaign ? "outbound_campaign" : "inbound",
      state: currentState,
      isFirstInteraction: primeiraInteracao,
      introAlreadySent: introAlreadySent,
    },
    missingFields,
  };
}

async function getAudioClip(supabase: any, empresaId: string | null | undefined, contexto: string) {
  if (!empresaId) return null;
  try {
    const { data } = await supabase
      .from("orbit_audio_library")
      .select("id, url, storage_path, uso_count")
      .eq("empresa_id", empresaId)
      .eq("contexto", contexto)
      .eq("ativo", true)
      .order("uso_count", { ascending: true })
      .limit(1)
      .maybeSingle();
    return data || null;
  } catch {
    return null;
  }
}

async function sendWhatsAppAudio(
  supabase: any,
  telefone: string,
  audioSource: string,
  conversa_id: string,
  empresaId?: string | null,
  opts: { audioKey?: string | null } = {},
) {
  try {
    // ── Adapter routing (Fase 3): ai_reply/áudio enfileira quando outbox_adapter_enabled=true ──
    if (empresaId && await isAdapterEnabled(supabase, empresaId)) {
      const { data: lastIn } = await supabase
        .from("orbit_mensagens")
        .select("id")
        .eq("conversa_id", conversa_id)
        .eq("direcao", "IN")
        .order("timestamp", { ascending: false })
        .limit(1)
        .maybeSingle();
      const inboundId = (lastIn as any)?.id ?? conversa_id;
      const audioKey = opts.audioKey ?? audioSource;
      const { data: conv } = await supabase
        .from("orbit_conversas")
        .select("prospect_id")
        .eq("id", conversa_id)
        .maybeSingle();
      const isPath = !/^https?:\/\//i.test(audioSource);
      // Pré-cria a linha visual antes de enfileirar para linkar orbit_message_id.
      const { data: novaAudio } = await supabase.from("orbit_mensagens").insert({
        conversa_id,
        direcao: "OUT",
        mensagem: "🎙️ Áudio",
        tipo_midia: "audio",
        storage_path: isPath ? audioSource : null,
        url_midia: isPath ? null : audioSource,
        canal: "whatsapp",
        status: "queued",
        empresa_id: empresaId,
      }).select("id").single();

      const routed = await enqueueOutbox(supabase, {
        empresa_id: empresaId,
        conversa_id,
        prospect_id: (conv as any)?.prospect_id ?? null,
        source_type: "ai_reply",
        // Chave única = inbound + tipo + identificador do áudio (permite texto+áudio no mesmo turn).
        inbound_message_id: `${inboundId}:audio:${audioKey}`,
        source_id: audioKey,
        payload_type: "audio",
        payload: {
          storage_path: isPath ? audioSource : null,
          // Padronizado em url_midia (worker aceita url legado como fallback).
          url_midia: isPath ? null : audioSource,
        },
        metadata: { orbit_message_id: novaAudio?.id ?? null },
      });
      // Retry dedupe: descarta a linha pré-criada se já havia outbox equivalente.
      if (!routed.enqueued && routed.reason === "duplicate" && novaAudio?.id) {
        await supabase.from("orbit_mensagens").delete().eq("id", novaAudio.id);
      }
      console.log("[orbit-ai-agent] Adapter routed ai_reply(audio):", routed);
      return;
    }

    const zapiConfig = await getOrbitZapiRuntimeConfig(supabase, empresaId);
    if (!zapiConfig?.instance_id || !zapiConfig?.token) {
      console.log("[orbit-ai-agent] Z-API não configurado para envio de áudio de biblioteca");
      return;
    }
    const audioBlockReason = getOrbitZapiRealSendBlockReason(zapiConfig);
    if (audioBlockReason) {
      console.warn("[orbit-ai-agent] Áudio biblioteca bloqueado:", audioBlockReason);
      return;
    }
    // audioSource pode ser storage_path puro ou URL antiga; helper cobre ambos.
    const signedAudioUrl = await signOrbitMediaUrl(supabase, audioSource, 3600) || audioSource;
    const response = await fetch(
      `https://api.z-api.io/instances/${zapiConfig.instance_id}/token/${zapiConfig.token}/send-audio`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "Client-Token": zapiConfig.client_token || "" },
        body: JSON.stringify({ phone: telefone, audio: signedAudioUrl }),
      }
    );
    const result = await response.json();
    console.log("[orbit-ai-agent] Áudio da biblioteca enviado:", result);
    // Persistir storage_path se for path do bucket; senão gravar como url_midia (legado).
    const isPath = !/^https?:\/\//i.test(audioSource);
    await supabase.from("orbit_mensagens").insert({
      conversa_id,
      direcao: "OUT",
      mensagem: "🎙️ Áudio",
      tipo_midia: "audio",
      storage_path: isPath ? audioSource : null,
      url_midia: isPath ? null : audioSource,
      canal: "whatsapp",
      status: response.ok ? "enviada" : "falhou",
      provider_message_id: result.messageId || null,
      empresa_id: empresaId,
    });
    await supabase
      .from("orbit_conversas")
      .update({ ultima_mensagem_at: new Date().toISOString(), ultima_mensagem_preview: "🎙️ Áudio" })
      .eq("id", conversa_id);
  } catch (error) {
    console.error("[orbit-ai-agent] Erro ao enviar áudio de biblioteca:", error);
  }
}

// ── RAG: embedding + busca semântica ──
async function embedQuery(text: string): Promise<number[] | null> {
  try {
    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key || !text?.trim()) return null;
    const res = await fetch("https://ai.gateway.lovable.dev/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "google/gemini-embedding-001", input: text.slice(0, 4000) }),
    });
    if (!res.ok) {
      console.warn("[orbit-ai-agent] embed_failed:", res.status);
      return null;
    }
    const data = await res.json();
    const v = data?.data?.[0]?.embedding;
    return Array.isArray(v) ? v : null;
  } catch (e) {
    console.warn("[orbit-ai-agent] embed exception:", e);
    return null;
  }
}

interface RagChunk { titulo: string | null; conteudo_texto: string; similarity: number; tipo: string }
async function fetchRagChunks(supabase: any, empresaId: string | null | undefined, query: string): Promise<RagChunk[]> {
  if (!empresaId) return [];
  const emb = await embedQuery(query);
  if (!emb) return [];
  try {
    const { data, error } = await supabase.rpc("match_orbit_knowledge", {
      p_empresa_id: empresaId,
      query_embedding: emb as unknown as string,
      match_count: 3,
      min_similarity: 0.7,
    });
    if (error) {
      console.warn("[orbit-ai-agent] match_orbit_knowledge error:", error.message);
      return [];
    }
    return (data || []) as RagChunk[];
  } catch (e) {
    console.warn("[orbit-ai-agent] rag rpc exception:", e);
    return [];
  }
}

serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // ── Shared-secret auth: only the orbit-webhook processor may call this ──
  const expectedSecret = Deno.env.get("ORBIT_AI_AGENT_SECRET");
  if (!expectedSecret) {
    console.error("[orbit-ai-agent] ORBIT_AI_AGENT_SECRET not configured");
    return new Response(JSON.stringify({ error: "Server not configured" }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const providedSecret = req.headers.get("x-orbit-internal-secret") || "";
  if (providedSecret.length !== expectedSecret.length) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  let diff = 0;
  for (let i = 0; i < expectedSecret.length; i++) {
    diff |= providedSecret.charCodeAt(i) ^ expectedSecret.charCodeAt(i);
  }
  if (diff !== 0) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let conversaIdForCleanup: string | null = null;
  let supabaseForCleanup: any = null;
  try {
    const { conversa_id, prospect_id, mensagem, telefone } = await req.json();
    conversaIdForCleanup = conversa_id ?? null;
    console.log("[orbit-ai-agent] Processando:", { conversa_id, prospect_id, mensagem: mensagem?.substring(0, 50) });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    supabaseForCleanup = supabase;

    // ── LOCK: marcar conversa como em processamento ──
    await supabase
      .from("orbit_conversas")
      .update({ ai_processing: true })
      .eq("id", conversa_id);

    try {
    // ── DEBOUNCE: aguardar 10 segundos para agregar mensagens quebradas ──
    console.log("[orbit-ai-agent] Aguardando 10s para agregar mensagens...");
    await new Promise(r => setTimeout(r, 10000));

    // Buscar prospect first to get empresa_id
    const { data: prospect } = await supabase
      .from("orbit_prospects")
      .select("*")
      .eq("id", prospect_id)
      .single();

    // Determine if demo
    let isDemo = false;
    const empresaId = prospect?.empresa_id;
    if (empresaId) {
      const { data: saasEmpresa } = await supabase
        .from("saas_empresa")
        .select("plan_id, plan:saas_plans(code)")
        .eq("empresa_id", empresaId)
        .maybeSingle();
      const planCode = (saasEmpresa?.plan as any)?.code;
      isDemo = planCode === "demo";
    }

    // Buscar config IA (filtered by empresa_id)
    let aiConfigQuery = supabase.from("orbit_ai_config").select("*");
    if (empresaId) {
      aiConfigQuery = aiConfigQuery.eq("empresa_id", empresaId);
    }
    const { data: aiConfig } = await aiConfigQuery.maybeSingle();

    if (!aiConfig) {
      console.log("[orbit-ai-agent] Config IA não encontrada");
      return new Response(JSON.stringify({ ok: false, error: "AI config not found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verificar horário de atendimento no fuso de São Paulo
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(new Date());
    const hh = parts.find(p => p.type === "hour")!.value;
    const mm = parts.find(p => p.type === "minute")!.value;
    const currentTime = `${hh}:${mm}`;
    console.log("[orbit-ai-agent] Horário São Paulo:", currentTime);
    const startTime = (aiConfig.horario_inicio || "08:00").substring(0, 5);
    const endTime = (aiConfig.horario_fim || "18:00").substring(0, 5);
    const isWithinHours = currentTime >= startTime && currentTime <= endTime;

    if (!isWithinHours && !aiConfig.responder_fora_horario) {
      if (aiConfig.mensagem_fora_horario) {
        await sendWhatsAppMessage(supabase, telefone, aiConfig.mensagem_fora_horario, conversa_id, isDemo, empresaId);
      }
      return new Response(JSON.stringify({ ok: true, outside_hours: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Buscar conversa com contexto
    const { data: conversa } = await supabase
      .from("orbit_conversas")
      .select("*")
      .eq("id", conversa_id)
      .single();

    // ── CHATBOT FLOWS: verificar fluxo ativo ou novo trigger (prioridade sobre IA) ──
    const flowHandled = await processChatbotFlow(supabase, {
      conversa,
      conversa_id,
      mensagem,
      telefone,
      empresaId,
      isDemo,
    });
    if (flowHandled) {
      return new Response(JSON.stringify({ ok: true, flow_handled: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── AGREGAR: buscar todas as mensagens IN pendentes desde o último OUT ──
    const { data: lastOutMsg } = await supabase
      .from("orbit_mensagens")
      .select("timestamp")
      .eq("conversa_id", conversa_id)
      .eq("direcao", "OUT")
      .order("timestamp", { ascending: false })
      .limit(1)
      .maybeSingle();

    let pendingQuery = supabase
      .from("orbit_mensagens")
      .select("mensagem")
      .eq("conversa_id", conversa_id)
      .eq("direcao", "IN")
      .order("timestamp", { ascending: true });

    if (lastOutMsg?.timestamp) {
      pendingQuery = pendingQuery.gt("timestamp", lastOutMsg.timestamp);
    }

    const { data: pendingMsgs } = await pendingQuery;
    const mensagemAgregada = (pendingMsgs && pendingMsgs.length > 0)
      ? pendingMsgs.map(m => m.mensagem).join("\n")
      : mensagem;

    console.log("[orbit-ai-agent] Mensagens agregadas:", pendingMsgs?.length || 1, "msgs →", mensagemAgregada.substring(0, 100));

    // ── CLASSIFICAR MENSAGEM: humana, automática ou incerta ──
    const { classification: msgClassification, confidence: msgConfidence } = await classifyMessage(mensagemAgregada);
    console.log("[orbit-ai-agent] Classificação:", msgClassification, "confiança:", msgConfidence);

    // Buscar histórico completo (últimas 20 mensagens para contexto)
    const { data: mensagens } = await supabase
      .from("orbit_mensagens")
      .select("direcao, mensagem, timestamp")
      .eq("conversa_id", conversa_id)
      .order("timestamp", { ascending: false })
      .limit(20);

    const historicoFormatado = (mensagens || [])
      .reverse()
      .map((m) => `${m.direcao === "IN" ? "Cliente" : "Assistente"}: ${m.mensagem}`)
      .join("\n");

    const mensagensIN = mensagens?.filter((m) => m.direcao === "IN").length || 0;
    const mensagensOUT = mensagens?.filter((m) => m.direcao === "OUT").length || 0;
    const aiContexto = conversa?.ai_contexto || {};
    const introAlreadySent = aiContexto.intro_already_sent === true;
    const isFromCampaign = aiContexto.origin === "outbound_campaign";
    const primeiraInteracao = !introAlreadySent && (mensagensOUT === 0 || mensagensIN <= 1);

    const emColetaOrcamento = aiContexto.em_coleta_orcamento || false;
    const camposColetados = aiContexto.campos_coletados || {};
    const camposCadastro: string[] = Array.isArray(aiConfig.campos_qualificacao)
      ? (aiConfig.campos_qualificacao as Array<{ key?: string }>).map((c) => c?.key).filter((k): k is string => !!k)
      : [];
    const camposCadastroEffective = camposCadastro.length > 0 ? camposCadastro : ["nome_razao", "email_principal", "cidade"];
    const maxTokens = aiConfig.max_tokens || 500;
    const idioma = aiConfig.idioma || "pt-BR";

    const camposFaltantes = camposCadastroEffective.filter(
      (campo: string) => !camposColetados[campo] && !prospect?.[campo]
    );
    const cadastroCompleto = camposFaltantes.length === 0;

    // ── Montar contexto estruturado do lead ──
    const leadContext = buildLeadContext(prospect, conversa, aiContexto, camposFaltantes, primeiraInteracao);
    console.log("[orbit-ai-agent] LeadContext:", JSON.stringify(leadContext.conversation), "missing:", Object.keys(leadContext.missingFields));

    // Detect stale prospect (updated more than 90 days ago)
    const isStaleProspect = prospect?.updated_at
      ? (Date.now() - new Date(prospect.updated_at).getTime()) > 90 * 24 * 60 * 60 * 1000
      : false;
    const isReturningContact = !primeiraInteracao || (prospect?.nome_razao && !prospect.nome_razao.startsWith("WhatsApp "));

    const instrucaoOrcamento = "";

    // ── Prompt refatorado com contexto estruturado ──
    const campaignContinuity = isFromCampaign
      ? `\nREGRA DE CAMPANHA: Esta conversa foi iniciada por uma campanha outbound. O prospect já recebeu uma mensagem nossa. NÃO envie boas-vindas novamente. NÃO se reapresente. Considere o histórico e continue a conversa do ponto atual.`
      : "";

    const stateInstruction = (() => {
      switch (leadContext.conversation.state) {
        case "aguardando_resposta":
          return "\nESTADO: Campanha enviada, aguardando resposta. Continue de onde parou.";
        case "auto_reply_detected":
          return "\nESTADO: Resposta automática detectada. Tente contornar a automação e alcançar a pessoa responsável. Pergunte diretamente pela pessoa que cuida de viagens corporativas ou compras.";
        case "human_detected":
          return "\nESTADO: Interação humana detectada. Siga a qualificação normalmente, sem mencionar a detecção.";
        case "qualificando":
          return "\nESTADO: Em qualificação. Colete apenas os campos faltantes listados abaixo.";
        case "qualificado":
          return "\nESTADO: Lead qualificado. Informe que um vendedor especializado entrará em contato.";
        case "handoff":
          return "\nESTADO: Já houve handoff. Se o lead ainda interagir, informe que o responsável entrará em contato em breve.";
        default:
          return "";
      }
    })();

    // Instrução sobre classificação da mensagem recebida
    const classificationInstruction = msgClassification === "auto_reply"
      ? `\nCLASSIFICAÇÃO DA MENSAGEM RECEBIDA: RESPOSTA AUTOMÁTICA. Esta mensagem foi enviada por um sistema automático/bot. Tente contornar educadamente e perguntar pela pessoa responsável por viagens corporativas ou compras. NÃO trate como interesse real.`
      : msgClassification === "human_probable"
      ? `\nCLASSIFICAÇÃO DA MENSAGEM RECEBIDA: INTERAÇÃO HUMANA. Continue a qualificação normalmente.`
      : "";

    // ── E2.7.C2: prompt em 3 blocos + RAG + campos dinâmicos ──
    const promptIdentidade = (aiConfig.prompt_identidade && String(aiConfig.prompt_identidade).trim())
      || "Você é um assistente de vendas.";
    const promptRoteiro = (aiConfig.prompt_roteiro && String(aiConfig.prompt_roteiro).trim()) || "";
    const promptRegras = (aiConfig.prompt_regras && String(aiConfig.prompt_regras).trim()) || "";
    const camposQualificacao: Array<{ key: string; label: string; pergunta: string; tipo: string; required?: boolean; opcoes?: string[] }> =
      Array.isArray(aiConfig.campos_qualificacao) ? aiConfig.campos_qualificacao : [];

    // RAG: buscar contexto relevante (top-3, se base habilitada)
    let ragChunks: RagChunk[] = [];
    if (aiConfig.knowledge_base_enabled && empresaId) {
      ragChunks = await fetchRagChunks(supabase, empresaId, mensagemAgregada);
      console.log("[orbit-ai-agent] RAG chunks:", ragChunks.length, ragChunks.map(c => `${c.titulo ?? c.tipo}(${c.similarity?.toFixed(2)})`).join(", "));
    }
    const ragBlock = ragChunks.length > 0
      ? `\nCONTEXTO EXTRA (Base de Conhecimento) — use estas informações ao responder, citando naturalmente:\n${ragChunks.map((c, i) => `[#${i + 1}${c.titulo ? ` ${c.titulo}` : ""}]\n${c.conteudo_texto}`).join("\n\n")}\n`
      : "";

    // Dynamic qualification: quais campos do builder ainda faltam em dados_adicionais
    const dadosAdicionais = (prospect?.dados_adicionais || {}) as Record<string, unknown>;
    const camposQualificacaoFaltantes = camposQualificacao.filter(
      (c) => !dadosAdicionais[c.key] || String(dadosAdicionais[c.key]).trim() === "",
    );
    const camposQualificacaoBlock = camposQualificacao.length > 0
      ? `\nPERGUNTAS DE QUALIFICAÇÃO DINÂMICAS (extraia respostas em "dados_adicionais"):\n${camposQualificacao.map((c) => {
          const filled = dadosAdicionais[c.key] ? ` ✅ já respondido: "${dadosAdicionais[c.key]}"` : (c.required ? " (obrigatório)" : "");
          const opt = c.tipo === "select" && c.opcoes?.length ? ` [opções: ${c.opcoes.join(" | ")}]` : "";
          return `- ${c.key} (${c.tipo})${opt} — "${c.pergunta || c.label}"${filled}`;
        }).join("\n")}\nNUNCA pergunte algo já respondido. Faça UMA pergunta por vez, na ordem listada. Só pergunte as obrigatórias se ainda faltarem.\n`
      : "";

    const regrasBlock = promptRegras
      ? `\n=== REGRAS INVIOLÁVEIS (MAIOR PESO — devem ser sempre obedecidas) ===\n${promptRegras}\n=== FIM DAS REGRAS INVIOLÁVEIS ===\n`
      : "";

    const _agendaTz = "America/Sao_Paulo";
    const _nowFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: _agendaTz, weekday: "long", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date());
    const _nowISO = new Date().toISOString();
    const dataHoraAtualBlock = `\nDATA/HORA ATUAL (referência para agendamentos): ${_nowFmt} (${_agendaTz}) — ISO: ${_nowISO}\nREGRA CRÍTICA DE AGENDAMENTO: NUNCA devolva "data_iso" no passado. Se o cliente citar um dia da semana (ex.: "segunda-feira"), resolva SEMPRE para a próxima ocorrência FUTURA a partir da data atual acima. Se o cliente citar horário do dia atual já passado, resolva para o próximo dia útil. Ano correto é derivado da data atual; nunca use anos passados.\n`;

    const systemPrompt = `${promptIdentidade}

Tom de voz: ${aiConfig.tom_conversa || "profissional e amigável"}
Idioma: ${idioma === "pt-BR" ? "Português do Brasil" : idioma === "en" ? "Inglês" : "Espanhol"}
${campaignContinuity}${stateInstruction}${classificationInstruction}
${promptRoteiro ? `\nROTEIRO DE QUALIFICAÇÃO:\n${promptRoteiro}\n` : ""}${dataHoraAtualBlock}
CONTEXTO ESTRUTURADO DO LEAD:
${JSON.stringify(leadContext, null, 2)}
${camposQualificacaoBlock}${ragBlock}
REGRAS CRÍTICAS:
1. DADOS EXISTENTES: Se um dado do lead já está preenchido no contexto acima (personName, companyName, city, email, etc.), NUNCA pergunte novamente. Use naturalmente na conversa.
2. CAMPOS FALTANTES: Solicite APENAS os campos marcados como "true" em missingFields, e as perguntas dinâmicas ainda não respondidas.
3. Se for PRIMEIRA INTERAÇÃO (isFirstInteraction=true) E NÃO for campanha, envie a mensagem de boas-vindas: "${aiConfig.mensagem_boas_vindas || 'Olá! Como posso ajudá-lo?'}"
4. Se o cliente pedir ORÇAMENTO, COTAÇÃO ou demonstrar interesse em comprar, inicie a coleta dos campos faltantes.
5. Quando TODAS as informações relevantes (cadastro + qualificação obrigatória) estiverem preenchidas, agradeça e informe: "Perfeito. Vou colocar um especialista para avançarmos de forma mais objetiva."
6. NUNCA invente dados sobre produtos ou preços — se a Base de Conhecimento não trouxer a resposta, diga que vai confirmar e seguir.
7. Seja cordial e responda de forma concisa — máximo 2-3 frases.
8. SEMPRE responda no idioma configurado.
9. NUNCA resetar conversa. NUNCA reapresentar-se se já houve interação anterior.
10. Se o cliente pedir para falar com um vendedor humano, defina "intencao" como "falar_humano".
${instrucaoOrcamento}

REGRA DE ATUALIZAÇÃO CADASTRAL: ${isStaleProspect && isReturningContact ? `Cadastro DESATUALIZADO (>90 dias). Confirme gentilmente se os dados ainda estão corretos e extraia novos em "dados_extraidos".` : "Cadastro atualizado, não solicitar atualização."}

IMPORTANTE: Responda em JSON com esta estrutura:
{
  "intencao": "saudacao|orcamento|duvida|reclamacao|agradecimento|agendar_call|venda_fechada|falar_humano|outro",
  "mensagem": "sua resposta ao cliente em linguagem natural",
  "iniciar_coleta_orcamento": true|false,
  "dados_extraidos": { "nome_fantasia": "...", "cidade": "...", "email_principal": "...", "segmento": "...", "nome_contato": "...", "nome_razao": "..." },
  "dados_adicionais": { ${camposQualificacao.map(c => `"${c.key}": "..."`).join(", ")} },
  "campo_solicitado": "nome_do_campo ou null",
  "cadastro_completo": true|false,
  "agendamento": { "data_iso": "ISO-8601 com timezone ou null", "tem_horario": true|false, "duracao_min": 60, "titulo": "Call com ..." }
}

Regras de "intencao":
- "agendar_call": use quando o cliente demonstrar intenção de marcar uma call/reunião/agendamento/diagnóstico, mesmo que só mencione o dia (ex.: "podemos agendar quinta-feira", "quero uma call amanhã", "pode ser terça às 15h").
- "venda_fechada": use APENAS quando o cliente confirmar explicitamente a compra/contratação (ex.: "fechado, pode gerar o pedido", "quero fechar").
- "falar_humano": use APENAS quando o cliente pedir para falar com uma pessoa/vendedor humano.
- Nas demais situações (incluindo pedido de orçamento, dúvidas, respostas naturais, saudações), NUNCA use esses três valores — mantenha a qualificação normalmente.

Regras de "agendamento":
- Preencha SEMPRE que "intencao" for "agendar_call".
- Se o cliente informou dia + horário: data_iso = ISO completo com timezone (ex.: "2026-07-23T15:00:00-03:00"), tem_horario=true.
- Se o cliente informou apenas o dia (sem horário claro): data_iso = ISO desse dia às 09:00 no timezone, tem_horario=false. O sistema vai propor 2 horários livres da agenda.
- Se o cliente estiver ESCOLHENDO um horário sugerido em mensagem anterior (ex.: "o primeiro", "às 10h", "pode ser o segundo"), leia SUGESTOES_ANTERIORES abaixo e devolva o data_iso escolhido com tem_horario=true.
- NUNCA invente horários que não foram citados nem sugeridos.
- "titulo" curto (ex.: "Call comercial com <nome>"); duracao_min padrão = 60.

Inclua em "dados_adicionais" SOMENTE chaves listadas em PERGUNTAS DE QUALIFICAÇÃO DINÂMICAS, e apenas as que a mensagem do cliente realmente responde. Não invente valores.
${(Array.isArray(aiContexto?.agendamento_sugestoes) && aiContexto.agendamento_sugestoes.length)
  ? `\nSUGESTOES_ANTERIORES (o cliente pode estar escolhendo uma):\n${aiContexto.agendamento_sugestoes.map((s: any, i: number) => `${i + 1}) ${s.label_full || s.label} — data_iso=${s.start}`).join("\n")}\n`
  : ""}
${regrasBlock}`;

    // Chamar Anthropic Claude (chave mestra SaaS via ANTHROPIC_API_KEY)
    const userTurn = `Histórico da conversa:\n${historicoFormatado}\n\n---\nMensagens pendentes do cliente: "${mensagemAgregada}"\n\nContexto:\n- Estado: ${leadContext.conversation.state}\n- Primeira interação: ${primeiraInteracao}\n- Em coleta de dados: ${emColetaOrcamento}\n- Cadastro completo: ${cadastroCompleto}\n- Campos faltantes: ${camposFaltantes.join(", ") || "nenhum"}`;

    const aiResult = await callAnthropic({
      model: ((aiConfig as any).modelo_ia && String((aiConfig as any).modelo_ia).trim()) || ANTHROPIC_DEFAULT_MODEL,
      system: systemPrompt,
      messages: toAnthropicMessages([{ role: "user", content: userTurn }]),
      temperature: 0.7,
      max_tokens: maxTokens,
    });

    if (!aiResult.ok) {
      console.error("[orbit-ai-agent] Anthropic error:", aiResult.status, aiResult.error);
      if (aiResult.code === "rate_limit") {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResult.code === "credits") {
        return new Response(JSON.stringify({ error: "Payment required — verifique o saldo/uso da conta Anthropic." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResult.code === "missing_key" || aiResult.code === "auth") {
        return new Response(JSON.stringify({ error: aiResult.error }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(aiResult.error);
    }

    const content = aiResult.text || "";

    let parsed: any;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { mensagem: content };
    } catch {
      parsed = { mensagem: content };
    }

    let resposta = parsed.mensagem || content;
    console.log("[orbit-ai-agent] Resposta gerada:", resposta.substring(0, 100));

    // ── Validar dados extraídos antes de salvar ──
    const dadosValidados = parsed.dados_extraidos 
      ? validateExtractedData(parsed.dados_extraidos) 
      : {};

    // ── Calcular próximo estado da conversa ──
    // Handoff APENAS quando há sinal comercial real: agendamento de call, venda ou pedido explícito de humano.
    const intencaoNormalizada = String(parsed.intencao || "outro");
    const isCommercialSignal =
      intencaoNormalizada === "agendar_call" ||
      intencaoNormalizada === "venda_fechada" ||
      intencaoNormalizada === "falar_humano";

    // ── Auto-agendamento: se lead pediu agendar_call, tentar via Google Calendar antes do handoff ──
    let scheduleOutcome: {
      handled: boolean;
      created?: boolean;
      response_override?: string;
      suggestions?: any[];
      deal_id?: string | null;
      meeting_id?: string | null;
      not_connected?: boolean;
      error?: string;
    } = { handled: false };
    if (intencaoNormalizada === "agendar_call" && empresaId) {
      try {
        scheduleOutcome = await tryAutoScheduleMeeting(supabase, {
          empresaId,
          prospect,
          prospect_id,
          conversa_id,
          telefone,
          agendamento: parsed.agendamento || {},
        });
      } catch (schedErr) {
        console.error("[orbit-ai-agent] tryAutoScheduleMeeting erro:", schedErr);
        scheduleOutcome = { handled: false, error: (schedErr as Error).message };
      }
      if (scheduleOutcome.response_override) {
        resposta = scheduleOutcome.response_override;
      }
    }

    // Só fazer handoff se NÃO houve auto-agendamento resolvido pela IA (sugestão ou evento criado).
    const suppressHandoff = scheduleOutcome.handled === true;
    const isHandoff = isCommercialSignal && !suppressHandoff;
    const nextState = computeNextState(
      leadContext.conversation.state,
      intencaoNormalizada,
      parsed.cadastro_completo || false,
      false, // handoff será determinado abaixo
      msgClassification
    );

    // ── Notificação comercial: SOMENTE em sinal comercial real e sem auto-agendamento ──
    const alreadyNotified = aiContexto.commercial_notified === true;
    const shouldNotifyCommercial = isCommercialSignal && !alreadyNotified && !suppressHandoff;
    if (shouldNotifyCommercial) {
      console.log("[orbit-ai-agent] Sinal comercial detectado:", intencaoNormalizada, "— notificando responsável...");
      await notifyCommercialHumanDetected(supabase, {
        prospect,
        telefone_lead: telefone,
        mensagem: mensagemAgregada,
        classification: intencaoNormalizada,
        empresa_id: empresaId || null,
        isDemo,
      });
    }


    // Atualizar contexto da conversa com estado e classificação
    const novoContexto = {
      ...aiContexto,
      estado: isHandoff ? "handoff" : (scheduleOutcome.created ? "qualificado" : nextState),
      em_coleta_orcamento: parsed.iniciar_coleta_orcamento || emColetaOrcamento,
      campos_coletados: { ...camposColetados, ...dadosValidados },
      cadastro_completo: parsed.cadastro_completo,
      ultima_intencao: parsed.intencao,
      intro_already_sent: introAlreadySent || primeiraInteracao,
      // Campos de classificação
      message_classification: msgClassification,
      human_detected: aiContexto.human_detected || msgClassification === "human_probable",
      auto_reply_detected: aiContexto.auto_reply_detected || msgClassification === "auto_reply",
      commercial_notified: alreadyNotified || shouldNotifyCommercial,
      first_human_response_at: (!aiContexto.first_human_response_at && msgClassification === "human_probable")
        ? new Date().toISOString()
        : aiContexto.first_human_response_at || null,
      // Sugestões de horário pendentes para a próxima resposta do lead
      agendamento_sugestoes: scheduleOutcome.suggestions && scheduleOutcome.suggestions.length
        ? scheduleOutcome.suggestions
        : (scheduleOutcome.created ? [] : (aiContexto.agendamento_sugestoes ?? [])),
      agendamento_ultimo_meeting_id: scheduleOutcome.meeting_id || aiContexto.agendamento_ultimo_meeting_id || null,
    };

    await supabase
      .from("orbit_conversas")
      .update({ ai_contexto: novoContexto })
      .eq("id", conversa_id);

    // Atualizar prospect com dados validados (nunca sobrescrever dados confirmados)
    if (Object.keys(dadosValidados).length > 0) {
      // Filtrar: só atualizar campos que estão vazios no prospect
      const updateData: Record<string, any> = {};
      for (const [campo, valor] of Object.entries(dadosValidados)) {
        const currentValue = prospect?.[campo];
        if (!currentValue || currentValue === "" || currentValue.startsWith("WhatsApp ")) {
          updateData[campo] = valor;
        } else {
          console.log(`[orbit-ai-agent] Campo ${campo} já preenchido (${currentValue}), não sobrescrevendo com: ${valor}`);
        }
      }

      if (Object.keys(updateData).length > 0) {
        await supabase
          .from("orbit_prospects")
          .update(updateData)
          .eq("id", prospect_id);
        console.log("[orbit-ai-agent] Prospect atualizado com:", Object.keys(updateData));
      }
    }

    // ── E2.7.C2: merge JSONB dados_adicionais (qualificação dinâmica) ──
    if (parsed.dados_adicionais && typeof parsed.dados_adicionais === "object") {
      const allowedKeys = new Set(camposQualificacao.map((c) => c.key));
      const novos: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(parsed.dados_adicionais as Record<string, unknown>)) {
        if (!allowedKeys.has(k)) continue;
        if (v === null || v === undefined) continue;
        const sv = String(v).trim();
        if (!sv) continue;
        const existing = dadosAdicionais[k];
        if (existing && String(existing).trim() !== "") continue; // não sobrescrever
        novos[k] = sv;
      }
      if (Object.keys(novos).length > 0) {
        const merged = { ...(dadosAdicionais as Record<string, unknown>), ...novos };
        const { error: daErr } = await supabase
          .from("orbit_prospects")
          .update({ dados_adicionais: merged })
          .eq("id", prospect_id);
        if (daErr) {
          console.warn("[orbit-ai-agent] dados_adicionais update error:", daErr.message);
        } else {
          console.log("[orbit-ai-agent] dados_adicionais merged:", Object.keys(novos));
        }
      }
    }


    // Distribuir para vendedor — SEMPRE escopado à empresa do prospect.
    let vendedorAtribuido: string | null = null;

    if (isHandoff) {
      if (prospect?.responsavel_id) {
        // Só usa o responsável atual se for da mesma empresa
        const { data: respProfile } = await supabase
          .from("profiles")
          .select("empresa_id")
          .eq("id", prospect.responsavel_id)
          .maybeSingle();
        if (!empresaId || !respProfile?.empresa_id || respProfile.empresa_id === empresaId) {
          vendedorAtribuido = prospect.responsavel_id;
          console.log("[orbit-ai-agent] Usando responsável existente:", vendedorAtribuido);
        } else {
          console.warn("[orbit-ai-agent] Responsável atual é de outra empresa — ignorando", { responsavel: prospect.responsavel_id, empresaId });
        }
      }

      if (!vendedorAtribuido) {
        let distQuery = supabase
          .from("orbit_distribuicao_config")
          .select("vendedor_id")
          .eq("ativo", true)
          .order("ultima_atribuicao", { ascending: true, nullsFirst: true })
          .order("ordem_fila", { ascending: true })
          .limit(1);
        if (empresaId) distQuery = distQuery.eq("empresa_id", empresaId);
        const { data: proximoVendedor } = await distQuery.maybeSingle();

        if (proximoVendedor) {
          vendedorAtribuido = proximoVendedor.vendedor_id;
          await supabase
            .from("orbit_distribuicao_config")
            .update({
              ultima_atribuicao: new Date().toISOString(),
              total_atribuicoes: (await supabase.rpc("increment_atribuicoes", { vendedor: proximoVendedor.vendedor_id })),
            })
            .eq("vendedor_id", proximoVendedor.vendedor_id);
          console.log("[orbit-ai-agent] Lead distribuído via round-robin:", proximoVendedor.vendedor_id);
        } else if (empresaId) {
          // Fallback: primeiro admin/usuário da MESMA empresa
          const { data: candidato } = await supabase
            .from("profiles")
            .select("id")
            .eq("empresa_id", empresaId)
            .limit(1)
            .maybeSingle();
          vendedorAtribuido = candidato?.id || null;
          if (vendedorAtribuido) console.log("[orbit-ai-agent] Fallback dentro da empresa:", vendedorAtribuido);
          else console.warn("[orbit-ai-agent] Nenhum vendedor disponível na empresa para handoff", { empresaId });
        }
      }

      if (vendedorAtribuido) {
        await supabase
          .from("orbit_prospects")
          .update({
            responsavel_id: vendedorAtribuido,
            status_qualificacao: "qualificado",
          })
          .eq("id", prospect_id);
      }

      // ── Registrar lead no funil (idempotente) ──
      try {
        const { data: dealId, error: dealErr } = await supabase.rpc(
          "ensure_deal_for_prospect",
          { _prospect_id: prospect_id },
        );
        if (dealErr) {
          console.error("[orbit-ai-agent] ensure_deal_for_prospect erro:", dealErr);
        } else if (dealId) {
          console.log("[orbit-ai-agent] Deal garantido no funil:", dealId);
          await supabase.from("prospect_events").insert({
            empresa_id: empresaId,
            prospect_id,
            event_type: "deal_created_by_ai",
            titulo: "Lead movido para o funil pela IA",
            descricao: "Oportunidade criada automaticamente após qualificação",
          });
        }
      } catch (e) {
        console.error("[orbit-ai-agent] Falha ao registrar deal no funil:", e);
      }

      // ── Emitir evento prospect_qualified para o Motor de Fluxos ──
      try {
        const dedupeKey = `prospect_qualified:${prospect_id}`;
        const { error: evErr } = await supabase.from("orbit_flow_events").insert({
          empresa_id: empresaId,
          event_type: "prospect_qualified",
          entity_type: "prospect",
          entity_id: prospect_id,
          dedupe_key: dedupeKey,
          payload: {
            prospect_id,
            conversa_id,
            vendedor_id: vendedorAtribuido,
            origem: prospect?.origem_lead ?? prospect?.origem_contato ?? null,
            segmento: prospect?.segmento ?? null,
            source: "orbit-ai-agent",
          },
        });
        if (evErr && !String(evErr.message).toLowerCase().includes("duplicate")) {
          console.error("[orbit-ai-agent] flow_events insert error:", evErr);
        } else {
          console.log("[orbit-ai-agent] flow_event prospect_qualified emitido", { prospect_id });
          // best-effort: kick dispatcher imediatamente
          const fnBase = `${Deno.env.get("SUPABASE_URL")}/functions/v1`;
          fetch(`${fnBase}/orbit-flow-dispatcher`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({ trigger: "ai-agent", prospect_id }),
          }).catch((e) => console.warn("[orbit-ai-agent] dispatcher invoke falhou:", e));
        }
      } catch (e) {
        console.error("[orbit-ai-agent] Falha ao emitir flow_event:", e);
      }
    }


    // ── Handoff: notificar vendedor via WhatsApp ──
    if (isHandoff && vendedorAtribuido) {
      await handleSellerHandoff(supabase, {
        conversa_id,
        prospect_id,
        prospect,
        vendedor_id: vendedorAtribuido,
        empresa_id: empresaId,
        mensagem_lead: mensagem,
        telefone_lead: telefone,
        isDemo,
      });
    }

    // ── Audio library: enviar clip pré-gravado se disponível ──
    if (!isDemo && empresaId) {
      const audioContexto = primeiraInteracao
        ? "apresentacao"
        : INTENCAO_TO_AUDIO_CONTEXTO[parsed.intencao || ""] || null;

      if (audioContexto) {
        const audioClip = await getAudioClip(supabase, empresaId, audioContexto);
        if (audioClip) {
          console.log("[orbit-ai-agent] Clip de biblioteca encontrado:", audioClip.id, "contexto:", audioContexto);
          await sendWhatsAppAudio(supabase, telefone, audioClip.storage_path || audioClip.url, conversa_id, empresaId);
          await supabase
            .from("orbit_audio_library")
            .update({ uso_count: audioClip.uso_count + 1 })
            .eq("id", audioClip.id);
          return new Response(JSON.stringify({ ok: true, parsed, state: novoContexto.estado, audio_sent: true, simulated: false }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    // Enviar resposta via WhatsApp (fallback: texto)
    await sendAIResponse(supabase, telefone, resposta, conversa_id, isDemo, empresaId, aiConfig);

    return new Response(JSON.stringify({ ok: true, resposta, parsed, state: novoContexto.estado, simulated: isDemo }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
    } finally {
      // ── UNLOCK: sempre resetar ai_processing (best effort) ──
      try {
        await supabase
          .from("orbit_conversas")
          .update({ ai_processing: false })
          .eq("id", conversa_id);
        console.log("[orbit-ai-agent] Lock liberado para conversa:", conversa_id);
      } catch (unlockErr) {
        console.error("[orbit-ai-agent] Falha ao liberar lock no finally:", unlockErr);
      }
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[orbit-ai-agent] Erro:", message);
    // Cleanup usando conversa_id já capturado no escopo externo (req.json foi consumido)
    if (conversaIdForCleanup) {
      try {
        const cleanupClient = supabaseForCleanup ?? createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
        );
        await (cleanupClient as any)
          .from("orbit_conversas")
          .update({ ai_processing: false })
          .eq("id", conversaIdForCleanup);
        console.log("[orbit-ai-agent] Lock liberado no catch para:", conversaIdForCleanup);
      } catch (cleanupErr) {
        console.error("[orbit-ai-agent] Falha no cleanup do lock:", cleanupErr);
      }
    }
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ── Helper functions ──

interface HandoffParams {
  conversa_id: string;
  prospect_id: string;
  prospect: any;
  vendedor_id: string;
  empresa_id: string | null | undefined;
  mensagem_lead: string;
  telefone_lead: string;
  isDemo: boolean;
}

async function handleSellerHandoff(supabase: any, params: HandoffParams) {
  const { conversa_id, prospect_id, prospect, vendedor_id, empresa_id, mensagem_lead, telefone_lead, isDemo } = params;

  try {
    const { data: existingHandoff } = await supabase
      .from("orbit_handoffs")
      .select("id")
      .eq("conversa_id", conversa_id)
      .in("status", ["sent", "pending"])
      .maybeSingle();

    if (existingHandoff) {
      console.log("[orbit-ai-agent] Handoff já enviado para esta conversa:", conversa_id);
      return;
    }

    const { data: vendedorProfile } = await supabase
      .from("profiles")
      .select("id, nome, telefone, cargo")
      .eq("id", vendedor_id)
      .single();

    const { data: vendedorPe } = await supabase
      .from("pe_users")
      .select("whatsapp, phone")
      .eq("id", vendedor_id)
      .maybeSingle();

    const vendedorWhatsapp = vendedorPe?.whatsapp || vendedorPe?.phone || vendedorProfile?.telefone;
    if (!vendedorWhatsapp) {
      console.log("[orbit-ai-agent] Vendedor sem WhatsApp/telefone, não pode enviar handoff");
      await supabase.from("orbit_handoffs").insert({
        empresa_id,
        conversa_id,
        prospect_id,
        vendedor_id,
        resumo: "Vendedor sem WhatsApp cadastrado",
        status: "failed",
      });
      return;
    }

    let empresaNome = "";
    if (empresa_id) {
      const { data: empresa } = await supabase.from("orbit_empresas").select("nome").eq("id", empresa_id).single();
      empresaNome = empresa?.nome || "";
    }

    const leadPhone = telefone_lead?.replace(/\D/g, "") || "";
    const vendedorNome = vendedorProfile?.nome || "Vendedor";
    const now = new Date();
    const dataHora = now.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

    const msgIntro = empresaNome
      ? `Olá, aqui é ${vendedorNome} da ${empresaNome}. Vi seu contato com nosso atendimento e estou assumindo seu caso por aqui.`
      : `Olá, aqui é ${vendedorNome}. Vi seu contato com nosso atendimento e estou assumindo seu caso por aqui.`;

    const waLink = `https://wa.me/${leadPhone}?text=${encodeURIComponent(msgIntro)}`;

    const resumo = [
      `🔔 *Novo Lead Qualificado pela IA*`,
      ``,
      `👤 Nome: ${prospect?.nome_razao || "Não informado"}`,
      prospect?.nome_fantasia ? `🏢 Empresa: ${prospect.nome_fantasia}` : null,
      `💬 WhatsApp: ${telefone_lead || "Não informado"}`,
      prospect?.cidade ? `📍 Cidade: ${prospect.cidade}${prospect.estado ? `/${prospect.estado}` : ""}` : null,
      prospect?.segmento ? `🏷️ Segmento: ${prospect.segmento}` : null,
      ``,
      prospect?.email_principal ? `📧 Email: ${prospect.email_principal}` : null,
      `💬 Última msg: "${mensagem_lead?.substring(0, 200)}"`,
      `🕐 ${dataHora}`,
      ``,
      `👉 Entrar em contato:`,
      waLink,
    ].filter(Boolean).join("\n");

    const { data: handoff } = await supabase.from("orbit_handoffs").insert({
      empresa_id,
      conversa_id,
      prospect_id,
      vendedor_id,
      resumo,
      status: "pending",
    }).select().single();

    const vendedorPhone = vendedorWhatsapp.replace(/\D/g, "");

    if (isDemo) {
      console.log("[orbit-ai-agent] Demo mode — handoff simulado para vendedor:", vendedorPhone);
      await supabase.from("orbit_handoffs").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", handoff.id);
    } else {
      const zapiConfig = await getOrbitZapiRuntimeConfig(supabase, empresa_id);
      const handoffBlockReason = getOrbitZapiRealSendBlockReason(zapiConfig);
      if (handoffBlockReason) {
        console.warn("[orbit-ai-agent] Handoff bloqueado:", handoffBlockReason);
        await supabase.from("orbit_handoffs").update({ status: "failed" }).eq("id", handoff.id);
      } else if (zapiConfig?.instance_id && zapiConfig?.token) {
        const response = await fetch(
          `https://api.z-api.io/instances/${zapiConfig.instance_id}/token/${zapiConfig.token}/send-text`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Client-Token": zapiConfig.client_token || "",
            },
            body: JSON.stringify({ phone: vendedorPhone, message: resumo }),
          }
        );

        const result = await response.json();
        console.log("[orbit-ai-agent] Handoff WhatsApp enviado:", { ok: response.ok, messageId: result.messageId });

        await supabase.from("orbit_handoffs").update({
          status: response.ok ? "sent" : "failed",
          sent_at: response.ok ? new Date().toISOString() : null,
        }).eq("id", handoff.id);
      } else {
        console.log("[orbit-ai-agent] Z-API não configurado para handoff");
        await supabase.from("orbit_handoffs").update({ status: "failed" }).eq("id", handoff.id);
      }
    }

    await supabase.from("orbit_conversas").update({ handoff_sent_at: new Date().toISOString() }).eq("id", conversa_id);
    console.log("[orbit-ai-agent] Handoff completo para conversa:", conversa_id);

  } catch (error) {
    console.error("[orbit-ai-agent] Erro no handoff:", error);
  }
}

async function sendWhatsAppMessage(supabase: any, telefone: string, mensagem: string, conversa_id: string, isDemo: boolean, empresaId?: string | null) {
  try {
    if (isDemo) {
      console.log("[orbit-ai-agent] Demo mode — simulando envio");
      await supabase.from("orbit_mensagens").insert({
        conversa_id,
        direcao: "OUT",
        mensagem,
        canal: "whatsapp",
        status: "simulated",
        provider_message_id: null,
        empresa_id: empresaId,
      });

      await supabase
        .from("orbit_conversas")
        .update({
          ultima_mensagem_at: new Date().toISOString(),
          ultima_mensagem_preview: mensagem.substring(0, 100),
        })
        .eq("id", conversa_id);
      return;
    }

    // ── Adapter routing (Fase 3): ai_reply enfileira quando outbox_adapter_enabled=true ──
    if (empresaId && await isAdapterEnabled(supabase, empresaId)) {
      // Latest IN para dedupe estável
      const { data: lastIn } = await supabase
        .from("orbit_mensagens")
        .select("id")
        .eq("conversa_id", conversa_id)
        .eq("direcao", "IN")
        .order("timestamp", { ascending: false })
        .limit(1)
        .maybeSingle();
      const inboundId = (lastIn as any)?.id ?? conversa_id;
      const { data: conv } = await supabase
        .from("orbit_conversas")
        .select("prospect_id")
        .eq("id", conversa_id)
        .maybeSingle();
      // Pré-cria linha "queued" para linkar orbit_message_id.
      const { data: novaTxt } = await supabase
        .from("orbit_mensagens")
        .insert({
          conversa_id,
          direcao: "OUT",
          mensagem,
          canal: "whatsapp",
          status: "queued",
          empresa_id: empresaId,
        })
        .select("id")
        .single();
      const routed = await enqueueOutbox(supabase, {
        empresa_id: empresaId,
        conversa_id,
        prospect_id: (conv as any)?.prospect_id ?? null,
        source_type: "ai_reply",
        inbound_message_id: `${inboundId}:text`,
        source_id: inboundId,
        payload_type: "text",
        payload: { mensagem },
        metadata: { orbit_message_id: novaTxt?.id ?? null },
      });
      if (!routed.enqueued && routed.reason === "duplicate" && novaTxt?.id) {
        await supabase.from("orbit_mensagens").delete().eq("id", novaTxt.id);
      }
      console.log("[orbit-ai-agent] Adapter routed ai_reply:", routed);
      return;
    }


    const zapiConfig = await getOrbitZapiRuntimeConfig(supabase, empresaId);
    const replyBlockReason = getOrbitZapiRealSendBlockReason(zapiConfig);

    if (replyBlockReason) {
      console.warn("[orbit-ai-agent] Resposta automática bloqueada:", replyBlockReason);
      await supabase.from("orbit_mensagens").insert({
        conversa_id,
        direcao: "OUT",
        mensagem,
        canal: "whatsapp",
        status: "falhou",
        erro: replyBlockReason,
        empresa_id: empresaId,
      });
    } else if (zapiConfig?.instance_id && zapiConfig?.token) {
      const response = await fetch(
        `https://api.z-api.io/instances/${zapiConfig.instance_id}/token/${zapiConfig.token}/send-text`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Client-Token": zapiConfig.client_token || "",
          },
          body: JSON.stringify({
            phone: telefone,
            message: mensagem,
          }),
        }
      );

      const result = await response.json();
      console.log("[orbit-ai-agent] WhatsApp enviado:", result);

      await supabase.from("orbit_mensagens").insert({
        conversa_id,
        direcao: "OUT",
        mensagem,
        canal: "whatsapp",
        status: response.ok ? "enviada" : "falhou",
        provider_message_id: result.messageId,
        empresa_id: empresaId,
      });

      await supabase
        .from("orbit_conversas")
        .update({
          ultima_mensagem_at: new Date().toISOString(),
          ultima_mensagem_preview: mensagem.substring(0, 100),
        })
        .eq("id", conversa_id);
    } else {
      console.log("[orbit-ai-agent] Z-API não configurado, salvando apenas no banco");
      
      await supabase.from("orbit_mensagens").insert({
        conversa_id,
        direcao: "OUT",
        mensagem,
        canal: "whatsapp",
        status: "pendente",
        empresa_id: empresaId,
      });
    }
  } catch (error) {
    console.error("[orbit-ai-agent] Erro ao enviar WhatsApp:", error);
  }
}

// ── TTS: gerar áudio via ElevenLabs ──
async function generateTTS(texto: string, ttsVoiceId: string, ttsApiKey: string): Promise<ArrayBuffer> {
  const textoTruncado = texto.length > 300 ? texto.substring(0, 297) + "..." : texto;

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${ttsVoiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": ttsApiKey,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
      },
      body: JSON.stringify({
        text: textoTruncado,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    }
  );

  if (!res.ok) {
    const errText = await res.text().catch(() => res.status.toString());
    throw new Error(`ElevenLabs TTS error ${res.status}: ${errText}`);
  }

  return res.arrayBuffer();
}

// ── sendAIResponse: envia resposta como texto e/ou áudio TTS ──
async function sendAIResponse(
  supabase: any,
  telefone: string,
  texto: string,
  conversa_id: string,
  isDemo: boolean,
  empresaId: string | null | undefined,
  aiConfig: any
) {
  const ttsAtivo = aiConfig?.tts_ativo === true;
  const ttsApiKey = aiConfig?.tts_api_key;
  const ttsVoiceId = aiConfig?.tts_voice_id || "EXAVITQu4vr4xnSDxMaL";
  const ttsModo = aiConfig?.tts_modo || "texto";

  if (ttsAtivo && ttsApiKey && ttsModo !== "texto") {
    try {
      console.log("[orbit-ai-agent] TTS ativo, gerando áudio via ElevenLabs...");

      const audioBuffer = await generateTTS(texto, ttsVoiceId, ttsApiKey);

      const path = `tts/${empresaId}/${conversa_id}/${Date.now()}.mp3`;
      const { error: uploadError } = await supabase.storage
        .from("orbit-media")
        .upload(path, audioBuffer, {
          contentType: "audio/mpeg",
          upsert: false,
        });

      if (uploadError) {
        console.error("[orbit-ai-agent] Erro upload TTS:", uploadError.message);
        await sendWhatsAppMessage(supabase, telefone, texto, conversa_id, isDemo, empresaId);
        return;
      }

      // Bucket privado — passamos o storage_path direto (sem getPublicUrl).
      console.log("[orbit-ai-agent] Áudio TTS gerado em:", path);

      await sendWhatsAppAudio(supabase, telefone, path, conversa_id, empresaId);

      if (ttsModo === "ambos") {
        await sendWhatsAppMessage(supabase, telefone, texto, conversa_id, isDemo, empresaId);
      }

      return;
    } catch (ttsError) {
      console.error("[orbit-ai-agent] Erro TTS, fallback para texto:", ttsError);
      await sendWhatsAppMessage(supabase, telefone, texto, conversa_id, isDemo, empresaId);
      return;
    }
  }

  await sendWhatsAppMessage(supabase, telefone, texto, conversa_id, isDemo, empresaId);
}

// ── CHATBOT FLOWS: processar fluxo condicional ──
async function processChatbotFlow(
  supabase: any,
  ctx: {
    conversa: any;
    conversa_id: string;
    mensagem: string;
    telefone: string;
    empresaId: string | null | undefined;
    isDemo: boolean;
  }
): Promise<boolean> {
  const { conversa, conversa_id, mensagem, telefone, empresaId, isDemo } = ctx;
  const msgNorm = mensagem.toLowerCase().trim();

  // ── Caso 1: há fluxo ativo aguardando resposta ──
  if (conversa?.chatbot_flow_id && conversa?.chatbot_aguardando) {
    const { data: branches } = await supabase
      .from("orbit_chatbot_flow_branches")
      .select("*")
      .eq("flow_id", conversa.chatbot_flow_id)
      .order("ordem", { ascending: true });

    if (branches && branches.length > 0) {
      let matched: any = null;
      for (const branch of branches) {
        if (!branch.keywords || branch.keywords.length === 0) continue;
        const hit = branch.keywords.some((kw: string) => msgNorm.includes(kw.toLowerCase()));
        if (hit) { matched = branch; break; }
      }
      if (!matched) {
        matched = branches.find((b: any) => !b.keywords || b.keywords.length === 0) ?? null;
      }

      if (matched) {
        console.log("[orbit-ai-agent] Chatbot flow branch matched:", matched.nome);

        if (matched.resposta_texto) {
          await sendAIResponse(supabase, telefone, matched.resposta_texto, conversa_id, isDemo, empresaId, null);
        }
        if (matched.resposta_audio_id) {
          const { data: clip } = await supabase
            .from("orbit_audio_library")
            .select("url, storage_path")
            .eq("id", matched.resposta_audio_id)
            .single();
          const clipSource = clip?.storage_path || clip?.url;
          if (clipSource) {
            await sendWhatsAppAudio(supabase, telefone, clipSource, conversa_id, empresaId);
          }
        }

        const updates: any = {};
        if (matched.encerrar_fluxo) {
          updates.chatbot_flow_id = null;
          updates.chatbot_aguardando = false;
        }
        if (Object.keys(updates).length > 0) {
          await supabase.from("orbit_conversas").update(updates).eq("id", conversa_id);
        }

        return true;
      }
    }
  }

  // ── Caso 2: verificar se a mensagem dispara um novo fluxo ──
  if (!empresaId) return false;
  const { data: flows } = await supabase
    .from("orbit_chatbot_flows")
    .select("*")
    .eq("empresa_id", empresaId)
    .eq("ativo", true)
    .order("prioridade", { ascending: false });

  if (!flows || flows.length === 0) return false;

  for (const flow of flows) {
    if (!flow.trigger_keywords || flow.trigger_keywords.length === 0) continue;
    const hit = flow.trigger_keywords.some((kw: string) => {
      const kwNorm = kw.toLowerCase();
      return flow.trigger_modo === "exact"
        ? msgNorm === kwNorm
        : msgNorm.includes(kwNorm);
    });
    if (!hit) continue;

    console.log("[orbit-ai-agent] Chatbot flow triggered:", flow.nome);

    if (flow.passo1_texto) {
      await sendAIResponse(supabase, telefone, flow.passo1_texto, conversa_id, isDemo, empresaId, null);
    }
    if (flow.passo1_audio_id) {
      const { data: clip } = await supabase
        .from("orbit_audio_library")
        .select("url, storage_path")
        .eq("id", flow.passo1_audio_id)
        .single();
      const clipSource = clip?.storage_path || clip?.url;
      if (clipSource) {
        await sendWhatsAppAudio(supabase, telefone, clipSource, conversa_id, empresaId);
      }
    }

    if (flow.passo1_aguardar_resposta) {
      await supabase
        .from("orbit_conversas")
        .update({ chatbot_flow_id: flow.id, chatbot_aguardando: true })
        .eq("id", conversa_id);
    }

    await supabase
      .from("orbit_chatbot_flows")
      .update({ uso_count: flow.uso_count + 1 })
      .eq("id", flow.id);

    return true;
  }

  return false;
}

// ── Auto-agendamento via Google Calendar ──
function getTzOffsetMinutes(tz: string, date: Date): number {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hour12: false,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    const parts = dtf.formatToParts(date).reduce((acc: any, p) => { if (p.type !== "literal") acc[p.type] = p.value; return acc; }, {});
    const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
    return (asUTC - date.getTime()) / 60000;
  } catch {
    return -180; // fallback UTC-3
  }
}

function isoWithOffset(dayStr: string, hour: number, minute: number, tz: string): string {
  const probe = new Date(`${dayStr}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`);
  const offMin = getTzOffsetMinutes(tz, probe);
  const utcMs = probe.getTime() - offMin * 60000;
  return new Date(utcMs).toISOString();
}

export interface AutoScheduleParams {
  empresaId: string;
  prospect: any;
  prospect_id: string;
  conversa_id: string;
  telefone: string;
  agendamento: any;
}

export interface AutoScheduleDeps {
  getTokenForEmpresa: typeof getTokenForEmpresa;
  ensureFreshAccessToken: typeof ensureFreshAccessToken;
  checkAvailability: typeof checkAvailability;
  createCalendarEvent: typeof createCalendarEvent;
  deleteCalendarEvent: (accessToken: string, calendarId: string, eventId: string) => Promise<void>;
}

async function defaultDeleteCalendarEvent(accessToken: string, calendarId: string, eventId: string): Promise<void> {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`;
  const r = await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } });
  // 404/410 = já não existe; considerar sucesso silencioso
  if (!r.ok && r.status !== 404 && r.status !== 410) {
    console.warn(`[orbit-ai-agent] deleteCalendarEvent status=${r.status}`);
  }
}

export async function tryAutoScheduleMeeting(
  supabase: any,
  params: AutoScheduleParams,
  depsIn?: Partial<AutoScheduleDeps>,
): Promise<{
  handled: boolean;
  created?: boolean;
  response_override?: string;
  suggestions?: any[];
  deal_id?: string | null;
  meeting_id?: string | null;
  not_connected?: boolean;
  error?: string;
}> {
  const deps: AutoScheduleDeps = {
    getTokenForEmpresa: depsIn?.getTokenForEmpresa ?? getTokenForEmpresa,
    ensureFreshAccessToken: depsIn?.ensureFreshAccessToken ?? ensureFreshAccessToken,
    checkAvailability: depsIn?.checkAvailability ?? checkAvailability,
    createCalendarEvent: depsIn?.createCalendarEvent ?? createCalendarEvent,
    deleteCalendarEvent: depsIn?.deleteCalendarEvent ?? defaultDeleteCalendarEvent,
  };

  const ag = params.agendamento || {};
  const token = await deps.getTokenForEmpresa(params.empresaId).catch(() => null);
  if (!token) {
    console.log("[orbit-ai-agent] Google Calendar não conectado — fallback para handoff manual", { empresaId: params.empresaId });
    return { handled: false, not_connected: true };
  }
  if (!ag.data_iso) {
    console.log("[orbit-ai-agent] AI marcou agendar_call sem data_iso — fallback para handoff manual");
    return { handled: false, error: "sem data_iso" };
  }

  const startDate = new Date(ag.data_iso);
  if (isNaN(startDate.getTime())) {
    return { handled: false, error: "data_iso inválida" };
  }

  const tz = token.timezone || "America/Sao_Paulo";
  const calId = token.calendar_id;
  const duracaoMin = Math.max(15, Math.min(240, Number(ag.duracao_min) || 60));
  const titulo = String(ag.titulo || `Call com ${params.prospect?.nome_razao || params.prospect?.nome_fantasia || "lead"}`).slice(0, 200);
  const temHorario = ag.tem_horario === true;

  const dayStr = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(startDate);

  // ── Guardrail anti-passado: rejeitar data/hora no passado ANTES de qualquer OAuth/Google/deal/insert ──
  const now = new Date();
  if (temHorario) {
    // Horário explícito: exigir > agora + 5 min
    if (startDate.getTime() <= now.getTime() + 5 * 60 * 1000) {
      console.warn("[orbit-ai-agent] agendamento rejeitado (passado/imediato):", ag.data_iso);
      return {
        handled: true,
        created: false,
        response_override: "Essa data já passou. Você quis dizer a próxima segunda-feira? Me confirme a data e o horário, por favor.",
      };
    }
  } else {
    // Dia sem horário: rejeitar se o dia local da agenda já passou
    const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    if (dayStr < todayStr) {
      console.warn("[orbit-ai-agent] agendamento rejeitado (dia passado):", ag.data_iso, "dayStr=", dayStr, "todayStr=", todayStr);
      return {
        handled: true,
        created: false,
        response_override: "Essa data já passou. Você quis dizer a próxima semana? Me confirme a data (e, se possível, o horário), por favor.",
      };
    }
  }

  // ── Ramo: dia sem horário — sugerir 2 slots livres (precisa de token + freeBusy) ──
  if (!temHorario) {
    const access = await deps.ensureFreshAccessToken(token);
    const timeMin = isoWithOffset(dayStr, 9, 0, tz);
    const timeMax = isoWithOffset(dayStr, 18, 0, tz);
    let busy: { start: string; end: string }[] = [];
    try {
      const av = await deps.checkAvailability(access, calId, timeMin, timeMax, tz);
      busy = av.busy || [];
    } catch (e) {
      console.error("[orbit-ai-agent] freeBusy falhou:", e);
      return { handled: false, error: "freeBusy falhou" };
    }

    const durMs = duracaoMin * 60 * 1000;
    const stepMs = 30 * 60 * 1000;
    const endMs = new Date(timeMax).getTime();
    const suggestions: { start: string; end: string; label: string; label_full: string }[] = [];
    let cursor = new Date(timeMin).getTime();
    while (cursor + durMs <= endMs && suggestions.length < 2) {
      const slotEnd = cursor + durMs;
      const overlap = busy.some((b) => {
        const bs = new Date(b.start).getTime();
        const be = new Date(b.end).getTime();
        return cursor < be && slotEnd > bs;
      });
      if (!overlap) {
        const hhmm = new Intl.DateTimeFormat("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit" }).format(new Date(cursor));
        const dayFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: tz, weekday: "long", day: "2-digit", month: "long" }).format(new Date(cursor));
        suggestions.push({
          start: new Date(cursor).toISOString(),
          end: new Date(slotEnd).toISOString(),
          label: hhmm,
          label_full: `${dayFmt} às ${hhmm}`,
        });
      }
      cursor += stepMs;
    }

    if (!suggestions.length) {
      const dayFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: tz, weekday: "long", day: "2-digit", month: "long" }).format(startDate);
      return {
        handled: true,
        response_override: `Infelizmente não tenho horários livres em ${dayFmt}. Pode me passar outra data?`,
        suggestions: [],
      };
    }

    const dayFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: tz, weekday: "long", day: "2-digit", month: "long" }).format(new Date(suggestions[0].start));
    const listStr = suggestions.map((s) => s.label).join(" ou ");
    return {
      handled: true,
      response_override: `Perfeito! Tenho ${listStr} livres na ${dayFmt}. Qual prefere?`,
      suggestions,
    };
  }

  // ── Ramo: data + horário ──
  const startISO = startDate.toISOString();
  const endISO = new Date(startDate.getTime() + duracaoMin * 60 * 1000).toISOString();

  // 1) Dedupe ANTES de qualquer chamada OAuth/Google: já existe meeting scheduled/rescheduled
  //    para (empresa, prospect, scheduled_at)? Se sim, reutiliza sem tocar OAuth/Google, deal,
  //    evento de fluxo ou handoff.
  try {
    const { data: existing } = await supabase
      .from("orbit_meetings")
      .select("id, meeting_url, scheduled_at, status, metadata")
      .eq("empresa_id", params.empresaId)
      .eq("prospect_id", params.prospect_id)
      .eq("scheduled_at", startISO)
      .in("status", ["scheduled", "rescheduled"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing?.id) {
      console.log("[orbit-ai-agent] Meeting já existe para esse horário — reutilizando sem tocar OAuth/Google:", existing.id);
      const humanTime = new Intl.DateTimeFormat("pt-BR", {
        timeZone: tz, weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit",
      }).format(startDate);
      const url = existing.meeting_url;
      return {
        handled: true,
        created: false,
        response_override: url
          ? `Sua call já está agendada para ${humanTime}. Link: ${url}. Até lá!`
          : `Sua call já está agendada para ${humanTime}. Até lá!`,
        meeting_id: existing.id,
      };
    }
  } catch (e) {
    console.warn("[orbit-ai-agent] dedupe orbit_meetings falhou (segue fluxo):", (e as Error).message);
  }

  // A partir daqui vamos criar — só agora tocamos OAuth.
  const access = await deps.ensureFreshAccessToken(token);

  // 2) ensure_deal_for_prospect ANTES de criar evento — abortar se falhar
  let dealId: string | null = null;
  try {
    const { data: dId, error: dealErr } = await supabase.rpc("ensure_deal_for_prospect", { _prospect_id: params.prospect_id });
    if (dealErr) throw dealErr;
    dealId = (dId as string) ?? null;
  } catch (e) {
    console.error("[orbit-ai-agent] ensure_deal_for_prospect falhou — abortando agendamento:", (e as Error).message);
    return { handled: false, error: "ensure_deal_for_prospect falhou" };
  }
  if (!dealId) {
    console.error("[orbit-ai-agent] ensure_deal_for_prospect não retornou deal_id — abortando agendamento");
    return { handled: false, error: "ensure_deal_for_prospect sem deal_id" };
  }

  // 3) Reconferir freeBusy EXATO para [startISO, endISO] imediatamente antes de criar
  try {
    const av = await deps.checkAvailability(access, calId, startISO, endISO, tz);
    const busy = av.busy || [];
    const startMs = startDate.getTime();
    const endMs = new Date(endISO).getTime();
    const conflito = busy.some((b) => {
      const bs = new Date(b.start).getTime();
      const be = new Date(b.end).getTime();
      return startMs < be && endMs > bs;
    });
    if (conflito) {
      const humanTime = new Intl.DateTimeFormat("pt-BR", {
        timeZone: tz, weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit",
      }).format(startDate);
      return {
        handled: true,
        created: false,
        response_override: `Esse horário (${humanTime}) acabou de ficar ocupado na minha agenda. Pode me sugerir outro?`,
        deal_id: dealId,
      };
    }
  } catch (e) {
    console.error("[orbit-ai-agent] freeBusy exato falhou:", (e as Error).message);
    return { handled: false, error: "freeBusy exato falhou", deal_id: dealId };
  }


  // 4) Criar evento
  const attendees: string[] = [];
  if (params.prospect?.email_principal && /@/.test(params.prospect.email_principal)) {
    attendees.push(params.prospect.email_principal);
  }
  let event: any = null;
  try {
    event = await deps.createCalendarEvent(access, calId, {
      summary: titulo,
      description: `Call agendada automaticamente pelo agente Orbit.\nLead: ${params.prospect?.nome_razao || "-"}\nWhatsApp: ${params.telefone}`,
      start: startISO,
      end: endISO,
      timezone: tz,
      attendees,
      addMeet: true,
      source: "orbit-ai-agent",
    });
  } catch (e) {
    console.error("[orbit-ai-agent] createCalendarEvent falhou:", e);
    return { handled: false, error: "createCalendarEvent falhou", deal_id: dealId };
  }

  const meetingUrl: string | null =
    event?.hangoutLink ||
    event?.conferenceData?.entryPoints?.find?.((p: any) => p.entryPointType === "video")?.uri ||
    null;
  const googleEventId: string | null = event?.id ?? null;

  // 5) Inserir orbit_meetings JÁ com deal_id — em caso de falha, apagar evento Google (rollback)
  const { data: meetingRow, error: meetErr } = await supabase
    .from("orbit_meetings")
    .insert({
      empresa_id: params.empresaId,
      prospect_id: params.prospect_id,
      conversa_id: params.conversa_id,
      deal_id: dealId,
      titulo,
      scheduled_at: startISO,
      duration_minutes: duracaoMin,
      meeting_url: meetingUrl,
      status: "scheduled",
      google_event_id: googleEventId,
      metadata: { source: "orbit-ai-agent", event_link: event?.htmlLink ?? null },
    })
    .select("id")
    .maybeSingle();

  if (meetErr || !meetingRow?.id) {
    const errCode = (meetErr as any)?.code ?? null;
    const isUniqueViolation = errCode === "23505";
    console.error(
      "[orbit-ai-agent] insert orbit_meetings falhou — rollback do evento Google:",
      { code: errCode, msg: meetErr?.message, isUniqueViolation },
    );
    // Rollback do evento Google recém-criado — sempre.
    if (googleEventId) {
      try {
        await deps.deleteCalendarEvent(access, calId, googleEventId);
      } catch (delErr) {
        console.error("[orbit-ai-agent] rollback deleteCalendarEvent falhou:", (delErr as Error).message);
      }
    }

    // Corrida concorrente: outra execução venceu a inserção. Reutiliza a meeting vencedora
    // sem emitir novo deal_stage_changed nem handoff — apenas devolve sucesso/reuse.
    if (isUniqueViolation) {
      try {
        const { data: winner } = await supabase
          .from("orbit_meetings")
          .select("id, meeting_url, scheduled_at, status")
          .eq("empresa_id", params.empresaId)
          .eq("prospect_id", params.prospect_id)
          .eq("scheduled_at", startISO)
          .in("status", ["scheduled", "rescheduled"])
          .order("created_at", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (winner?.id) {
          console.log("[orbit-ai-agent] corrida 23505 — reutilizando meeting vencedora:", winner.id);
          const humanTime = new Intl.DateTimeFormat("pt-BR", {
            timeZone: tz, weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit",
          }).format(startDate);
          const url = winner.meeting_url;
          return {
            handled: true,
            created: false,
            response_override: url
              ? `Sua call já está agendada para ${humanTime}. Link: ${url}. Até lá!`
              : `Sua call já está agendada para ${humanTime}. Até lá!`,
            deal_id: dealId,
            meeting_id: winner.id,
          };
        }
        console.error("[orbit-ai-agent] 23505 sem meeting vencedora localizável — fallback seguro");
      } catch (lookupErr) {
        console.error("[orbit-ai-agent] lookup meeting vencedora falhou:", (lookupErr as Error).message);
      }
    }

    return { handled: false, error: "insert orbit_meetings falhou", deal_id: dealId };
  }



  // 6) Mover deal para etapa Agendado (se existir).
  //    Não emitimos INSERT manual de deal_stage_changed aqui: o trigger de banco
  //    `trg_orbit_emit_deal_stage_changed` (SECURITY DEFINER) já grava o evento
  //    a partir do UPDATE de etapa, com dedupe determinístico por (deal, from, to, bucket 60s).
  //    Se emitíssemos manualmente logo depois do UPDATE, geraríamos DOIS eventos
  //    semanticamente iguais em milissegundos e o dispatcher criaria dois runs.
  //    O executor resolve prospect_id/meeting_id via lookups a partir do deal.
  try {
    const { data: agStage } = await supabase
      .from("orbit_pipeline_stages")
      .select("id, nome")
      .eq("empresa_id", params.empresaId)
      .eq("is_archived", false)
      .ilike("nome", "%agendad%")
      .order("ordem", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (agStage?.id) {
      const { data: currentDeal } = await supabase
        .from("orbit_deals").select("etapa_id").eq("id", dealId).maybeSingle();
      const fromStageId = currentDeal?.etapa_id ?? null;
      if (fromStageId !== agStage.id) {
        const { error: mvErr } = await supabase
          .from("orbit_deals").update({ etapa_id: agStage.id }).eq("id", dealId);
        if (mvErr) {
          console.warn("[orbit-ai-agent] mover deal para Agendado falhou:", mvErr.message);
        }
      }
    }
  } catch (e) {
    console.warn("[orbit-ai-agent] mover deal Agendado bloco erro:", (e as Error).message);
  }

  const humanTime = new Intl.DateTimeFormat("pt-BR", {
    timeZone: tz, weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit",
  }).format(startDate);
  const respostaOverride = meetingUrl
    ? `Agendado! Nossa call está marcada para ${humanTime}. Link da reunião: ${meetingUrl}. Até lá!`
    : `Agendado! Nossa call está marcada para ${humanTime}. Envio o link logo em seguida.`;

  return {
    handled: true,
    created: true,
    response_override: respostaOverride,
    deal_id: dealId,
    meeting_id: meetingRow.id,
  };
}
