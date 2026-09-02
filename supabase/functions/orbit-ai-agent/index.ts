import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { getOrbitZapiRuntimeConfig, getOrbitZapiRealSendBlockReason } from "../_shared/orbit-zapi.ts";
import { auditZapiSendAttempt } from "../_shared/zapi-audit.ts";
import { signOrbitMediaUrl } from "../_shared/orbit-media.ts";
import { callAnthropic, toAnthropicMessages, ANTHROPIC_DEFAULT_MODEL } from "../_shared/anthropic.ts";
import { normalizeAgentModel } from "../_shared/ai-model.ts";
import {
  getTokenForEmpresa,
  ensureFreshAccessToken,
  checkAvailability,
  createCalendarEvent,
  listUpcomingEvents,
  addCalendarEventAttendee,
} from "../_shared/google-calendar.ts";
import {
  selectAuthoritativeViverClassEvent,
  viverClassLookupWindow,
} from "../_shared/viver-class-calendar.ts";
import { isAdapterEnabled, enqueueOutbox } from "../_shared/orbit-whatsapp-outbox.ts";
import { extractPublicMessage, looksLikeInternalPayload, sanitizedLeakSummary } from "../_shared/ai-output-guard.ts";
import {
  VIVER_EMPRESA_ID,
  selectAuthoritativeMeeting,
  formatMeetingAuthorityBlock,
  enforceFreshMeetingState,
  inboundExplicitlyRequestsMeetingLink,
  mentionsAgendaContent,
  type MeetingRow,
} from "../_shared/viver-meeting-guard.ts";
import {
  VIVER_CLASS_TEMPLATE_NAME,
  buildCanonicalClassDelivery,
  buildImmediateClassAcceptance,
  declinedClassInviteEmail,
  enforceCanonicalClassLink,
  extractClassInviteEmail,
  extractCanonicalClassUrl,
  previousAssistantOfferedClassAccess,
} from "./viver-class-guard.ts";
import { ensureViverClassMeeting } from "./viver-class-meeting.ts";
import {
  COMUNICA_EMPRESA_ID,
  comunicaQuoteReady,
  enforceComunicaNotificationTruth,
  normalizeQualificationFields,
  type QualificationField,
} from "./comunica-commercial-handoff.ts";

import {
  decideImmediateKick,
  kickOutboxDispatch,
  readImmediateOutboxDispatchFlag,
} from "../_shared/immediate-outbox-dispatch.ts";

import { evaluateAutomationCutoff } from "../_shared/automation-cutoff.ts";

import {
  isProofRequest,
  matchesTriggerKeywords,
  proofPayloadType,
  buildProofOutboxPayload,
  detectProofIntent,
  readAgentProofDecision,
  selectProofMedia,
  proofIdempotencyScope,
  stripUnfulfilledMediaPromise,
} from "../_shared/proof-media.ts";
import {
  detectEmailCollection,
  enforceNoEmailCollection,
  EMAIL_GUARD_CORRECTIVE,
} from "../_shared/no-email-collection.ts";
import {
  detectLocationCollection,
  enforceNoLocationCollection,
  LOCATION_GUARD_CORRECTIVE,
} from "../_shared/no-location-collection.ts";
import {
  detectIdentitySplit,
  enforceNoIdentitySplit,
  buildIdentityPromptBlock,
  isHandoffAllowed,
  leadRequestsHuman,
  IDENTITY_GUARD_CORRECTIVE,
  type IdentityGuardContext,
} from "../_shared/no-identity-split.ts";
import {
  readFalseBenefitsGuardConfig,
  detectFalseBenefits,
  enforceNoFalseBenefits,
  buildFalseBenefitsPromptBlock,
  FALSE_BENEFITS_CORRECTIVE,
} from "../_shared/no-false-benefits.ts";
import { currentSaoPauloTime, evaluateBusinessHours } from "../_shared/business-hours.ts";
import {
  evaluateCommercialStage,
  enforceCommercialStage,
  buildCommercialCorrective,
} from "../_shared/commercial-stage-guard.ts";
import {
  extractCommercialSignals,
  readCommercialState,
  computeCommercialPermissions,
  buildCommercialV2PromptBlock,
  buildCommercialV2Corrective,
  evaluateCommercialV2,
  sanitizeCommercialV2,
  updateCommercialState,
  isCommercialSaleHandoffAuthorized,
  EMPTY_COMMERCIAL_STATE,
} from "../_shared/commercial-signals.ts";
import {
  readPrimaryOfferLockConfig,
  computePrimaryOfferPermission,
  detectSecondaryOffer,
  sanitizeSecondaryOffer,
  buildSecondaryOfferCorrective,
  evaluateSecondaryOfferV2,
  sanitizeSecondaryOfferV2,
  buildSecondaryOfferCorrectiveV2,
  buildPrimaryOfferPromptBlock,
  detectBudgetObjection,
} from "../_shared/primary-offer-guard.ts";





import { normalizeAgentText, PT_BR_STYLE_GUARDRAILS } from "../_shared/pt-br-normalizer.ts";
import {
  resolveInternalNotificationTarget,
  isValidNotificationPhone,
  normalizeE164Digits,
} from "../_shared/internal-notification.ts";
import {
  commercialNotificationTitle,
  resolveCommercialNotificationPolicy,
} from "../_shared/commercial-notification-policy.ts";
import {
  readMixedPaymentHandoffConfig,
  detectMixedPaymentRequest,
  readMixedPaymentState,
  buildMixedPaymentClaim,
  mergeMixedPaymentState,
  decideMixedPaymentNextStep,
  MIXED_PAYMENT_CONFIRMATION_SOURCE,
  MIXED_PAYMENT_NOTIFICATION_SUMMARY,
} from "../_shared/mixed-payment-handoff.ts";
import {
  readPaymentReceiptHandoffConfig,
  detectPaymentReceipt,
  buildPaymentReceiptClaim,
  PAYMENT_RECEIPT_NOTIFICATION_SUMMARY,
} from "../_shared/payment-receipt-handoff.ts";

import {
  readSelfIntroductionGuardConfig,
  detectSelfIntroduction,
  enforceNoSelfIntroduction,
  buildNoSelfIntroPromptBlock,
  SELF_INTRO_CORRECTIVE,
} from "../_shared/no-self-introduction.ts";

import {
  buildBullinkConversationPromptBlock,
  enforceBullinkConversationGuard,
  inferBullinkConversationProductFocus,
  isBullinkTenant,
  readBullinkOfficialCardUrl,
  readBullinkOfficialPixKey,
  shouldDeferBullinkSaleHandoff,
} from "../_shared/bullink-conversation-guard.ts";
import { decideAutomaticReplyOwnership } from "../_shared/conversation-ownership.ts";

import {
  hydrateCanonicalFacts,
  buildCanonicalFactsBlock,
  recentAgentQuestions,
  detectRepetition,
  buildCorrectiveInstruction,
  buildDeterministicFallback,
  enforceSingleQuestion,
  stripPersonaReintroduction,
  canonicalFactsToCollectedFields,
  resolveCanonicalKey,
} from "../_shared/agent-memory.ts";
import { schedulingPolicy, isAmbiguousSlotAcceptance, selectExplicitSuggestion } from "../_shared/tenant-scheduling-policy.ts";

// Persistido na metadata de cada ai_reply para comprovar qual barreira estava
// realmente publicada quando uma resposta saiu. O monitor não precisa inferir
// versão por horário de commit nem confiar no deploy do frontend.
export const ORBIT_AI_AGENT_RUNTIME_VERSION = "2026-09-01-bullink-budget-proof-v4";

/**
 * Normalização final aplicada em TODOS os caminhos de saída do agente.
 * `allowIntro=false` remove reapresentação de persona e saudação redundante.
 */
export function finalizeAgentMessage(text: string, allowIntro = true): string {
  const normalized = normalizeAgentText(text);
  if (allowIntro) return normalized;
  return normalizeAgentText(stripPersonaReintroduction(normalized));
}

// ── Estado da conversa (máquina de estados) ──
type ConversationState = "novo" | "aguardando_resposta" | "auto_reply_detected" | "human_detected" | "qualificando" | "qualificado" | "handoff" | "encerrado";
type SchedulingMode = "auto_calendar" | "human_handoff_after_period";

export type TenantSchedulingDecision = {
  mode: SchedulingMode;
  handled: boolean;
  handoff_ready: boolean;
  awaiting_period: boolean;
  preferred_period: "manha" | "tarde" | "noite" | null;
  response_override?: string;
};

export function normalizePreferredPeriod(value: unknown): "manha" | "tarde" | "noite" | null {
  const normalized = String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (/\b(manha|matutino|cedo)\b/.test(normalized)) return "manha";
  if (/\b(tarde|vespertino)\b/.test(normalized)) return "tarde";
  if (/\b(noite|noturno)\b/.test(normalized)) return "noite";
  return null;
}

export function resolveTenantSchedulingDecision(params: {
  mode?: unknown;
  message: string;
  parsedPeriod?: unknown;
  awaitingPeriod?: boolean;
  handoffMessage?: unknown;
}): TenantSchedulingDecision {
  const mode: SchedulingMode = params.mode === "human_handoff_after_period"
    ? "human_handoff_after_period"
    : "auto_calendar";
  if (mode === "auto_calendar") {
    return { mode, handled: false, handoff_ready: false, awaiting_period: false, preferred_period: null };
  }

  const preferredPeriod = normalizePreferredPeriod(params.parsedPeriod) ||
    normalizePreferredPeriod(params.message);
  if (!preferredPeriod) {
    return {
      mode,
      handled: true,
      handoff_ready: false,
      awaiting_period: true,
      preferred_period: null,
      response_override: "Voce prefere conversar pela manha, a tarde ou a noite?",
    };
  }

  return {
    mode,
    handled: false,
    handoff_ready: true,
    awaiting_period: false,
    preferred_period: preferredPeriod,
    response_override: String(params.handoffMessage || "Perfeito. Vou verificar a agenda e ja te passo os horarios disponiveis."),
  };
}

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

function normalizePhone(value: unknown): string {
  return String(value || "").replace(/\D/g, "");
}

function messageTextForAgent(message: { mensagem?: string | null; media_extracted_text?: string | null; tipo_midia?: string | null }): string {
  const visible = String(message.mensagem || "").trim();
  const extracted = String(message.media_extracted_text || "").trim();
  if (!extracted) return visible;
  const label = message.tipo_midia === "audio" ? "Transcrição do áudio recebido" : "Imagem recebida";
  const isPlaceholder = /^📎\s*(image|audio)$/i.test(visible) || visible === "🎙️ Áudio";
  return `${isPlaceholder ? "" : `${visible}\n`}[${label}: ${extracted}]`.trim();
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
): Promise<{ sent: boolean; reason?: string }> {
  const { prospect, telefone_lead, mensagem, classification, empresa_id, isDemo } = params;

  // Destinatário SEMPRE resolvido pela configuração do MESMO empresa_id.
  // Nunca canary_phone_numbers, nunca fallback hardcoded/cross-tenant.
  const target = await resolveInternalNotificationTarget(supabase, empresa_id, {
    vendedorId: prospect?.responsavel_id || null,
  });

  if (!target.phone) {
    console.log("[orbit-ai-agent] Sem destinatário de notificação interna para o tenant — pulando", {
      empresa_id,
      reason: target.reason,
    });
    return { sent: false, reason: "no_recipient" };
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
  const titulo = commercialNotificationTitle(motivo);

  const notificacao = [
    `${titulo} — ${getDisplayName(prospect)}`,
    `Mensagem: "${(mensagem || "").substring(0, 200)}"`,
    `Conversa: ${waLink}`,
    `${dataHora}`,
  ].join("\n");

  const vendedorPhone = target.phone;

  if (isDemo) {
    console.log("[orbit-ai-agent] Demo — notificação comercial simulada:", { vendedorPhone, source: target.source });
    return { sent: true, reason: "simulated" };
  }


  const zapiConfig = await getOrbitZapiRuntimeConfig(supabase, empresa_id);
  const notifyBlockReason = getOrbitZapiRealSendBlockReason(zapiConfig, vendedorPhone);
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
    return { sent: false, reason: "zapi_real_send_blocked" };
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
    return response.ok ? { sent: true } : { sent: false, reason: `zapi_http_${response.status}` };
  }

  return { sent: false, reason: "zapi_config_missing" };
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

// ── Prova social (mídia aprovada da biblioteca do tenant) ──
// Dispara em: pedido explícito do lead, aceite curto após oferta do agente, ou
// decisão estruturada do agente. NUNCA chama a Z-API direto: enfileira no outbox
// com os mesmos gates de engaged reply (inbound real + cutoff + human_talk).
// A signed URL não é gerada aqui — o worker assina no momento do processamento.
export { isProofRequest };

const UUID_RE_AGENT = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

async function maybeQueueProofMedia(
  supabase: any,
  params: {
    empresa_id: string;
    conversa_id: string;
    prospect_id?: string | null;
    mensagem_lead: string;
    previous_out?: { mensagem?: string | null; status?: string | null; offered_proof_social?: boolean | null } | null;
    agent_decision?: boolean | null;
  },
): Promise<{ queued: boolean; reason?: string; media_id?: string; intent?: boolean }> {
  const { empresa_id, conversa_id, prospect_id, mensagem_lead } = params;

  const intent = detectProofIntent({
    mensagem_lead,
    previous_out: params.previous_out ?? null,
    agent_decision: params.agent_decision ?? null,
  });
  if (!intent.intent) return { queued: false, intent: false, reason: intent.reason };


  // Seleção tenant-scoped: só mídia aprovada/ativa da MESMA empresa.
  const { data: mediaList } = await supabase
    .from("orbit_media_library")
    .select("id, kind, caption, storage_path, mime, trigger_keywords, uso_count, duration_seconds")
    .eq("empresa_id", empresa_id)
    .eq("purpose", "prova_social")
    .eq("aprovado", true)
    .eq("ativo", true)
    .limit(50);

  const candidates = (mediaList ?? []).filter((m: any) =>
    intent.reason === "explicit_request"
      ? matchesTriggerKeywords(mensagem_lead, m.trigger_keywords)
      : true
  );
  const media = selectProofMedia(candidates as any);
  if (!media) return { queued: false, intent: true, reason: "no_approved_media" };

  const { data: lastIn } = await supabase
    .from("orbit_mensagens")
    .select("id")
    .eq("conversa_id", conversa_id)
    .eq("empresa_id", empresa_id)
    .eq("direcao", "IN")
    .order("timestamp", { ascending: false })
    .limit(1)
    .maybeSingle();
  const rawInbound = String((lastIn as any)?.id ?? "");
  const inboundId = rawInbound.match(UUID_RE_AGENT)?.[0]?.toLowerCase() ?? null;
  if (!inboundId) return { queued: false, intent: true, reason: "no_inbound_message" };

  // Linha visual única — legenda apenas, sem storage_path/filename no texto.
  const { data: novaMidia } = await supabase
    .from("orbit_mensagens")
    .insert({
      conversa_id,
      direcao: "OUT",
      mensagem: media.caption ?? "",
      canal: "whatsapp",
      status: "queued",
      tipo_midia: proofPayloadType(media.kind),
      storage_path: media.storage_path,
      empresa_id,
    })
    .select("id")
    .single();

  const routed = await enqueueOutbox(supabase, {
    empresa_id,
    conversa_id,
    prospect_id: prospect_id ?? null,
    source_type: "ai_reply",
    // inbound REAL (UUID puro) para passar pelos gates da engaged reply reserve.
    inbound_message_id: inboundId,
    source_id: inboundId,
    // Escopo garante 1 mídia por inbound+media sem colidir com a resposta de texto.
    idempotency_scope: proofIdempotencyScope(inboundId, media.id),
    payload_type: proofPayloadType(media.kind),
    // Payload sem fileName/nome local (ver _shared/proof-media.ts).
    payload: buildProofOutboxPayload(media),
    metadata: {
      orbit_message_id: novaMidia?.id ?? null,
      inbound_message_id: inboundId,
      media_library_id: media.id,
      media_intent: "prova_social",
      media_intent_reason: intent.reason,
      purpose: "prova_social",
    },
  });

  if (!routed.enqueued) {
    if (novaMidia?.id) {
      await supabase.from("orbit_mensagens").delete().eq("id", novaMidia.id);
    }
    // duplicate = já existe envio para este inbound+media: não conta uso de novo.
    return {
      queued: routed.reason === "duplicate",
      intent: true,
      reason: routed.reason ?? "not_eligible",
      media_id: media.id,
    };
  }

  await supabase
    .from("orbit_media_library")
    .update({ uso_count: Number(media.uso_count ?? 0) + 1 })
    .eq("id", media.id);

  console.log("[orbit-ai-agent] prova social enfileirada:", {
    media_id: media.id,
    outbox_id: routed.outbox_id,
    reason: intent.reason,
  });
  return { queued: true, intent: true, media_id: media.id };
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
    const { data: currentConv, error: ownershipError } = await supabase
      .from("orbit_conversas")
      .select("id, empresa_id, prospect_id, human_talk, human_user_id")
      .eq("id", conversa_id)
      .maybeSingle();
    const ownership = ownershipError
      ? { allowed: false as const, reason: "conversation_missing" as const }
      : decideAutomaticReplyOwnership(currentConv, empresaId);
    if (!ownership.allowed) {
      console.log("[orbit-ai-agent] áudio automático abortado por posse atual", {
        conversa_id,
        reason: ownership.reason,
      });
      return;
    }

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
        prospect_id: (currentConv as any)?.prospect_id ?? null,
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
    const audioBlockReason = getOrbitZapiRealSendBlockReason(zapiConfig, telefone);
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
  let executionClaimForCleanup: { id: string; empresa_id: string; lease_token: string } | null = null;
  let empresaIdForCleanup: string | null = null;
  let executionOutcomeForCleanup: "finished" | "error" = "finished";
  let drainContext: { conversa_id: string; prospect_id: string; telefone: string | null } | null = null;
  try {
    const { conversa_id, prospect_id, mensagem, telefone, recovery_tag, outbox_hold_until, inbound_message_id } = await req.json();
    conversaIdForCleanup = conversa_id ?? null;
    const recoveryTag = sanitizeRecoveryTag(recovery_tag);
    if (conversa_id && recoveryTag) RECOVERY_TAGS.set(conversa_id, recoveryTag);
    const holdUntil = sanitizeOutboxHoldUntil(outbox_hold_until);
    if (conversa_id && holdUntil) OUTBOX_HOLDS.set(conversa_id, holdUntil);
    console.log("[orbit-ai-agent] Processando:", { conversa_id, prospect_id, recovery_tag: recoveryTag, mensagem: mensagem?.substring(0, 50) });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    supabaseForCleanup = supabase;

    try {
    // Buscar prospect first to get empresa_id
    const { data: prospect } = await supabase
      .from("orbit_prospects")
      .select("*")
      .eq("id", prospect_id)
      .single();

    // Determine if demo
    let isDemo = false;
    const empresaId = prospect?.empresa_id;
    if (!empresaId || !conversa_id) throw new Error("tenant_or_conversation_not_resolved");
    empresaIdForCleanup = empresaId;
    drainContext = { conversa_id, prospect_id, telefone: telefone ?? null };

    let inboundQuery = supabase
      .from("orbit_mensagens")
      .select("id, mensagem")
      .eq("empresa_id", empresaId)
      .eq("conversa_id", conversa_id)
      .eq("direcao", "IN");
    if (inbound_message_id) inboundQuery = inboundQuery.eq("id", inbound_message_id);
    else inboundQuery = inboundQuery.order("timestamp", { ascending: false }).limit(1);
    const { data: normativeInbound } = await inboundQuery.maybeSingle();
    if (!normativeInbound?.id) throw new Error("inbound_message_not_resolved");
    const { data: claimRows, error: claimError } = await supabase.rpc("claim_orbit_ai_execution", {
      _empresa_id: empresaId,
      _conversa_id: conversa_id,
      _inbound_message_id: normativeInbound.id,
      _lease_seconds: 300,
    });
    if (claimError) throw new Error(`execution_claim_failed:${claimError.message}`);
    const claim = Array.isArray(claimRows) ? claimRows[0] : claimRows;
    if (!claim?.acquired || !claim?.claim_id || !claim?.lease_token) {
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: claim?.reason || "conversation_busy" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    executionClaimForCleanup = { id: claim.claim_id, empresa_id: empresaId, lease_token: claim.lease_token };
    const renewExecutionLease = async () => {
      const { data, error } = await supabase.rpc("renew_orbit_ai_execution_lease", {
        _claim_id: claim.claim_id, _lease_token: claim.lease_token, _lease_seconds: 300,
      });
      return !error && data === true;
    };
    const leaseLostResponse = () => new Response(
      JSON.stringify({ ok: true, skipped: true, reason: "lease_lost" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
    await supabase.from("orbit_conversas")
      .update({ ai_processing: true })
      .eq("id", conversa_id)
      .eq("empresa_id", empresaId);

    // ── DEBOUNCE: claim persistente já protege execuções concorrentes ──
    console.log("[orbit-ai-agent] Aguardando 10s para agregar mensagens...");
    await new Promise(r => setTimeout(r, 10000));
    if (!await renewExecutionLease()) {
      return leaseLostResponse();
    }

    // ── Corte de automação do tenant: prospect anterior ao corte nunca é atendido
    // pela IA (mesmo se alguém invocar o agente diretamente). Atendimento fica humano.
    const cutoff = await evaluateAutomationCutoff(supabase, {
      empresa_id: empresaId ?? null,
      prospect_id: prospect_id ?? null,
      prospect,
      conversa_id: conversa_id ?? null,
    });
    if (!cutoff.allowed) {
      console.log("[orbit-ai-agent] bloqueado pelo corte de automação:", {
        empresa_id: empresaId, prospect_id, conversa_id, reason: cutoff.reason, cutoff: cutoff.cutoff,
      });
      if (conversa_id) {
        await supabase
          .from("orbit_conversas")
          .update({ human_talk: true, ai_processing: false })
          .eq("id", conversa_id);
      }
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: cutoff.reason ?? "automation_cutoff" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

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

    const { data: agendaSettings } = empresaId
      ? await supabase
          .from("orbit_google_tokens")
          .select("timezone, availability_start, availability_end, availability_break_start, availability_break_end, booking_min_notice_minutes, booking_max_horizon_days")
          .eq("empresa_id", empresaId)
          .maybeSingle()
      : { data: null };

    // Horário de atendimento (fuso São Paulo).
    // responder_fora_horario=true => atendimento 24h: pula integralmente o fallback
    // de horário e segue a geração normal. Opt-in estrito por tenant.
    const currentTime = currentSaoPauloTime();
    const hoursDecision = evaluateBusinessHours(aiConfig as any, currentTime);
    console.log("[orbit-ai-agent] Horário São Paulo:", currentTime, "->", hoursDecision.reason);

    if (hoursDecision.halt) {
      if (hoursDecision.fallbackMessage) {
        if (!await renewExecutionLease()) return leaseLostResponse();
        await sendWhatsAppMessage(supabase, telefone, hoursDecision.fallbackMessage, conversa_id, isDemo, empresaId);
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

    const ownershipAtGeneration = decideAutomaticReplyOwnership(conversa, empresaId);
    if (!ownershipAtGeneration.allowed) {
      console.log("[orbit-ai-agent] geração abortada por posse atual da conversa", {
        conversa_id,
        reason: ownershipAtGeneration.reason,
      });
      await supabase.from("orbit_conversas")
        .update({ ai_processing: false })
        .eq("id", conversa_id)
        .eq("empresa_id", empresaId);
      return new Response(
        JSON.stringify({ ok: true, skipped: true, reason: ownershipAtGeneration.reason }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
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
      .select("id, mensagem, media_extracted_text, tipo_midia")
      .eq("conversa_id", conversa_id)
      .eq("direcao", "IN")
      .order("timestamp", { ascending: true });

    if (lastOutMsg?.timestamp) {
      pendingQuery = pendingQuery.gt("timestamp", lastOutMsg.timestamp);
    }

    const { data: pendingMsgs } = await pendingQuery;
    const mensagemAgregada = (pendingMsgs && pendingMsgs.length > 0)
      ? pendingMsgs.map(messageTextForAgent).filter(Boolean).join("\n")
      : mensagem;

    console.log("[orbit-ai-agent] Mensagens agregadas:", pendingMsgs?.length || 1, "msgs →", mensagemAgregada.substring(0, 100));

    // ── COMPROVANTE DE PAGAMENTO (tenant-scoped, determinístico, sem resposta) ──
    // É executado antes de classificação/LLM. Recibo confirmado transfere a posse
    // ao humano, garante o deal, cancela automações pendentes e notifica Fernando.
    const paymentReceiptCfg = readPaymentReceiptHandoffConfig(aiConfig as Record<string, unknown>);
    const paymentReceiptEvidence = paymentReceiptCfg
      ? detectPaymentReceipt(((pendingMsgs && pendingMsgs.length > 0)
        ? pendingMsgs
        : [{ mensagem }]) as any[])
      : { detected: false, inbound_id: null, kind: null };
    if (paymentReceiptCfg && paymentReceiptEvidence.detected) {
      if (!await renewExecutionLease()) return leaseLostResponse();
      const outcome = await runPaymentReceiptHandoff(supabase, {
        conversa_id,
        empresaId: empresaId ?? null,
        prospect,
        prospect_id: prospect_id ?? null,
        telefone,
        isDemo,
        targetStageName: paymentReceiptCfg.target_stage_name,
        inboundId: paymentReceiptEvidence.inbound_id,
        evidenceKind: paymentReceiptEvidence.kind,
      });
      console.log("[orbit-ai-agent] Comprovante recebido — handoff concluído:", { conversa_id, ...outcome });
      return new Response(
        JSON.stringify({ ok: true, payment_receipt_handoff: true, simulated: isDemo, ...outcome }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── CHATBOT FLOWS: comprovante tem prioridade absoluta; os demais eventos
    // preservam a prioridade anterior do fluxo sobre a IA generativa.
    if (!await renewExecutionLease()) return leaseLostResponse();
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

    // ── CLASSIFICAR MENSAGEM: humana, automática ou incerta ──
    const { classification: msgClassification, confidence: msgConfidence } = await classifyMessage(mensagemAgregada);
    console.log("[orbit-ai-agent] Classificação:", msgClassification, "confiança:", msgConfidence);

    // Janela de contexto: 20 mensagens por padrão. Se houve atendimento humano
    // (handoff/release), amplia até 40 para cobrir todo o período humano — com
    // limite de segurança: acima disso ficam apenas as últimas mensagens.
    const handoffMarker =
      (conversa as any)?.handoff_sent_at ||
      ((conversa as any)?.ai_contexto?.last_ai_release?.at ?? null);
    const historyLimit = handoffMarker ? 40 : 20;
    const { data: mensagens } = await supabase
      .from("orbit_mensagens")
      .select("direcao, mensagem, media_extracted_text, tipo_midia, timestamp, sender_type")
      .eq("conversa_id", conversa_id)
      .order("timestamp", { ascending: false })
      .limit(historyLimit);


    // Autoria explícita: o modelo precisa distinguir Cliente, Atendente humano
    // (Orbit ou celular) e o próprio Assistente para não repetir/contradizer o humano.
    const authorLabel = (m: { direcao?: string | null; sender_type?: string | null }) => {
      if (m.direcao === "IN") return "Cliente";
      if (m.sender_type === "human_orbit" || m.sender_type === "human_phone") return "Atendente humano";
      if (m.sender_type === "system") return "Sistema";
      return "Assistente";
    };

    const historicoFormatado = (mensagens || [])
      .reverse()
      .map((m) => `${authorLabel(m as any)}: ${messageTextForAgent(m)}`)
      .join("\n");

    // Viver: o histórico textual nunca é fonte autoritativa para saber se uma
    // reunião ainda é futura. O estado é lido diretamente do banco.
    let viverMeetingAuthority: ReturnType<typeof selectAuthoritativeMeeting> = null;
    if (empresaId === VIVER_EMPRESA_ID) {
      const { data: meetingRows, error: meetingStateError } = await supabase
        .from("orbit_meetings")
        .select("id, scheduled_at, duration_minutes, status, meeting_url")
        .eq("empresa_id", empresaId)
        .eq("conversa_id", conversa_id)
        .order("scheduled_at", { ascending: true });
      if (meetingStateError) {
        console.error("[orbit-ai-agent] Falha ao carregar estado autoritativo da reunião Viver:", meetingStateError);
      } else {
        viverMeetingAuthority = selectAuthoritativeMeeting((meetingRows || []) as MeetingRow[], new Date());
      }
    }


    // A janela de contexto tem só 20 mensagens. A primeira interação precisa usar
    // o histórico total para áudio/imagem ou conversas longas nunca reiniciarem a persona.
    const { count: totalOutboundCount, error: outboundCountError } = await supabase
      .from("orbit_mensagens")
      .select("id", { count: "exact", head: true })
      .eq("conversa_id", conversa_id)
      .eq("direcao", "OUT");
    if (outboundCountError) {
      console.error("[orbit-ai-agent] Falha ao contar mensagens OUT:", outboundCountError);
    }
    const mensagensOUT = totalOutboundCount ?? mensagens?.filter((m) => m.direcao === "OUT").length ?? 0;
    const aiContexto = conversa?.ai_contexto || {};
    const introAlreadySent = aiContexto.intro_already_sent === true;
    const isFromCampaign = aiContexto.origin === "outbound_campaign";
    // Uma conversa só é nova quando nunca houve saída. Áudio/imagem não reinicia a persona.
    const primeiraInteracao = !introAlreadySent && mensagensOUT === 0;

    // ── VIVER: aceite da aula entrega o link por caminho determinístico ──
    // A IA não escolhe URL nem promete um envio posterior. A autoridade é o
    // template tenant-scoped e ativo "Aula Grupo - Envio Link".
    let viverClassTemplateBody: string | null = null;
    if (empresaId === VIVER_EMPRESA_ID) {
      const { data: classTemplate, error: classTemplateError } = await supabase
        .from("orbit_message_templates")
        .select("id, corpo_texto, ativo")
        .eq("empresa_id", empresaId)
        .eq("nome", VIVER_CLASS_TEMPLATE_NAME)
        .eq("ativo", true)
        .maybeSingle();
      if (classTemplateError) {
        console.error("[orbit-ai-agent] Falha ao carregar autoridade da aula Viver:", classTemplateError);
      } else {
        viverClassTemplateBody = typeof classTemplate?.corpo_texto === "string"
          ? classTemplate.corpo_texto
          : null;
      }

      const normativeInboundText = typeof normativeInbound.mensagem === "string"
        ? normativeInbound.mensagem
        : mensagemAgregada;
      const classInviteEmailPending = aiContexto.viver_class_email_pending === true;
      const suppliedClassEmail = extractClassInviteEmail(normativeInboundText);
      const declinedClassEmail = declinedClassInviteEmail(normativeInboundText);
      let viverClassContext = aiContexto;

      if (classInviteEmailPending && (suppliedClassEmail || declinedClassEmail)) {
        if (suppliedClassEmail && prospect?.id) {
          const { error: emailUpdateError } = await supabase
            .from("orbit_prospects")
            .update({ email_principal: suppliedClassEmail })
            .eq("id", prospect.id)
            .eq("empresa_id", empresaId);
          if (emailUpdateError) {
            console.error("[orbit-ai-agent] Falha ao salvar e-mail do convite da aula:", emailUpdateError);
            const fallback = "Não consegui confirmar seu e-mail agora. Posso enviar o acesso somente por aqui?";
            await sendAIResponse(supabase, telefone, fallback, conversa_id, isDemo, empresaId, aiConfig, primeiraInteracao);
            return new Response(JSON.stringify({ ok: true, class_email_guarded: true, resposta: fallback, simulated: isDemo }), {
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
        }
        viverClassContext = {
          ...viverClassContext,
          viver_class_email_pending: false,
          viver_class_participation_confirmed: true,
          viver_class_invite_email_collected: Boolean(suppliedClassEmail),
        };
        await supabase.from("orbit_conversas").update({
          ai_contexto: viverClassContext,
        }).eq("id", conversa_id).eq("empresa_id", empresaId);
      }

      const shouldDeliverAfterEmailStep = classInviteEmailPending &&
        (Boolean(suppliedClassEmail) || declinedClassEmail);
      if (previousAssistantOfferedClassAccess(mensagens || [], normativeInboundText)) {
        const canonicalUrl = extractCanonicalClassUrl(viverClassTemplateBody);
        if (!canonicalUrl || !viverClassTemplateBody) {
          console.error("[orbit-ai-agent] Aceite da aula bloqueado: autoridade ausente ou inválida", {
            empresa_id: empresaId,
            conversa_id,
          });
          const fallback = "Não consegui confirmar o acesso da aula agora. Você quer que eu verifique isso antes de te enviar?";
          await sendAIResponse(supabase, telefone, fallback, conversa_id, isDemo, empresaId, aiConfig, primeiraInteracao);
          return new Response(JSON.stringify({ ok: true, class_link_guarded: true, resposta: fallback, simulated: isDemo }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        if (!prospect?.id || !normativeInbound.id) {
          const fallback = "Não consegui confirmar sua participação agora. Você quer que eu verifique isso antes de continuar?";
          await sendAIResponse(supabase, telefone, fallback, conversa_id, isDemo, empresaId, aiConfig, primeiraInteracao);
          return new Response(JSON.stringify({ ok: true, class_participation_guarded: true, resposta: fallback, simulated: isDemo }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        try {
          if (isDemo) {
            viverClassContext = {
              ...viverClassContext,
              viver_class_participation_confirmed: true,
              viver_class_reminder_status: "simulated",
            };
          } else {
            const participation = await ensureViverClassMeeting(supabase, {
              empresaId,
              prospectId: prospect.id,
              conversaId: conversa_id,
              consentMessageId: normativeInbound.id,
              canonicalMeetUrl: canonicalUrl,
              now: new Date(),
            });
            viverClassContext = {
              ...viverClassContext,
              viver_class_participation_confirmed: true,
              viver_class_meeting_id: participation.meetingId,
              viver_class_scheduled_at: participation.scheduledAt,
              viver_class_reminder_status: "scheduled",
            };
          }
        } catch (classMeetingError) {
          console.error("[orbit-ai-agent] Participação da aula Viver não agendada:", {
            empresa_id: empresaId,
            conversa_id,
            error: classMeetingError instanceof Error
              ? classMeetingError.message
              : "viver_class_meeting_unknown_error",
          });
          const fallback = "Não consegui confirmar sua participação agora. Você quer que eu verifique isso antes de continuar?";
          await sendAIResponse(supabase, telefone, fallback, conversa_id, isDemo, empresaId, aiConfig, primeiraInteracao);
          return new Response(JSON.stringify({ ok: true, class_participation_guarded: true, resposta: fallback, simulated: isDemo }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        const immediateAcceptance = buildImmediateClassAcceptance(
          viverClassTemplateBody,
          prospect?.nome_contato || prospect?.nome_razao,
        );
        viverClassContext = {
          ...viverClassContext,
          ...immediateAcceptance.contextPatch,
        };
        await supabase.from("orbit_conversas").update({
          ai_contexto: viverClassContext,
        }).eq("id", conversa_id).eq("empresa_id", empresaId);
        if (!await renewExecutionLease()) return leaseLostResponse();
        await sendAIResponse(
          supabase,
          telefone,
          immediateAcceptance.reply,
          conversa_id,
          isDemo,
          empresaId,
          aiConfig,
          primeiraInteracao,
        );
        return new Response(JSON.stringify({
          ok: true,
          class_link_delivered: true,
          class_invite_email_collected: false,
          class_calendar_invite_status: "not_requested",
          resposta: immediateAcceptance.reply,
          simulated: isDemo,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (shouldDeliverAfterEmailStep) {
        const canonicalUrl = extractCanonicalClassUrl(viverClassTemplateBody);
        if (!canonicalUrl || !viverClassTemplateBody) {
          const fallback = "Não consegui confirmar o acesso da aula agora. Você quer que eu verifique isso antes de te enviar?";
          await sendAIResponse(supabase, telefone, fallback, conversa_id, isDemo, empresaId, aiConfig, primeiraInteracao);
          return new Response(JSON.stringify({ ok: true, class_link_guarded: true, resposta: fallback, simulated: isDemo }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        let calendarInviteStatus = suppliedClassEmail ? "pending" : "not_requested";
        if (suppliedClassEmail && !isDemo) {
          try {
            const googleToken = await getTokenForEmpresa(empresaId);
            if (!googleToken) throw new Error("class_calendar_not_connected");
            const accessToken = await ensureFreshAccessToken(googleToken);
            const lookupWindow = viverClassLookupWindow(new Date());
            const listed = await listUpcomingEvents(
              accessToken,
              googleToken.calendar_id,
              lookupWindow.timeMin,
              250,
              lookupWindow.timeMax,
            );
            const selection = selectAuthoritativeViverClassEvent(
              Array.isArray(listed?.items) ? listed.items : [],
              canonicalUrl,
              new Date(),
            );
            if (!selection.event?.id) {
              throw new Error(selection.reason || "class_calendar_event_not_found");
            }
            const invitation = await addCalendarEventAttendee(
              accessToken,
              googleToken.calendar_id,
              selection.event.id,
              suppliedClassEmail,
            );
            calendarInviteStatus = invitation.alreadyPresent ? "already_present" : "invited";
          } catch (calendarInviteError) {
            calendarInviteStatus = "failed";
            console.error("[orbit-ai-agent] Convite Google da aula Viver não concluído:", {
              empresa_id: empresaId,
              conversa_id,
              error: calendarInviteError instanceof Error
                ? calendarInviteError.message
                : "class_calendar_unknown_error",
            });
          }
        } else if (suppliedClassEmail && isDemo) {
          calendarInviteStatus = "simulated";
        }
        await supabase.from("orbit_conversas").update({
          ai_contexto: {
            ...viverClassContext,
            viver_class_email_pending: false,
            viver_class_participation_confirmed: true,
            viver_class_invite_email_collected: Boolean(suppliedClassEmail),
            viver_class_calendar_invite_status: calendarInviteStatus,
          },
        }).eq("id", conversa_id).eq("empresa_id", empresaId);

        if (!await renewExecutionLease()) return leaseLostResponse();
        const deterministicReply = buildCanonicalClassDelivery(
          viverClassTemplateBody,
          prospect?.nome_contato || prospect?.nome_razao,
        );
        await sendAIResponse(supabase, telefone, deterministicReply, conversa_id, isDemo, empresaId, aiConfig, primeiraInteracao);
        return new Response(JSON.stringify({
          ok: true,
          class_link_delivered: true,
          class_invite_email_collected: Boolean(suppliedClassEmail),
          class_calendar_invite_status: calendarInviteStatus,
          resposta: deterministicReply,
          simulated: isDemo,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // ── SEM AUTOAPRESENTAÇÃO (tenant-scoped) ──
    const selfIntroCfg = readSelfIntroductionGuardConfig(aiConfig as Record<string, unknown>);

    // ── PAGAMENTO MISTO PIX + CARTÃO (tenant-scoped por orbit_ai_config.mixed_payment_handoff) ──
    // Fluxo determinístico, sem LLM e POR ETAPAS (recuperável/idempotente):
    //   claim -> confirmação durável no outbox -> human_talk -> notificação interna.
    // A posse humana só é marcada DEPOIS que a única confirmação está enfileirada,
    // e a notificação nunca é marcada antes do sucesso real.
    // Nunca define entrada, parcelas, desconto, link ou chave.
    const mixedPaymentCfg = readMixedPaymentHandoffConfig(aiConfig as Record<string, unknown>);
    if (mixedPaymentCfg && detectMixedPaymentRequest(mensagemAgregada)) {
      if (!await renewExecutionLease()) return leaseLostResponse();
      const outcome = await runMixedPaymentHandoff(supabase, {
        conversa_id,
        empresaId: empresaId ?? null,
        prospect,
        prospect_id: prospect_id ?? null,
        telefone,
        isDemo,
        aiConfig,
        confirmation: mixedPaymentCfg.confirmation_message,
      });
      console.log("[orbit-ai-agent] Pagamento misto — etapa concluída:", { conversa_id, ...outcome });
      return new Response(
        JSON.stringify({ ok: true, mixed_payment_handoff: true, simulated: isDemo, ...outcome }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }




    const emColetaOrcamento = aiContexto.em_coleta_orcamento || false;
    const camposColetados = aiContexto.campos_coletados || {};
    const camposCadastro: string[] = Array.isArray(aiConfig.campos_qualificacao)
      ? (aiConfig.campos_qualificacao as Array<{ key?: string }>).map((c) => c?.key).filter((k): k is string => !!k)
      : [];
    // Campos de CADASTRO obrigatórios: agora tenant-scoped.
    // `orbit_ai_config.campos_cadastro_obrigatorios` (jsonb array) é a fonte explícita:
    //   - array (inclusive vazio) -> vale exatamente o que o tenant declarou;
    //   - null/ausente            -> fallback legado, preservado para os demais tenants.
    const camposCadastroConfig = Array.isArray((aiConfig as any).campos_cadastro_obrigatorios)
      ? ((aiConfig as any).campos_cadastro_obrigatorios as unknown[])
        .map((c) => (typeof c === "string" ? c : (c as any)?.key))
        .filter((k): k is string => typeof k === "string" && k.trim().length > 0)
      : null;
    const camposCadastroEffective = camposCadastroConfig !== null
      ? camposCadastroConfig
      : (camposCadastro.length > 0 ? camposCadastro : ["nome_razao", "email_principal", "cidade"]);
    const maxTokens = aiConfig.max_tokens || 500;
    const idioma = aiConfig.idioma || "pt-BR";

    // ── MEMÓRIA CANÔNICA: hidratar fatos já conhecidos do lead ──
    const canonicalFacts = hydrateCanonicalFacts({
      prospect,
      aiContexto,
      mensagens: mensagens || [],
      tenantAliases: (aiConfig as any).canonical_field_aliases,
    });
    const camposFaltantes = camposCadastroEffective.filter((campo: string) => {
      const canonical = resolveCanonicalKey(campo, (aiConfig as any).canonical_field_aliases);
      return !camposColetados[campo] && !prospect?.[campo] && !(canonical && canonicalFacts[canonical]);
    });
    const cadastroCompleto = camposFaltantes.length === 0;
    const canonicalFactsBlock = buildCanonicalFactsBlock(canonicalFacts);
    const previousAgentQuestions = recentAgentQuestions(mensagens || []);
    console.log(
      "[orbit-ai-agent] Fatos canônicos:",
      Object.keys(canonicalFacts).join(", ") || "(nenhum)",
      "| perguntas recentes:",
      previousAgentQuestions.length,
    );



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
    const conversionGuidance = ((aiConfig as any).conversion_guidance && String((aiConfig as any).conversion_guidance).trim()) || "";
    const conversionGuidanceBlock = conversionGuidance
      ? `\nORIENTAÇÕES DE CONVERSÃO DO TENANT (subordinadas a todas as regras críticas e guardrails determinísticos):\n${conversionGuidance}\n`
      : "";
    const camposQualificacao: QualificationField[] = empresaId === COMUNICA_EMPRESA_ID
      ? normalizeQualificationFields(aiConfig.campos_qualificacao)
      : (Array.isArray(aiConfig.campos_qualificacao)
        ? aiConfig.campos_qualificacao as QualificationField[]
        : []);

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

    const _agendaTz = agendaSettings?.timezone || "America/Sao_Paulo";
    const _nowFmt = new Intl.DateTimeFormat("pt-BR", { timeZone: _agendaTz, weekday: "long", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date());
    const _nowISO = new Date().toISOString();
    const _agendaBreak = agendaSettings?.availability_break_start && agendaSettings?.availability_break_end
      ? ` PAUSA SEM AGENDAMENTO: ${String(agendaSettings.availability_break_start).slice(0, 5)} às ${String(agendaSettings.availability_break_end).slice(0, 5)}.`
      : "";
    const dataHoraAtualBlock = `\nDATA/HORA ATUAL (referência para agendamentos): ${_nowFmt} (${_agendaTz}) — ISO: ${_nowISO}\nJANELA DA AGENDA: ${agendaSettings?.availability_start || "09:00"}–${agendaSettings?.availability_end || "18:00"}.${_agendaBreak} Antecedência mínima ${agendaSettings?.booking_min_notice_minutes ?? 60} min; horizonte máximo ${agendaSettings?.booking_max_horizon_days ?? 60} dias.\nREGRA CRÍTICA DE AGENDAMENTO: NUNCA devolva "data_iso" no passado nem além do horizonte. Se o cliente citar um dia da semana, resolva para a próxima ocorrência FUTURA no fuso acima. Se disser apenas "semana que vem" sem indicar o dia, deixe data_iso=null e pergunte o dia. Ano correto é derivado da data atual; nunca invente janeiro ou outro mês sem apoio na mensagem.\n`;
    const schedulingModeBlock = aiConfig.scheduling_mode === "human_handoff_after_period"
      ? `\nMODO DE AGENDAMENTO DESTE TENANT: HANDOFF HUMANO APOS PERIODO.\n- Quando o lead aceitar a conversa/reuniao, use intencao=agendar_call e pergunte apenas se prefere manha, tarde ou noite.\n- Quando ele responder o periodo, use intencao=agendar_call e preencha agendamento.periodo_preferido.\n- Nao ofereca dia ou horario e nao prometa evento criado. O sistema transfere para o responsavel.\n`
      : `\nMODO DE AGENDAMENTO DESTE TENANT: AGENDA AUTOMATICA. O sistema consulta o calendario e oferece dois horarios livres; nao pergunte qual horario o lead prefere antes dessa consulta.\n`;

    // ── CONDUÇÃO COMERCIAL v2 (tenant-scoped por commercial_stage_v2_enabled) ──
    const commercialV2Enabled = (aiConfig as any).commercial_stage_v2_enabled === true;
    const primaryOfferCfg = readPrimaryOfferLockConfig(aiConfig as Record<string, unknown>);
    const bullinkOfficialPixKey = readBullinkOfficialPixKey(aiConfig as Record<string, unknown>);
    const bullinkOfficialCardUrl = readBullinkOfficialCardUrl(aiConfig as Record<string, unknown>);
    const commercialState = commercialV2Enabled
      ? readCommercialState(aiContexto as Record<string, unknown>)
      : { ...EMPTY_COMMERCIAL_STATE };
    const commercialExtracted = commercialV2Enabled
      ? extractCommercialSignals(mensagemAgregada)
      : { signals: new Set<never>(), paymentMethod: null, productMentioned: null } as any;
    const bullinkVerifiedBudgetObjectionNow = isBullinkTenant(empresaId) &&
      detectBudgetObjection(mensagemAgregada);
    // O detector comercial genérico também usa contexto socioeconômico como
    // sinal consultivo. No Bullink isso nunca pode liberar o downsell: apenas
    // uma objeção financeira textual e determinística tem essa autoridade.
    if (
      isBullinkTenant(empresaId) &&
      commercialExtracted.signals.has("budget_objection") &&
      !bullinkVerifiedBudgetObjectionNow
    ) {
      commercialExtracted.signals.delete("budget_objection");
    }
    const bullinkVerifiedBudgetObjectionInHistory = isBullinkTenant(empresaId) &&
      (mensagens || []).some((message) =>
        String((message as any)?.direcao ?? "").toUpperCase() === "IN" &&
        detectBudgetObjection(String((message as any)?.mensagem ?? ""))
      );
    const authoritativeBullinkBudgetObjection = isBullinkTenant(empresaId)
      ? bullinkVerifiedBudgetObjectionNow ||
        bullinkVerifiedBudgetObjectionInHistory ||
        commercialState.budget_objection_verified === true
      : undefined;
    const bullinkHistoryProductFocus = inferBullinkConversationProductFocus({
      empresaId,
      recentMessages: mensagens || [],
      stateFocus: commercialState.product_focus,
      stateBudgetObjection: authoritativeBullinkBudgetObjection ??
        commercialState.budget_objection,
    });
    const rawCommercialProductFocus = primaryOfferCfg &&
        (commercialExtracted.signals.has("budget_objection") || commercialExtracted.signals.has("discount_request"))
      ? primaryOfferCfg.secondaryFocus as "mentoria" | "curso"
      : (commercialExtracted.productMentioned ?? bullinkHistoryProductFocus ?? commercialState.product_focus);
    // A trava da oferta principal é a autoridade sobre o produto efetivo. Uma
    // simples menção ao Curso (ou estado legado em "curso") não pode contaminar
    // preço, checkout nem o estado persistido antes da objeção financeira.
    const primaryOfferPerm = primaryOfferCfg
      ? computePrimaryOfferPermission({
          cfg: primaryOfferCfg,
          inbound: mensagemAgregada,
          tags: Array.isArray((prospect as any)?.tags) ? ((prospect as any).tags as string[]) : [],
          stateFocus: rawCommercialProductFocus,
          stateBudgetObjection: authoritativeBullinkBudgetObjection ??
            (commercialState.budget_objection ||
              commercialExtracted.signals?.has?.("budget_objection") === true),
        })
      : null;
    const commercialProductInFocus = primaryOfferPerm?.effectiveFocus ?? rawCommercialProductFocus;
    const singlePaymentMethod = primaryOfferCfg &&
        commercialProductInFocus === primaryOfferCfg.secondaryFocus &&
        /\bpix\b/i.test(primaryOfferCfg.secondaryPriceLine) &&
        !/\bcart(?:ao|ão)\b/i.test(primaryOfferCfg.secondaryPriceLine)
      ? "pix" as const
      : null;
    const commercialPerms = commercialV2Enabled
      ? computeCommercialPermissions(commercialExtracted, commercialState, {
          suppressRepeatedPrice: primaryOfferCfg?.antiRepetitionEnabled === true,
          defaultPaymentMethod: singlePaymentMethod,
          effectiveProduct: commercialProductInFocus,
        })
      : null;
    const requiredCommercialPriceLine = primaryOfferCfg &&
        commercialProductInFocus === primaryOfferCfg.secondaryFocus
      ? primaryOfferCfg.secondaryPriceLine
      : primaryOfferCfg?.primaryPriceLine;
    const commercialTurnTimestamp = new Date().toISOString();
    const commercialV2Block = commercialV2Enabled && commercialPerms
      ? buildCommercialV2PromptBlock(commercialState, commercialPerms, commercialExtracted)
      : "";

    // ── TRAVA DE OFERTA PRINCIPAL (tenant-scoped por orbit_ai_config.primary_offer_lock) ──
    // Pergunta genérica de preço não pode virar cardápio com a oferta secundária.
    const primaryOfferBlock = primaryOfferCfg && primaryOfferPerm
      ? buildPrimaryOfferPromptBlock(primaryOfferCfg, primaryOfferPerm)
      : "";

    // ── IDENTIDADE ÚNICA (tenant-scoped por orbit_ai_config.block_identity_split) ──
    // O agente É o dono da oferta: nunca prometer especialista/consultor/equipe.
    // Handoff real só com pedido explícito do lead, conversa assumida por humano
    // ou intenção que exija ação humana (definida após a resposta do modelo).
    const blockIdentitySplit = (aiConfig as any).block_identity_split === true;
    const identityCtx: IdentityGuardContext = {
      leadAskedHuman: leadRequestsHuman(mensagemAgregada),
      humanTalk: (conversa as any)?.human_talk === true,
      handoffAuthorized: false,
    };
    const identityBlock = blockIdentitySplit
      ? buildIdentityPromptBlock(isHandoffAllowed(identityCtx))
      : "";

    // ── SEM AUTOAPRESENTAÇÃO (tenant-scoped por orbit_ai_config.self_introduction_guard) ──
    const selfIntroBlock = selfIntroCfg ? buildNoSelfIntroPromptBlock(selfIntroCfg) : "";
    const bullinkConversationBlock = buildBullinkConversationPromptBlock(empresaId);

    // ── ENTREGÁVEIS VERDADEIROS (tenant-scoped por orbit_ai_config.false_benefits_guard) ──
    // Proíbe prometer acesso a IA/ferramenta e grupo/comunidade (não existem na oferta).
    const falseBenefitsCfg = readFalseBenefitsGuardConfig(aiConfig as Record<string, unknown>);
    const falseBenefitsBlock = falseBenefitsCfg ? buildFalseBenefitsPromptBlock() : "";


    // Bloco tenant-scoped: reforça no prompt a proibição de coleta de localização/e-mail.
    const noCollectRules: string[] = [];
    if ((aiConfig as any).block_location_collection === true) {
      noCollectRules.push('- NUNCA pergunte cidade, estado, região, endereço ou qualquer localização do lead.');
      noCollectRules.push('- NUNCA use expressões como "finalizar cadastro", "completar cadastro" ou "preciso dos seus dados".');
    }
    if ((aiConfig as any).block_email_collection === true) {
      noCollectRules.push('- NUNCA pergunte e-mail do lead.');
    }
    const noCollectBlock = noCollectRules.length
      ? `\nCOLETA DE DADOS (INVIOLÁVEL PARA ESTE TENANT):\n${noCollectRules.join("\n")}\n- Só pergunte um dado se ele for estritamente necessário ao fechamento e explicitamente autorizado pelas regras comerciais.\n`
      : "";


    const viverMeetingBlock = empresaId === VIVER_EMPRESA_ID
      ? formatMeetingAuthorityBlock(viverMeetingAuthority, new Date())
      : "";

    const systemPrompt = `${promptIdentidade}

ESTILO DE ESCRITA (PT-BR, INVIOLÁVEL):
${PT_BR_STYLE_GUARDRAILS}


Tom de voz: ${aiConfig.tom_conversa || "profissional e amigável"}
Idioma: ${idioma === "pt-BR" ? "Português do Brasil" : idioma === "en" ? "Inglês" : "Espanhol"}
${campaignContinuity}${stateInstruction}${classificationInstruction}
${promptRoteiro ? `\nROTEIRO DE QUALIFICAÇÃO:\n${promptRoteiro}\n` : ""}${conversionGuidanceBlock}${dataHoraAtualBlock}${schedulingModeBlock}${viverMeetingBlock}
CONTEXTO ESTRUTURADO DO LEAD:
${JSON.stringify(leadContext, null, 2)}
${canonicalFactsBlock}${camposQualificacaoBlock}${ragBlock}${commercialV2Block}${primaryOfferBlock}${identityBlock}${selfIntroBlock}${bullinkConversationBlock}${falseBenefitsBlock}${noCollectBlock}
${empresaId === COMUNICA_EMPRESA_ID ? `\nREGRA DE NOTIFICAÇÃO COMERCIAL (COMUNICA): mesmo após concluir a coleta, diga apenas que registrou as informações. NUNCA afirme que encaminhou ou notificou a equipe; o sistema acrescentará essa confirmação somente depois do aceite real do canal interno.\n` : ""}
REGRAS CRÍTICAS:
1. DADOS EXISTENTES: Se um dado do lead já está preenchido no contexto acima ou nos FATOS CANÔNICOS (personName, companyName, city, email, nível pretendido, cidade/estado etc.), NUNCA pergunte novamente. Use naturalmente na conversa.
2. CAMPOS FALTANTES: Solicite APENAS os campos marcados como "true" em missingFields, e as perguntas dinâmicas ainda não respondidas.
3. Se for PRIMEIRA INTERAÇÃO (isFirstInteraction=true) E NÃO for campanha, envie a mensagem de boas-vindas: "${aiConfig.mensagem_boas_vindas || 'Olá! Como posso ajudá-lo?'}"
4. Se o cliente pedir ORÇAMENTO, COTAÇÃO ou demonstrar interesse em comprar, inicie a coleta dos campos faltantes.
5. ${blockIdentitySplit
  ? `Quando TODAS as informações relevantes estiverem preenchidas, NÃO prometa nenhum especialista, consultor, equipe ou terceiro: avance você mesmo, em primeira pessoa (aprofunde a explicação, ofereça o investimento ou proponha o próximo passo direto com você).`
  : `Quando TODAS as informações relevantes (cadastro + qualificação obrigatória) estiverem preenchidas, agradeça e informe: "Perfeito. Vou colocar um especialista para avançarmos de forma mais objetiva."`}
6. NUNCA invente dados sobre produtos ou preços — se a Base de Conhecimento não trouxer a resposta, diga que vai confirmar e seguir.
7. Seja cordial e responda de forma concisa — máximo 2-3 frases.
8. SEMPRE responda no idioma configurado.
9. NUNCA resetar conversa. NUNCA reapresentar-se se já houve interação anterior.
9.1 CONTINUIDADE: ${primeiraInteracao ? "Esta é a primeira mensagem: pode se apresentar uma única vez." : "PROIBIDO reapresentar a persona (\"aqui é a ...\", \"sou a ...\", \"é a ... mesmo\") e PROIBIDO iniciar nova saudação. Continue a conversa direto do ponto atual, inclusive quando a mensagem recebida for áudio ou imagem."}
9.2 NÃO REPITA PERGUNTAS já feitas recentemente. Perguntas recentes suas: ${previousAgentQuestions.length ? previousAgentQuestions.map((q) => `"${q}"`).join(" ") : "(nenhuma)"}
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
  "agendamento": { "data_iso": "ISO-8601 com timezone ou null", "tem_horario": true|false, "periodo_preferido": "manha|tarde|noite|null", "duracao_min": 60, "titulo": "Call com ..." }
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
- Se o atendimento pedir apenas o periodo do dia, preencha periodo_preferido com manha, tarde ou noite exatamente quando o cliente responder.
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
      model: normalizeAgentModel((aiConfig as any).modelo_ia),
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

    // Parse robusto + barreira anti-vazamento (JSON puro, ```json, prefixo "json").
    // NUNCA usa raw output como fallback ao cliente quando parece metadado interno.
    const publicOut = extractPublicMessage(content);
    let parsed: any = publicOut.parsed ?? { mensagem: publicOut.text };
    let suppressReply: string | null = null;
    if (publicOut.blocked) {
      console.error(
        "[orbit-ai-agent] Saída estruturada bloqueada (não enviada ao lead):",
        JSON.stringify(sanitizedLeakSummary(content)),
      );
      suppressReply = "blocked_structured_output";
    } else if (publicOut.skip) {
      console.warn("[orbit-ai-agent] Sem mensagem pública para enviar:", publicOut.reason, publicOut.intencao || "");
      suppressReply = publicOut.reason;
    }

    let resposta = publicOut.text;
    console.log("[orbit-ai-agent] Resposta gerada:", resposta.substring(0, 100));


    // ── GUARD DETERMINÍSTICO: nunca perguntar campo conhecido nem repetir pergunta recente ──
    {
      let verdict = detectRepetition(resposta, canonicalFacts, previousAgentQuestions);
      if (verdict.violates) {
        console.warn("[orbit-ai-agent] Guard de repetição acionado:", verdict.reason, verdict.field || verdict.question);
        const retry = await callAnthropic({
          model: normalizeAgentModel((aiConfig as any).modelo_ia),
          system: systemPrompt,
          messages: toAnthropicMessages([
            { role: "user", content: userTurn },
            { role: "assistant", content: resposta },
            { role: "user", content: buildCorrectiveInstruction(verdict, canonicalFacts) + " Responda apenas com a nova mensagem final ao cliente, sem JSON." },
          ]),
          temperature: 0.5,
          max_tokens: maxTokens,
        });
        const retryText = retry.ok ? String(retry.text || "").trim() : "";
        if (retryText) {
          const retryVerdict = detectRepetition(retryText, canonicalFacts, previousAgentQuestions);
          if (!retryVerdict.violates) {
            resposta = retryText;
            verdict = { violates: false };
          } else {
            verdict = retryVerdict;
          }
        }
        if (verdict.violates) {
          resposta = buildDeterministicFallback(canonicalFacts, camposQualificacao, previousAgentQuestions);
          console.warn("[orbit-ai-agent] Fallback determinístico aplicado.");
        }
        parsed.mensagem = resposta;
      }
    }

    // ── GUARD TENANT-SCOPED: proibido solicitar e-mail ao lead ──
    // Ativado apenas quando orbit_ai_config.block_email_collection = true.
    const blockEmailCollection = (aiConfig as any).block_email_collection === true;
    if (blockEmailCollection && detectEmailCollection(resposta).violates) {
      console.warn("[orbit-ai-agent] Guard de coleta de e-mail acionado.");
      const retry = await callAnthropic({
        model: normalizeAgentModel((aiConfig as any).modelo_ia),
        system: systemPrompt,
        messages: toAnthropicMessages([
          { role: "user", content: userTurn },
          { role: "assistant", content: resposta },
          { role: "user", content: EMAIL_GUARD_CORRECTIVE + " Responda apenas com a nova mensagem final ao cliente, sem JSON." },
        ]),
        temperature: 0.5,
        max_tokens: maxTokens,
      });
      const retryText = retry.ok ? String(retry.text || "").trim() : "";
      if (retryText && !detectEmailCollection(retryText).violates) {
        resposta = retryText;
      } else {
        const enforced = enforceNoEmailCollection(retryText || resposta, true);
        resposta = enforced.text;
        console.warn("[orbit-ai-agent] Coleta de e-mail sanitizada.", { fallback: enforced.fallbackUsed });
      }
      parsed.mensagem = resposta;
    }

    // ── GUARD TENANT-SCOPED: proibido pedir localização / "finalizar cadastro" ──
    // Ativado apenas quando orbit_ai_config.block_location_collection = true.
    const blockLocationCollection = (aiConfig as any).block_location_collection === true;
    if (blockLocationCollection && detectLocationCollection(resposta).violates) {
      console.warn("[orbit-ai-agent] Guard de coleta de localização acionado.");
      const retryLoc = await callAnthropic({
        model: normalizeAgentModel((aiConfig as any).modelo_ia),
        system: systemPrompt,
        messages: toAnthropicMessages([
          { role: "user", content: userTurn },
          { role: "assistant", content: resposta },
          { role: "user", content: LOCATION_GUARD_CORRECTIVE + " Responda apenas com a nova mensagem final ao cliente, sem JSON." },
        ]),
        temperature: 0.5,
        max_tokens: maxTokens,
      });
      const retryLocText = retryLoc.ok ? String(retryLoc.text || "").trim() : "";
      if (retryLocText && !detectLocationCollection(retryLocText).violates) {
        resposta = retryLocText;
      } else {
        const enforcedLoc = enforceNoLocationCollection(retryLocText || resposta, true);
        resposta = enforcedLoc.text;
        console.warn("[orbit-ai-agent] Coleta de localização sanitizada.", { fallback: enforcedLoc.fallbackUsed });
      }
      parsed.mensagem = resposta;
    }

    // ── GUARD TENANT-SCOPED: identidade única (proibida falsa transferência) ──
    // Ativado apenas quando orbit_ai_config.block_identity_split = true.
    if (blockIdentitySplit && detectIdentitySplit(resposta, identityCtx).violates) {
      console.warn("[orbit-ai-agent] Guard de identidade acionado.", {
        handoffAllowed: identityCtx.leadAskedHuman || identityCtx.humanTalk || identityCtx.handoffAuthorized,
      });
      const retryId = await callAnthropic({
        model: normalizeAgentModel((aiConfig as any).modelo_ia),
        system: systemPrompt,
        messages: toAnthropicMessages([
          { role: "user", content: userTurn },
          { role: "assistant", content: resposta },
          { role: "user", content: IDENTITY_GUARD_CORRECTIVE + " Responda apenas com a nova mensagem final ao cliente, sem JSON." },
        ]),
        temperature: 0.5,
        max_tokens: maxTokens,
      });
      const retryIdText = retryId.ok ? String(retryId.text || "").trim() : "";
      if (retryIdText && !detectIdentitySplit(retryIdText, identityCtx).violates) {
        resposta = retryIdText;
      } else {
        const enforcedId = enforceNoIdentitySplit(retryIdText || resposta, true, identityCtx);
        resposta = enforcedId.text;
        console.warn("[orbit-ai-agent] Falsa transferência sanitizada.", { fallback: enforcedId.fallbackUsed });
      }
      parsed.mensagem = resposta;
    }

    // ── GUARD TENANT-SCOPED: sem autoapresentação artificial ──
    // Ativado apenas quando orbit_ai_config.self_introduction_guard.enabled = true.
    if (selfIntroCfg && detectSelfIntroduction(resposta, selfIntroCfg).violates) {
      console.warn("[orbit-ai-agent] Guard de autoapresentação acionado.");
      const retryIntro = await callAnthropic({
        model: normalizeAgentModel((aiConfig as any).modelo_ia),
        system: systemPrompt,
        messages: toAnthropicMessages([
          { role: "user", content: userTurn },
          { role: "assistant", content: resposta },
          { role: "user", content: SELF_INTRO_CORRECTIVE + " Responda apenas com a nova mensagem final ao cliente, sem JSON." },
        ]),
        temperature: 0.5,
        max_tokens: maxTokens,
      });
      const retryIntroText = retryIntro.ok ? String(retryIntro.text || "").trim() : "";
      if (retryIntroText && !detectSelfIntroduction(retryIntroText, selfIntroCfg).violates) {
        resposta = retryIntroText;
      } else {
        const enforcedIntro = enforceNoSelfIntroduction(retryIntroText || resposta, selfIntroCfg);
        resposta = enforcedIntro.text;
        console.warn("[orbit-ai-agent] Autoapresentação sanitizada.", { fallback: enforcedIntro.fallbackUsed });
      }
      parsed.mensagem = resposta;
    }

    // ── GUARD TENANT-SCOPED: sem benefício falso (IA entregue / grupo) ──
    // Ativado apenas quando orbit_ai_config.false_benefits_guard.enabled = true.
    if (falseBenefitsCfg && detectFalseBenefits(resposta).violates) {
      console.warn("[orbit-ai-agent] Guard de benefício falso acionado.", {
        kinds: detectFalseBenefits(resposta).kinds,
      });
      const retryFb = await callAnthropic({
        model: normalizeAgentModel((aiConfig as any).modelo_ia),
        system: systemPrompt,
        messages: toAnthropicMessages([
          { role: "user", content: userTurn },
          { role: "assistant", content: resposta },
          { role: "user", content: FALSE_BENEFITS_CORRECTIVE + " Responda apenas com a nova mensagem final ao cliente, sem JSON." },
        ]),
        temperature: 0.5,
        max_tokens: maxTokens,
      });
      const retryFbText = retryFb.ok ? String(retryFb.text || "").trim() : "";
      if (retryFbText && !detectFalseBenefits(retryFbText).violates) {
        resposta = retryFbText;
      } else {
        const enforcedFb = enforceNoFalseBenefits(retryFbText || resposta, true);
        resposta = enforcedFb.text;
        console.warn("[orbit-ai-agent] Promessa falsa sanitizada.", { fallback: enforcedFb.fallbackUsed });
      }
      parsed.mensagem = resposta;
    }






    // ── GUARD TENANT-SCOPED: estágio comercial (preço/pagamento/fechamento) ──
    // Ativado apenas quando orbit_ai_config.strict_commercial_stage_guard = true.
    // A mensagem ATUAL do lead precisa autorizar o avanço: dado cadastral
    // isolado (e-mail/telefone) nunca é sinal comercial. Histórico não autoriza.
    // v2 (permissões independentes) tem precedência sobre o guard legado.
    const strictCommercialStageGuard =
      (aiConfig as any).strict_commercial_stage_guard === true && !commercialV2Enabled;

    if (commercialV2Enabled && commercialPerms) {
      const verdict = evaluateCommercialV2(resposta, commercialPerms);
      if (verdict.violates) {
        console.warn("[orbit-ai-agent] Condução comercial v2 acionada:", verdict.reasons.join(","));
        const retry = await callAnthropic({
          model: normalizeAgentModel((aiConfig as any).modelo_ia),
          system: systemPrompt,
          messages: toAnthropicMessages([
            { role: "user", content: userTurn },
            { role: "assistant", content: resposta },
            { role: "user", content: buildCommercialV2Corrective(verdict) + " Responda apenas com a nova mensagem final ao cliente, sem JSON." },
          ]),
          temperature: 0.5,
          max_tokens: maxTokens,
        });
        const retryText = retry.ok ? String(retry.text || "").trim() : "";
        const retryVerdict = retryText ? evaluateCommercialV2(retryText, commercialPerms) : null;
        if (retryText && retryVerdict && !retryVerdict.violates) {
          resposta = retryText;
        } else {
          // Sanitização cirúrgica: remove só o que não é permitido.
          // Preço obrigatório nunca é apagado.
          const enforced = sanitizeCommercialV2(retryText || resposta, commercialPerms);
          resposta = enforced.text;
          const enforcedVerdict = evaluateCommercialV2(resposta, commercialPerms);
          if (
            enforcedVerdict.reasons.includes("price_omitted_when_required") &&
            requiredCommercialPriceLine
          ) {
            // Fail-safe determinístico: quando o preço é obrigatório, nunca
            // dependemos de uma segunda resposta correta do modelo.
            resposta = `O investimento é ${requiredCommercialPriceLine}.`;
          }
          console.warn("[orbit-ai-agent] Condução comercial v2 sanitizada.", {
            fallback: enforced.fallbackUsed,
            reasons: verdict.reasons,
          });
        }
        parsed.mensagem = resposta;
      }
    } else if (strictCommercialStageGuard) {
      const verdict = evaluateCommercialStage(mensagemAgregada, resposta);
      if (verdict.violates) {
        console.warn("[orbit-ai-agent] Guard de estágio comercial acionado:", verdict.reason);
        const retry = await callAnthropic({
          model: normalizeAgentModel((aiConfig as any).modelo_ia),
          system: systemPrompt,
          messages: toAnthropicMessages([
            { role: "user", content: userTurn },
            { role: "assistant", content: resposta },
            { role: "user", content: buildCommercialCorrective(verdict) + " Responda apenas com a nova mensagem final ao cliente, sem JSON." },
          ]),
          temperature: 0.5,
          max_tokens: maxTokens,
        });
        const retryText = retry.ok ? String(retry.text || "").trim() : "";
        if (retryText && !evaluateCommercialStage(mensagemAgregada, retryText).violates) {
          resposta = retryText;
        } else {
          const enforced = enforceCommercialStage(mensagemAgregada, retryText || resposta, true);
          resposta = enforced.text;
          console.warn("[orbit-ai-agent] Avanço comercial sanitizado.", { fallback: enforced.fallbackUsed });
        }
        parsed.mensagem = resposta;
      }
    }

    // ── GUARD TENANT-SCOPED: trava de oferta principal (anti-cardápio/downsell) ──
    if (primaryOfferCfg && primaryOfferPerm) {
      const offerVerdict = evaluateSecondaryOfferV2(resposta, primaryOfferCfg, primaryOfferPerm);
      if (offerVerdict.violates) {
        console.warn("[orbit-ai-agent] Trava de oferta principal acionada.", {
          reason: primaryOfferPerm.reason,
          reasons: offerVerdict.reasons.join(","),
          clauses: offerVerdict.offending.length,
        });
        const retryOffer = await callAnthropic({
          model: normalizeAgentModel((aiConfig as any).modelo_ia),
          system: systemPrompt,
          messages: toAnthropicMessages([
            { role: "user", content: userTurn },
            { role: "assistant", content: resposta },
            { role: "user", content: buildSecondaryOfferCorrectiveV2(primaryOfferCfg, primaryOfferPerm, offerVerdict) + " Responda apenas com a nova mensagem final ao cliente, sem JSON." },
          ]),
          temperature: 0.5,
          max_tokens: maxTokens,
        });
        const retryOfferText = retryOffer.ok ? String(retryOffer.text || "").trim() : "";
        if (retryOfferText && !evaluateSecondaryOfferV2(retryOfferText, primaryOfferCfg, primaryOfferPerm).violates) {
          resposta = retryOfferText;
        } else {
          const enforcedOffer = sanitizeSecondaryOfferV2(retryOfferText || resposta, primaryOfferCfg, primaryOfferPerm);
          resposta = enforcedOffer.text;
          console.warn("[orbit-ai-agent] Oferta secundária sanitizada.", { fallback: enforcedOffer.fallbackUsed });
        }
        parsed.mensagem = resposta;
      }
    }







    // ── Validar dados extraídos antes de salvar ──
    const dadosValidados = parsed.dados_extraidos 
      ? validateExtractedData(parsed.dados_extraidos) 
      : {};

    // ── Calcular próximo estado da conversa ──
    // Handoff APENAS quando há sinal comercial real: agendamento de call, venda ou pedido explícito de humano.
    let intencaoNormalizada = String(parsed.intencao || "outro");
    if (
      aiConfig.scheduling_mode === "human_handoff_after_period" &&
      aiContexto?.agendamento_aguardando_periodo === true &&
      normalizePreferredPeriod(parsed.agendamento?.periodo_preferido || mensagemAgregada)
    ) {
      // O modelo pode classificar uma resposta curta como "a tarde" como outro.
      // O contexto pendente torna a intenção de agendamento determinística.
      intencaoNormalizada = "agendar_call";
    }
    // Tenant com identidade única: "falar_humano" só vale com pedido explícito do
    // lead ou conversa já assumida por pessoa. Sem isso, o modelo não pode criar
    // handoff fantasma a partir de uma dúvida comum.
    if (
      blockIdentitySplit &&
      intencaoNormalizada === "falar_humano" &&
      !identityCtx.leadAskedHuman &&
      identityCtx.humanTalk !== true
    ) {
      console.warn("[orbit-ai-agent] falar_humano descartado: lead não pediu atendimento humano.");
      intencaoNormalizada = "duvida";
    }

    // O LLM não tem autoridade para transformar "PIX"/"cartão" isolado em
    // venda. Exigimos fechamento explícito ou a sequência comprovada:
    // preço informado -> intenção de fechar -> pergunta da forma -> escolha.
    if (
      commercialV2Enabled &&
      commercialPerms &&
      intencaoNormalizada === "venda_fechada" &&
      !isCommercialSaleHandoffAuthorized(commercialExtracted, commercialState, commercialPerms)
    ) {
      console.warn("[orbit-ai-agent] venda_fechada descartada: sequência comercial não comprovada.");
      intencaoNormalizada = "duvida";
    }
    parsed.intencao = intencaoNormalizada;

    // Na Bullink, somente uma intenção de compra determinística autoriza o
    // alerta interno. O rótulo do modelo nunca é autoridade isolada.
    const bullinkVerifiedPurchaseIntent = isBullinkTenant(empresaId) &&
      commercialV2Enabled && commercialPerms?.verifiedPurchaseIntent === true;
    const isCommercialSignal =
      intencaoNormalizada === "agendar_call" ||
      intencaoNormalizada === "venda_fechada" ||
      intencaoNormalizada === "falar_humano" ||
      bullinkVerifiedPurchaseIntent;

    // Handoff humano real: só com pedido explícito do lead, conversa assumida por
    // humano, ou intenção que exige ação humana externa (venda/agendamento).
    identityCtx.handoffAuthorized = isCommercialSignal;



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
      awaiting_period?: boolean;
      preferred_period?: string | null;
      handoff_ready?: boolean;
    } = { handled: false };
    if (intencaoNormalizada === "agendar_call" && empresaId) {
      const schedulingDecision = resolveTenantSchedulingDecision({
        mode: aiConfig.scheduling_mode,
        message: mensagemAgregada,
        parsedPeriod: parsed.agendamento?.periodo_preferido,
        awaitingPeriod: aiContexto?.agendamento_aguardando_periodo === true,
        handoffMessage: aiConfig.scheduling_handoff_message,
      });
      if (schedulingDecision.mode === "human_handoff_after_period") {
        scheduleOutcome = schedulingDecision;
      } else {
        try {
          if (!await renewExecutionLease()) return leaseLostResponse();
          scheduleOutcome = await tryAutoScheduleMeeting(supabase, {
            empresaId,
            prospect,
            prospect_id,
            conversa_id,
            telefone,
            mensagem_cliente: mensagemAgregada,
            sugestoes_anteriores: Array.isArray(aiContexto?.agendamento_sugestoes) ? aiContexto.agendamento_sugestoes : [],
            agendamento: {
              ...(parsed.agendamento || {}),
              duracao_min: parsed.agendamento?.duracao_min || aiConfig.scheduling_meeting_duration_minutes || 60,
            },
          });
        } catch (schedErr) {
          console.error("[orbit-ai-agent] tryAutoScheduleMeeting erro:", schedErr);
          scheduleOutcome = { handled: false, error: (schedErr as Error).message };
        }
      }
      if (scheduleOutcome.response_override) {
        // Override de agenda também passa pela validação/normalização final.
        resposta = finalizeAgentMessage(scheduleOutcome.response_override, primeiraInteracao);
      }
    }

    // Só fazer handoff se NÃO houve auto-agendamento resolvido pela IA. Na
    // Bullink, aceite/forma de pagamento permanecem com a IA; o handoff seguro
    // já existente acontece quando o comprovante é recebido. Se a configuração
    // oficial estiver incompleta, falhamos para o comportamento humano anterior.
    const suppressHandoff = scheduleOutcome.handled === true;
    const deferBullinkCheckoutHandoff = shouldDeferBullinkSaleHandoff({
      empresaId,
      intent: bullinkVerifiedPurchaseIntent ? "venda_fechada" : intencaoNormalizada,
      officialPixKey: bullinkOfficialPixKey,
      officialCardUrl: bullinkOfficialCardUrl,
    });
    const isHandoff = isCommercialSignal && !suppressHandoff && !deferBullinkCheckoutHandoff;
    const quoteReadiness = comunicaQuoteReady({
      empresaId,
      collectingQuote: parsed.iniciar_coleta_orcamento === true || emColetaOrcamento,
      baseRegistrationComplete: cadastroCompleto,
      fields: camposQualificacao,
      existingAnswers: dadosAdicionais,
      collectedAnswers: camposColetados,
      extractedAnswers: parsed.dados_adicionais,
    });
    const effectiveCadastroCompleto = empresaId === COMUNICA_EMPRESA_ID
      ? quoteReadiness.ready
      : (parsed.cadastro_completo || false);
    const nextState = computeNextState(
      leadContext.conversation.state,
      intencaoNormalizada,
      effectiveCadastroCompleto,
      false, // handoff será determinado abaixo
      msgClassification
    );

    // ── Notificação comercial: sinal explícito ou orçamento completo da Comunica ──
    const alreadyNotified = aiContexto.commercial_notified === true;
    const quoteReadySignal = empresaId === COMUNICA_EMPRESA_ID && quoteReadiness.ready;
    const notificationPolicy = resolveCommercialNotificationPolicy({
      empresaId,
      commercialV2Enabled,
      verifiedPurchaseIntent: commercialPerms?.verifiedPurchaseIntent === true,
      genericCommercialSignal: isCommercialSignal,
      quoteReadySignal,
      genericClassification: intencaoNormalizada,
      alreadyNotified,
      suppressHandoff,
      scheduleHandoffReady: scheduleOutcome.handoff_ready === true,
    });
    const shouldNotifyCommercial = notificationPolicy.shouldNotify;
    let notificationAttempted = false;
    let notificationSent = false;
    if (shouldNotifyCommercial) {
      if (!await renewExecutionLease()) return leaseLostResponse();
      notificationAttempted = true;
      const notificationClassification = notificationPolicy.classification;
      console.log("[orbit-ai-agent] Sinal comercial detectado:", notificationClassification, "— notificando responsável...");
      const notificationResult = await notifyCommercialHumanDetected(supabase, {
        prospect,
        telefone_lead: telefone,
        mensagem: mensagemAgregada,
        classification: notificationClassification,
        empresa_id: empresaId || null,
        isDemo,
      });
      notificationSent = notificationResult.sent;
      if (!notificationSent) {
        console.warn("[orbit-ai-agent] Notificação comercial não confirmada:", notificationResult.reason || "unknown");
      }
    }


    const canonicalValidatedFields = canonicalFactsToCollectedFields(hydrateCanonicalFacts({
      aiContexto: { campos_coletados: dadosValidados },
      tenantAliases: (aiConfig as any).canonical_field_aliases,
    }));

    // Atualizar contexto da conversa com estado e classificação
    const novoContexto = {
      ...aiContexto,
      estado: isHandoff ? "handoff" : (scheduleOutcome.created ? "qualificado" : nextState),
      em_coleta_orcamento: parsed.iniciar_coleta_orcamento || emColetaOrcamento,
      campos_coletados: {
        ...camposColetados,
        ...dadosValidados,
        ...canonicalFactsToCollectedFields(canonicalFacts),
        ...canonicalValidatedFields,
      },
      cadastro_completo: effectiveCadastroCompleto,
      ultima_intencao: intencaoNormalizada,
      intro_already_sent: introAlreadySent || primeiraInteracao,
      // Campos de classificação
      message_classification: msgClassification,
      human_detected: aiContexto.human_detected || msgClassification === "human_probable",
      auto_reply_detected: aiContexto.auto_reply_detected || msgClassification === "auto_reply",
      commercial_notified: alreadyNotified || notificationSent,
      first_human_response_at: (!aiContexto.first_human_response_at && msgClassification === "human_probable")
        ? new Date().toISOString()
        : aiContexto.first_human_response_at || null,
      // Sugestões de horário pendentes para a próxima resposta do lead
      agendamento_sugestoes: scheduleOutcome.suggestions && scheduleOutcome.suggestions.length
        ? scheduleOutcome.suggestions
        : (scheduleOutcome.created ? [] : (aiContexto.agendamento_sugestoes ?? [])),
      agendamento_ultimo_meeting_id: scheduleOutcome.meeting_id || aiContexto.agendamento_ultimo_meeting_id || null,
      agendamento_aguardando_periodo: scheduleOutcome.awaiting_period === true,
      agendamento_periodo_preferido: scheduleOutcome.preferred_period || aiContexto.agendamento_periodo_preferido || null,
      // Estado flexível da condução comercial v2 (sem PII: apenas rótulos e timestamps)
      ...(commercialV2Enabled && commercialPerms
        ? {
            commercial_v2: updateCommercialState(
              commercialState,
              commercialExtracted,
              String(parsed.mensagem || resposta || ""),
              commercialPerms,
              commercialTurnTimestamp,
              // Tenant com identidade única: a explicação da oferta na própria
              // resposta do agente já marca product_explained (idempotente).
              {
                detectExplanationInReply: blockIdentitySplit,
                authoritativeBudgetObjection:
                  authoritativeBullinkBudgetObjection,
              },
            ),
          }
        : {}),
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
        whatsapp_override: scheduleOutcome.handoff_ready ? aiConfig.scheduling_handoff_whatsapp : null,
      });
    }

    // ── Prova social: pedido explícito, aceite curto após oferta, ou decisão do agente ──
    // Sempre enfileirado (nunca chamada direta à Z-API). O envio real continua
    // barrado pelo kill switch global do tenant enquanto envio_real_liberado=false.
    // Se a intenção existe mas a mídia não foi enfileirada, removemos a promessa
    // de mídia do texto para não deixar legenda órfã.
    if (!isDemo && empresaId) {
      try {
        // OUT imediatamente anterior da MESMA empresa+conversa, com status real.
        const { data: lastOut } = await supabase
          .from("orbit_mensagens")
          .select("mensagem, status")
          .eq("conversa_id", conversa_id)
          .eq("empresa_id", empresaId)
          .eq("direcao", "OUT")
          .order("timestamp", { ascending: false })
          .limit(1)
          .maybeSingle();

        const proof = await maybeQueueProofMedia(supabase, {
          empresa_id: empresaId,
          conversa_id,
          prospect_id,
          mensagem_lead: mensagem,
          previous_out: lastOut
            ? { mensagem: (lastOut as any).mensagem ?? null, status: (lastOut as any).status ?? null }
            : null,
          agent_decision: readAgentProofDecision(parsed),
        });

        if (proof.intent && !proof.queued) {
          console.warn("[orbit-ai-agent] prova social não enfileirada:", proof.reason);
          resposta = stripUnfulfilledMediaPromise(resposta);
        }
        if (!proof.intent) {
          // Sem evidência determinística: nunca deixar promessa de mídia órfã.
          resposta = stripUnfulfilledMediaPromise(resposta);
        }
      } catch (e) {
        console.warn("[orbit-ai-agent] prova social falhou:", (e as Error).message);
        resposta = stripUnfulfilledMediaPromise(resposta);
      }
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


    // Sanitização final determinística (cobre overrides posteriores do texto).
    {
      const finalEnforced = enforceNoEmailCollection(resposta, blockEmailCollection);
      if (finalEnforced.changed) {
        console.warn("[orbit-ai-agent] Coleta de e-mail removida na saída final.", { fallback: finalEnforced.fallbackUsed });
        resposta = finalEnforced.text;
      }
      const finalLoc = enforceNoLocationCollection(resposta, blockLocationCollection);
      if (finalLoc.changed) {
        console.warn("[orbit-ai-agent] Coleta de localização removida na saída final.", { fallback: finalLoc.fallbackUsed });
        resposta = finalLoc.text;
      }
      const finalIdentity = enforceNoIdentitySplit(resposta, blockIdentitySplit, identityCtx);
      if (finalIdentity.changed) {
        console.warn("[orbit-ai-agent] Falsa transferência removida na saída final.", { fallback: finalIdentity.fallbackUsed });
        resposta = finalIdentity.text;
      }
      const finalFalseBenefits = enforceNoFalseBenefits(resposta, falseBenefitsCfg !== null);
      if (finalFalseBenefits.changed) {
        console.warn("[orbit-ai-agent] Promessa falsa removida na saída final.", { fallback: finalFalseBenefits.fallbackUsed });
        resposta = finalFalseBenefits.text;
      }
      const finalSelfIntro = enforceNoSelfIntroduction(resposta, selfIntroCfg);
      if (finalSelfIntro.changed) {
        console.warn("[orbit-ai-agent] Autoapresentação removida na saída final.", { fallback: finalSelfIntro.fallbackUsed });
        resposta = finalSelfIntro.text;
      }
      if (commercialV2Enabled && commercialPerms) {
        const finalV2 = sanitizeCommercialV2(resposta, commercialPerms);
        if (finalV2.changed) {
          console.warn("[orbit-ai-agent] Condução comercial v2: saída final sanitizada.", {
            fallback: finalV2.fallbackUsed,
          });
          resposta = finalV2.text;
        }
        const finalVerdict = evaluateCommercialV2(resposta, commercialPerms);
        if (
          finalVerdict.reasons.includes("price_omitted_when_required") &&
          requiredCommercialPriceLine
        ) {
          console.warn("[orbit-ai-agent] Preço obrigatório restaurado na última barreira.");
          resposta = `O investimento é ${requiredCommercialPriceLine}.`;
        }
      } else {
        const finalStage = enforceCommercialStage(mensagemAgregada, resposta, strictCommercialStageGuard);
        if (finalStage.changed) {
          console.warn("[orbit-ai-agent] Avanço comercial removido na saída final.", {
            reason: finalStage.verdict.reason,
            fallback: finalStage.fallbackUsed,
          });
          resposta = finalStage.text;
        }
      }
      if (primaryOfferCfg && primaryOfferPerm) {
        const finalOffer = sanitizeSecondaryOfferV2(resposta, primaryOfferCfg, primaryOfferPerm);
        if (finalOffer.changed) {
          console.warn("[orbit-ai-agent] Trava de oferta principal: saída final sanitizada.", {
            fallback: finalOffer.fallbackUsed,
            reason: primaryOfferPerm.reason,
          });
          resposta = finalOffer.text;
        }
      }



    }


    // Última barreira comercial/conversacional exclusiva do Bullink.
    // Para qualquer outro empresa_id, retorna o texto byte-for-byte.
    const finalBullink = enforceBullinkConversationGuard({
      empresaId,
      inbound: mensagemAgregada,
      response: resposta,
      previousAgentQuestions,
      recentMessages: mensagens || [],
      commercialState: {
        ...commercialState,
        product_focus: commercialProductInFocus ?? commercialState.product_focus,
        ...(isBullinkTenant(empresaId)
          ? {
              budget_objection:
                authoritativeBullinkBudgetObjection === true,
              budget_objection_verified:
                authoritativeBullinkBudgetObjection === true,
            }
          : {}),
      },
      officialPixKey: bullinkOfficialPixKey,
      officialCardUrl: bullinkOfficialCardUrl,
    });
    if (finalBullink.changed) {
      console.warn("[orbit-ai-agent] Reforço conversacional Bullink acionado.", {
        reasons: finalBullink.reasons,
      });
      resposta = finalBullink.text;
    }

    const finalComunica = enforceComunicaNotificationTruth({
      empresaId,
      response: resposta,
      quoteReady: quoteReadiness.ready,
      notificationAttempted,
      notificationSent,
      alreadyNotified,
      nextMissingLabel: quoteReadiness.missing[0]?.label ?? null,
    });
    if (finalComunica.changed) {
      console.warn("[orbit-ai-agent] Barreira de notificação Comunica acionada:", finalComunica.reason);
      resposta = finalComunica.text;
      parsed.mensagem = resposta;
    }

    // Os guards finais podem trocar produto, inserir o preço oficial ou remover
    // um avanço indevido. O estado comercial precisa refletir exatamente o texto
    // que será enviado — nunca a versão anterior produzida pelo modelo.
    parsed.mensagem = resposta;
    if (commercialV2Enabled && commercialPerms) {
      const finalCommercialState = updateCommercialState(
        commercialState,
        commercialExtracted,
        resposta,
        commercialPerms,
        commercialTurnTimestamp,
        {
          detectExplanationInReply: blockIdentitySplit,
          authoritativeBudgetObjection: authoritativeBullinkBudgetObjection,
        },
      );
      const persistedCommercialState = (novoContexto as any).commercial_v2;
      if (JSON.stringify(finalCommercialState) !== JSON.stringify(persistedCommercialState)) {
        (novoContexto as any).commercial_v2 = finalCommercialState;
        const { error: finalStateError } = await supabase
          .from("orbit_conversas")
          .update({ ai_contexto: novoContexto })
          .eq("id", conversa_id)
          .eq("empresa_id", empresaId);
        if (finalStateError) {
          throw new Error(`Falha ao persistir estado comercial final: ${finalStateError.message}`);
        }
      }
    }

    // Enviar resposta via WhatsApp (fallback: texto)
    if (suppressReply || !resposta.trim() || looksLikeInternalPayload(resposta)) {
      console.warn("[orbit-ai-agent] Envio suprimido:", suppressReply || "empty_or_structured_output");
      return new Response(
        JSON.stringify({ ok: true, suppressed: true, reason: suppressReply || "empty_or_structured_output", state: novoContexto.estado }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!await renewExecutionLease()) {
      return leaseLostResponse();
    }
    // Última barreira, imediatamente antes do enqueue/envio: reconsulta o banco
    // para cobrir corrida de relógio, cancelamento ou alteração enquanto o LLM rodava.
    if (empresaId === VIVER_EMPRESA_ID) {
      const classGuard = enforceCanonicalClassLink(
        resposta,
        viverClassTemplateBody,
        prospect?.nome_contato || prospect?.nome_razao,
      );
      if (classGuard.changed) {
        console.warn("[orbit-ai-agent] Link não autoritativo da aula Viver bloqueado:", classGuard.reason);
        resposta = classGuard.text;
        parsed.mensagem = resposta;
      }
      const { data: freshMeetingRows, error: freshMeetingError } = await supabase
        .from("orbit_meetings")
        .select("id, scheduled_at, duration_minutes, status, meeting_url")
        .eq("empresa_id", empresaId)
        .eq("conversa_id", conversa_id)
        .order("scheduled_at", { ascending: true });
      if (freshMeetingError) console.error("[orbit-ai-agent] Revalidação final da reunião Viver falhou:", freshMeetingError);
      const freshAuthority = freshMeetingError
        ? null
        : selectAuthoritativeMeeting((freshMeetingRows || []) as MeetingRow[], new Date());
      const meetingGuard = enforceFreshMeetingState(resposta, freshAuthority, {
        latestInboundAskedForLink: inboundExplicitlyRequestsMeetingLink(mensagemAgregada),
        revalidationFailed: Boolean(freshMeetingError),
      });
      if (meetingGuard.changed) {
        console.warn("[orbit-ai-agent] Referência futura/link de reunião bloqueada após revalidação:", meetingGuard.reason);
        resposta = meetingGuard.text;
        parsed.mensagem = resposta;
      }
      if (freshMeetingError && !mentionsAgendaContent(resposta)) {
        console.log("[orbit-ai-agent] Resposta sem conteúdo de agenda preservada apesar da falha transitória.");
      }
    }
    const singleQuestion = enforceSingleQuestion(resposta);
    if (singleQuestion.changed) {
      console.warn("[orbit-ai-agent] Barreira global de pergunta única acionada:", {
        removed_questions: singleQuestion.removedQuestions,
      });
      resposta = singleQuestion.text;
      parsed.mensagem = resposta;
    }
    await sendAIResponse(supabase, telefone, resposta, conversa_id, isDemo, empresaId, aiConfig, primeiraInteracao);


    return new Response(JSON.stringify({ ok: true, resposta, parsed, state: novoContexto.estado, simulated: isDemo }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
    } catch (innerError) {
      executionOutcomeForCleanup = "error";
      throw innerError;
    } finally {
      // ── UNLOCK: sempre resetar ai_processing (best effort) ──
      try {
        await supabase
          .from("orbit_conversas")
          .update({ ai_processing: false })
          .eq("id", conversa_id)
          .eq("empresa_id", empresaIdForCleanup);
        console.log("[orbit-ai-agent] Lock liberado para conversa:", conversa_id);
      } catch (unlockErr) {
        console.error("[orbit-ai-agent] Falha ao liberar lock no finally:", unlockErr);
      }
      if (executionClaimForCleanup) {
        try {
          const { data: finishRows } = await supabase.rpc("finish_orbit_ai_execution", {
            _claim_id: executionClaimForCleanup.id,
            _lease_token: executionClaimForCleanup.lease_token,
            _status: executionOutcomeForCleanup,
            _result: executionOutcomeForCleanup === "error" ? "runtime_error" : "released",
          });
          const finishResult = Array.isArray(finishRows) ? finishRows[0] : finishRows;
          if (finishResult?.finished && finishResult?.next_inbound_message_id && drainContext) {
            const drainPromise = fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/orbit-ai-agent`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                "x-orbit-internal-secret": Deno.env.get("ORBIT_AI_AGENT_SECRET") ?? "",
              },
              body: JSON.stringify({
                ...drainContext,
                mensagem: "",
                inbound_message_id: finishResult.next_inbound_message_id,
              }),
            }).then((response) => {
              if (!response.ok) console.warn("[orbit-ai-agent] queued inbound drain deferred", { status: response.status });
            }).catch(() => console.warn("[orbit-ai-agent] queued inbound drain deferred", { reason: "invoke_failed" }));
            // A resposta de A não aguarda B. Em runtime Supabase, waitUntil mantém
            // apenas o trabalho de background vivo; o tick persistente cobre falhas.
            // @ts-ignore EdgeRuntime é fornecido pelo Supabase Edge Runtime.
            if (typeof EdgeRuntime !== "undefined") {
              // @ts-ignore EdgeRuntime é fornecido pelo Supabase Edge Runtime.
              EdgeRuntime.waitUntil(drainPromise);
            }
          }
        } catch { /* best effort */ }
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
          .eq("id", conversaIdForCleanup)
          .eq("empresa_id", empresaIdForCleanup);
        console.log("[orbit-ai-agent] Lock liberado no catch para:", conversaIdForCleanup);
      } catch (cleanupErr) {
        console.error("[orbit-ai-agent] Falha no cleanup do lock:", cleanupErr);
      }
    }
    return new Response(JSON.stringify({ error: "internal_error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } finally {
    if (conversaIdForCleanup) {
      RECOVERY_TAGS.delete(conversaIdForCleanup);
      OUTBOX_HOLDS.delete(conversaIdForCleanup);
    }
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
  whatsapp_override?: string | null;
}

async function handleSellerHandoff(supabase: any, params: HandoffParams) {
  const { conversa_id, prospect_id, prospect, vendedor_id, empresa_id, mensagem_lead, telefone_lead, isDemo, whatsapp_override } = params;

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

    // Destinatário do resumo: override explícito do fluxo de agendamento OU
    // configuração de notificação interna do MESMO tenant (nunca canário/hardcode).
    const overrideTarget = isValidNotificationPhone(whatsapp_override)
      ? { phone: normalizeE164Digits(whatsapp_override), source: "ai_config_scheduling_handoff" as const }
      : await resolveInternalNotificationTarget(supabase, empresa_id, { vendedorId: vendedor_id });

    const vendedorWhatsapp = overrideTarget.phone;
    if (!vendedorWhatsapp) {
      console.log("[orbit-ai-agent] Tenant sem destinatário de notificação interna, handoff não enviado", { empresa_id });
      await supabase.from("orbit_handoffs").insert({
        empresa_id,
        conversa_id,
        prospect_id,
        vendedor_id,
        resumo: "Tenant sem telefone de notificação interna configurado",
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

    const vendedorPhone = vendedorWhatsapp;

    if (isDemo) {
      console.log("[orbit-ai-agent] Demo mode — handoff simulado para vendedor:", vendedorPhone);
      await supabase.from("orbit_handoffs").update({ status: "sent", sent_at: new Date().toISOString() }).eq("id", handoff.id);
    } else {
      const zapiConfig = await getOrbitZapiRuntimeConfig(supabase, empresa_id);
      const handoffBlockReason = getOrbitZapiRealSendBlockReason(zapiConfig, vendedorPhone);
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

/**
 * Recovery tag (opt-in, apenas chamadas internas autenticadas).
 *
 * Quando uma resposta legítima foi substituída por um fallback (ex.: fallback de
 * fora do horário) e precisa ser recuperada, o job oficial passa um
 * `recovery_tag`. Ele entra como `idempotency_scope` do enqueue de ai_reply,
 * garantindo que a nova resposta NÃO colida com a chave determinística já usada
 * pelo fallback, e que reexecuções do mesmo recovery permaneçam idempotentes.
 * Escopo por conversa; sempre limpo no finally do request.
 */
const RECOVERY_TAGS = new Map<string, string>();
export function sanitizeRecoveryTag(tag: unknown): string | null {
  if (typeof tag !== "string") return null;
  const t = tag.trim();
  return /^[a-z0-9][a-z0-9_-]{2,39}$/i.test(t) ? t : null;
}

/**
 * Hold de envio (opt-in, apenas chamadas internas autenticadas).
 *
 * Permite que uma operação oficial (ex.: recuperação cirúrgica com cadência
 * controlada) enfileire a resposta com `scheduled_for` no futuro, de modo que o
 * worker NÃO envie antes da validação/cadência definida pelo operador.
 * Nunca relaxa nenhum gate: apenas atrasa a elegibilidade temporal.
 * Limite máximo: 24h à frente. Escopo por conversa; limpo no finally.
 */
const OUTBOX_HOLDS = new Map<string, string>();
export function sanitizeOutboxHoldUntil(value: unknown, nowMs = Date.now()): string | null {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value.trim());
  if (!Number.isFinite(ms)) return null;
  if (ms <= nowMs) return null;
  if (ms - nowMs > 24 * 60 * 60 * 1000) return null;
  return new Date(ms).toISOString();
}


async function sendWhatsAppMessage(supabase: any, telefone: string, mensagemRaw: string, conversa_id: string, isDemo: boolean, empresaId?: string | null, allowIntro = true) {
  const mensagem = finalizeAgentMessage(mensagemRaw, allowIntro);
  try {
    // Revalidação comum e fail-closed imediatamente antes de qualquer efeito.
    // Cobre tanto o adapter/outbox quanto o caminho legado de envio direto.
    const { data: currentConv, error: ownershipError } = await supabase
      .from("orbit_conversas")
      .select("id, empresa_id, prospect_id, human_talk, human_user_id")
      .eq("id", conversa_id)
      .maybeSingle();
    const ownership = ownershipError
      ? { allowed: false as const, reason: "conversation_missing" as const }
      : decideAutomaticReplyOwnership(currentConv, empresaId);
    if (!ownership.allowed) {
      console.log("[orbit-ai-agent] resposta automática abortada por posse atual", {
        conversa_id,
        reason: ownership.reason,
      });
      await supabase.from("orbit_conversas")
        .update({ ai_processing: false })
        .eq("id", conversa_id);
      return;
    }

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
      const recoveryTag = RECOVERY_TAGS.get(conversa_id) ?? null;
      const holdUntilQueued = OUTBOX_HOLDS.get(conversa_id) ?? null;
      const routed = await enqueueOutbox(supabase, {
        empresa_id: empresaId,
        conversa_id,
        prospect_id: (currentConv as any)?.prospect_id ?? null,
        source_type: "ai_reply",
        inbound_message_id: `${inboundId}:text`,
        source_id: inboundId,
        payload_type: "text",
        payload: { mensagem },
        idempotency_scope: recoveryTag,
        ...(holdUntilQueued ? { scheduled_for: holdUntilQueued } : {}),
        metadata: {
          orbit_message_id: novaTxt?.id ?? null,
          agent_runtime_version: ORBIT_AI_AGENT_RUNTIME_VERSION,
          ...(recoveryTag ? { recovery_tag: recoveryTag } : {}),
          ...(holdUntilQueued ? { outbox_hold_until: holdUntilQueued } : {}),
        },
      });
      if (!routed.enqueued && routed.reason === "duplicate" && novaTxt?.id) {
        await supabase.from("orbit_mensagens").delete().eq("id", novaTxt.id);
      }
      console.log("[orbit-ai-agent] Adapter routed ai_reply:", routed);

      // ── Kick imediato do worker (tenant-scoped, default OFF) ──
      // Só ai_reply/texto, só com flag. Nenhum caminho alternativo de envio:
      // o próprio worker aplica todos os gates. Falha => fica pending p/ cron.
      try {
        const { data: cfgRow } = await supabase
          .from("orbit_ai_config")
          .select("ai_reply_debounce")
          .eq("empresa_id", empresaId)
          .maybeSingle();
        const decision = decideImmediateKick({
          flagEnabled: readImmediateOutboxDispatchFlag(cfgRow as any),
          sourceType: "ai_reply",
          payloadType: "text",
          routed,
          holdUntil: holdUntilQueued,
          scheduledFor: holdUntilQueued,
        });
        if (decision.kick) {
          const kick = await kickOutboxDispatch(
            { outboxId: decision.outboxId, empresaId },
            {
              functionsBase: `${Deno.env.get("SUPABASE_URL")}/functions/v1`,
              cronToken: Deno.env.get("SCHEDULER_CRON_TOKEN"),
            },
          );
          console.log("[orbit-ai-agent] immediate outbox kick:", {
            empresa_id: empresaId,
            outbox_id: decision.outboxId,
            ...kick,
          });
        }
      } catch (kickErr) {
        console.warn("[orbit-ai-agent] immediate outbox kick falhou (fail-safe, segue pending):", kickErr);
      }
      return;
    }



    const zapiConfig = await getOrbitZapiRuntimeConfig(supabase, empresaId);
    const replyBlockReason = getOrbitZapiRealSendBlockReason(zapiConfig, telefone);

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

// ── COMPROVANTE: deal + posse humana + notificação, sem mensagem ao lead ──
async function runPaymentReceiptHandoff(
  supabase: any,
  args: {
    conversa_id: string;
    empresaId: string | null;
    prospect: any;
    prospect_id: string | null;
    telefone: string;
    isDemo: boolean;
    targetStageName: string;
    inboundId: string | null;
    evidenceKind: string | null;
  },
): Promise<Record<string, unknown>> {
  const {
    conversa_id, empresaId, prospect, prospect_id, telefone, isDemo,
    targetStageName, inboundId, evidenceKind,
  } = args;
  if (!empresaId || !prospect_id) return { ok: false, reason: "missing_tenant_or_prospect" };

  const now = new Date().toISOString();
  const { data: current } = await supabase
    .from("orbit_conversas")
    .select("id, ai_contexto, human_talk")
    .eq("id", conversa_id).eq("empresa_id", empresaId).eq("prospect_id", prospect_id)
    .maybeSingle();
  if (!current) return { ok: false, reason: "conversation_not_found" };

  let context: Record<string, any> = (current as any).ai_contexto || {};
  let receiptState: Record<string, any> | null = context.payment_receipt_handoff || null;
  if (receiptState?.notification_sent_at) {
    return { ok: true, skipped: true, reason: "payment_receipt_already_handled", deal_id: receiptState.deal_id ?? null };
  }

  // Claim e pausa são atômicos: depois da evidência forte, nenhuma resposta da IA
  // pode escapar enquanto deal/notificação são concluídos.
  if (!receiptState) {
    const claim = buildPaymentReceiptClaim(inboundId, evidenceKind);
    const { data: claimed, error: claimError } = await supabase
      .from("orbit_conversas")
      .update({
        human_talk: true,
        human_user_id: null,
        ai_processing: false,
        handoff_sent_at: now,
        ai_contexto: { ...context, estado: "handoff", payment_receipt_handoff: claim },
      })
      .eq("id", conversa_id).eq("empresa_id", empresaId)
      .filter("ai_contexto->payment_receipt_handoff", "is", null)
      .select("ai_contexto");
    if (claimError) throw new Error(`payment_receipt_claim_failed:${claimError.message}`);
    if (!claimed || claimed.length === 0) {
      return { ok: true, skipped: true, reason: "payment_receipt_claim_lost" };
    }
    context = (claimed[0] as any).ai_contexto || context;
    receiptState = context.payment_receipt_handoff || claim;
  } else if ((current as any).human_talk !== true) {
    await supabase.from("orbit_conversas")
      .update({ human_talk: true, human_user_id: null, ai_processing: false, handoff_sent_at: now })
      .eq("id", conversa_id).eq("empresa_id", empresaId);
  }

  // Cancela somente automações desta conversa. Nunca altera mensagens já enviadas.
  try {
    await supabase.rpc("cancel_cadence_on_reply", {
      _empresa_id: empresaId,
      _prospect_id: prospect_id,
      _reason: "payment_receipt_handoff",
    });
  } catch (error) {
    console.warn("[orbit-ai-agent] Falha ao cancelar cadência após comprovante:", error);
  }
  await supabase.from("orbit_ai_reply_debounce")
    .update({ status: "canceled", last_error: "payment_receipt_handoff", updated_at: now })
    .eq("empresa_id", empresaId).eq("conversa_id", conversa_id)
    .in("status", ["pending", "generating"]);
  await supabase.from("orbit_whatsapp_outbox")
    .update({ status: "canceled", canceled_at: now, canceled_reason: "payment_receipt_handoff", updated_at: now })
    .eq("empresa_id", empresaId).eq("conversa_id", conversa_id)
    .in("status", ["queued", "pending", "deferred"])
    .in("source_type", ["ai_reply", "flow_initial", "flow_followup", "campaign"]);

  // Garante um deal e posiciona em Negociação (ou etapa configurada), sem marcar
  // como ganho: Fernando ainda precisa validar o comprovante e o valor.
  const { data: targetStage } = await supabase.from("orbit_pipeline_stages")
    .select("id").eq("empresa_id", empresaId).eq("nome", targetStageName)
    .eq("is_archived", false).limit(1).maybeSingle();
  const { data: existingDeal } = await supabase.from("orbit_deals")
    .select("id, etapa_id, status, deleted_at")
    .eq("empresa_id", empresaId).eq("prospect_id", prospect_id)
    .is("deleted_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();

  let dealId = existingDeal?.id ?? null;
  if (existingDeal) {
    const status = String(existingDeal.status || "").toLowerCase();
    const terminal = ["won", "lost", "ganho", "perdido", "deleted"].includes(status);
    if (!terminal) {
      await supabase.from("orbit_deals").update({
        ...(targetStage?.id ? { etapa_id: targetStage.id, moved_at: now } : {}),
        ultima_interacao_at: now,
        updated_at: now,
      }).eq("id", existingDeal.id).eq("empresa_id", empresaId);
    }
  } else {
    const { data: created, error: dealError } = await supabase.from("orbit_deals").insert({
      empresa_id: empresaId,
      prospect_id,
      etapa_id: targetStage?.id ?? null,
      titulo: prospect?.nome_razao || prospect?.nome_fantasia || "Pagamento recebido",
      status: "open",
      origem: "payment_receipt_handoff",
      ultima_interacao_at: now,
      moved_at: now,
    }).select("id").single();
    if (dealError) throw new Error(`payment_receipt_deal_failed:${dealError.message}`);
    dealId = created?.id ?? null;
  }

  const persistReceiptState = async (patch: Record<string, unknown>) => {
    const { data: fresh } = await supabase.from("orbit_conversas")
      .select("ai_contexto").eq("id", conversa_id).eq("empresa_id", empresaId).maybeSingle();
    const freshContext = (fresh as any)?.ai_contexto || context;
    const freshState = freshContext.payment_receipt_handoff || receiptState || {};
    await supabase.from("orbit_conversas").update({
      ai_contexto: {
        ...freshContext,
        estado: "handoff",
        payment_receipt_handoff: { ...freshState, ...patch },
      },
    }).eq("id", conversa_id).eq("empresa_id", empresaId);
  };
  await persistReceiptState({ deal_id: dealId, human_talk_set_at: now });

  const notified = await notifyCommercialHumanDetected(supabase, {
    prospect,
    telefone_lead: telefone,
    mensagem: PAYMENT_RECEIPT_NOTIFICATION_SUMMARY,
    classification: "pagamento_recebido",
    empresa_id: empresaId,
    isDemo,
  });
  if (notified.sent) {
    await persistReceiptState({ notification_sent_at: new Date().toISOString() });
  } else {
    await persistReceiptState({ notification_error: notified.reason || "notify_failed" });
  }

  return {
    ok: true,
    deal_id: dealId,
    human_talk: true,
    notified: notified.sent,
    notification_reason: notified.reason ?? null,
    lead_reply_sent: false,
  };
}

// ── PAGAMENTO MISTO: orquestrador por etapas, recuperável e idempotente ──
// Ordem obrigatória: claim -> confirmação DURÁVEL -> human_talk -> notificação.
// Nenhuma etapa é marcada antes do sucesso; retry retoma exatamente onde parou.
async function runMixedPaymentHandoff(
  supabase: any,
  args: {
    conversa_id: string;
    empresaId: string | null;
    prospect: any;
    prospect_id: string | null;
    telefone: string;
    isDemo: boolean;
    aiConfig: any;
    confirmation: string;
  },
): Promise<Record<string, unknown>> {
  const { conversa_id, empresaId, prospect, prospect_id, telefone, isDemo, aiConfig, confirmation } = args;

  // Estado sempre relido do banco: a decisão do próximo passo é derivada dele.
  const { data: conv } = await supabase
    .from("orbit_conversas")
    .select("id, ai_contexto, human_talk, prospect_id")
    .eq("id", conversa_id)
    .maybeSingle();
  let ctx: Record<string, unknown> = (conv as any)?.ai_contexto || {};
  let state = readMixedPaymentState(ctx);

  if (state.handled) {
    return { skipped: true, reason: "mixed_payment_already_handled", step: "done" };
  }

  // Inbound mais recente: identidade da ÚNICA confirmação (idempotência).
  const { data: lastIn } = await supabase
    .from("orbit_mensagens")
    .select("id")
    .eq("conversa_id", conversa_id)
    .eq("direcao", "IN")
    .order("timestamp", { ascending: false })
    .limit(1)
    .maybeSingle();
  const inboundId = (lastIn as any)?.id ?? conversa_id;

  // ── Etapa 1: claim (não marca confirmação, não marca posse humana) ──
  if (!state.claimed) {
    const { data: claimed, error: claimError } = await supabase
      .from("orbit_conversas")
      .update({
        ai_processing: false,
        ai_contexto: { ...ctx, estado: "handoff", mixed_payment_handoff: buildMixedPaymentClaim(inboundId) },
      })
      .eq("id", conversa_id)
      .filter("ai_contexto->mixed_payment_handoff", "is", null)
      .select("id, ai_contexto");
    if (claimError) {
      console.error("[orbit-ai-agent] Falha no claim de pagamento misto:", claimError.message);
      throw new Error("mixed_payment_claim_failed");
    }
    if (!claimed || claimed.length === 0) {
      // Concorrência: outra execução já fez o claim deste inbound. Nada a duplicar.
      return { skipped: true, reason: "mixed_payment_claim_lost", step: "claim" };
    }
    ctx = (claimed[0] as any).ai_contexto || ctx;
    state = readMixedPaymentState(ctx);
  }

  const persist = async (patch: Record<string, string>) => {
    const { data: row } = await supabase
      .from("orbit_conversas")
      .update({ ai_contexto: { ...ctx, estado: "handoff", mixed_payment_handoff: mergeMixedPaymentState(ctx, patch) } })
      .eq("id", conversa_id)
      .select("ai_contexto")
      .maybeSingle();
    ctx = (row as any)?.ai_contexto || ctx;
    state = readMixedPaymentState(ctx);
  };

  // ── Etapa 2: confirmação DURÁVEL (uma única vez) ──
  if (decideMixedPaymentNextStep(state) === "enqueue_confirmation") {
    const adapterOn = !isDemo && !!empresaId && (await isAdapterEnabled(supabase, empresaId));
    if (adapterOn) {
      const { data: visual } = await supabase
        .from("orbit_mensagens")
        .insert({
          conversa_id,
          direcao: "OUT",
          mensagem: confirmation,
          canal: "whatsapp",
          status: "queued",
          empresa_id: empresaId,
        })
        .select("id")
        .single();
      const routed = await enqueueOutbox(supabase, {
        empresa_id: empresaId!,
        conversa_id,
        prospect_id: prospect_id ?? (conv as any)?.prospect_id ?? null,
        source_type: MIXED_PAYMENT_CONFIRMATION_SOURCE,
        inbound_message_id: inboundId,
        source_id: inboundId,
        payload_type: "text",
        payload: { mensagem: confirmation },
        metadata: { orbit_message_id: visual?.id ?? null, mixed_payment_confirmation: true },
      });
      const durableId = routed.outbox_id ?? null;
      if (!routed.enqueued && routed.reason !== "duplicate") {
        // Falha ANTES do enqueue: nada é marcado, o retry tenta novamente.
        if (visual?.id) await supabase.from("orbit_mensagens").delete().eq("id", visual.id);
        console.error("[orbit-ai-agent] Confirmação de pagamento misto não enfileirada:", routed);
        return { ok: false, step: "enqueue_confirmation", recoverable: true, reason: routed.reason ?? "enqueue_failed" };
      }
      if (!routed.enqueued && routed.reason === "duplicate" && visual?.id) {
        await supabase.from("orbit_mensagens").delete().eq("id", visual.id);
      }
      await persist({
        ...(durableId ? { confirmation_outbox_id: durableId } : {}),
        confirmation_enqueued_at: new Date().toISOString(),
      });
      // Kick imediato (tenant-scoped, default OFF). Falha => segue pending no cron.
      try {
        if (durableId && readImmediateOutboxDispatchFlag(aiConfig as any)) {
          const kick = await kickOutboxDispatch(
            { outboxId: durableId, empresaId: empresaId! },
            {
              functionsBase: `${Deno.env.get("SUPABASE_URL")}/functions/v1`,
              cronToken: Deno.env.get("SCHEDULER_CRON_TOKEN"),
            },
          );
          console.log("[orbit-ai-agent] mixed payment kick:", { outbox_id: durableId, ...kick });
        }
      } catch (kickErr) {
        console.warn("[orbit-ai-agent] kick da confirmação falhou (fail-safe):", kickErr);
      }
    } else {
      // Tenant sem outbox (ou demo): caminho de envio existente, com todos os gates.
      await sendAIResponse(supabase, telefone, confirmation, conversa_id, isDemo, empresaId, aiConfig, false);
      await persist({ confirmation_enqueued_at: new Date().toISOString() });
    }
  }

  // ── Etapa 3: posse humana SOMENTE após a confirmação durável ──
  if (decideMixedPaymentNextStep(state) === "set_human_talk") {
    const { error: htError } = await supabase
      .from("orbit_conversas")
      .update({ human_talk: true, ai_processing: false })
      .eq("id", conversa_id);
    if (htError) {
      console.error("[orbit-ai-agent] Falha ao marcar human_talk no pagamento misto:", htError.message);
      return { ok: false, step: "set_human_talk", recoverable: true, reason: "human_talk_update_failed" };
    }
    await persist({ human_talk_set_at: new Date().toISOString() });

    // Cadência/follow-ups: cancelados SOMENTE após o handoff confirmado.
    if (empresaId && prospect_id) {
      try {
        await supabase.rpc("cancel_cadence_on_reply", {
          _empresa_id: empresaId,
          _prospect_id: prospect_id,
          _reason: "mixed_payment_handoff",
        });
      } catch (cadErr) {
        console.warn("[orbit-ai-agent] Falha ao cancelar cadência no pagamento misto:", cadErr);
      }
    }
  }

  // ── Etapa 4: notificação interna (nunca marcada antes do sucesso) ──
  if (decideMixedPaymentNextStep(state) === "notify") {
    const notified = await notifyCommercialHumanDetected(supabase, {
      prospect,
      telefone_lead: telefone,
      mensagem: MIXED_PAYMENT_NOTIFICATION_SUMMARY,
      classification: "pagamento_misto",
      empresa_id: empresaId,
      isDemo,
    });
    if (notified.sent) {
      await persist({ notification_sent_at: new Date().toISOString() });
    } else if (notified.reason === "no_recipient") {
      // Tenant sem destinatário: encerra sem retry infinito. Não reabre a IA.
      await persist({ notification_sent_at: new Date().toISOString(), notification_skipped_reason: "no_recipient" });
    } else {
      // Falha de notificação NÃO reabre a IA e NÃO duplica confirmação.
      console.warn("[orbit-ai-agent] Notificação de pagamento misto falhou — retry só da notificação:", notified.reason);
      return {
        ok: false,
        step: "notify",
        recoverable: true,
        reason: notified.reason ?? "notify_failed",
        human_talk: true,
        confirmation_outbox_id: state.confirmation_outbox_id,
      };
    }
  }

  return {
    ok: true,
    step: "done",
    human_talk: true,
    confirmation_outbox_id: state.confirmation_outbox_id,
    notified: !!state.notification_sent_at,
  };
}


// ── sendAIResponse: envia resposta como texto e/ou áudio TTS ──
async function sendAIResponse(
  supabase: any,
  telefone: string,
  texto: string,
  conversa_id: string,
  isDemo: boolean,
  empresaId: string | null | undefined,
  aiConfig: any,
  allowIntro = true
) {
  // Normaliza antes de qualquer formato de saida. Assim TTS e texto seguem
  // exatamente os mesmos guards de continuidade e estilo.
  const safeTexto = finalizeAgentMessage(texto, allowIntro);
  const ttsAtivo = aiConfig?.tts_ativo === true;
  const ttsApiKey = aiConfig?.tts_api_key;
  const ttsVoiceId = aiConfig?.tts_voice_id || "EXAVITQu4vr4xnSDxMaL";
  const ttsModo = aiConfig?.tts_modo || "texto";

  if (ttsAtivo && ttsApiKey && ttsModo !== "texto") {
    try {
      console.log("[orbit-ai-agent] TTS ativo, gerando áudio via ElevenLabs...");

      const audioBuffer = await generateTTS(safeTexto, ttsVoiceId, ttsApiKey);

      const path = `tts/${empresaId}/${conversa_id}/${Date.now()}.mp3`;
      const { error: uploadError } = await supabase.storage
        .from("orbit-media")
        .upload(path, audioBuffer, {
          contentType: "audio/mpeg",
          upsert: false,
        });

      if (uploadError) {
        console.error("[orbit-ai-agent] Erro upload TTS:", uploadError.message);
        await sendWhatsAppMessage(supabase, telefone, safeTexto, conversa_id, isDemo, empresaId, allowIntro);
        return;
      }

      // Bucket privado — passamos o storage_path direto (sem getPublicUrl).
      console.log("[orbit-ai-agent] Áudio TTS gerado em:", path);

      await sendWhatsAppAudio(supabase, telefone, path, conversa_id, empresaId);

      if (ttsModo === "ambos") {
        await sendWhatsAppMessage(supabase, telefone, safeTexto, conversa_id, isDemo, empresaId, allowIntro);
      }

      return;
    } catch (ttsError) {
      console.error("[orbit-ai-agent] Erro TTS, fallback para texto:", ttsError);
      await sendWhatsAppMessage(supabase, telefone, safeTexto, conversa_id, isDemo, empresaId, allowIntro);
      return;
    }
  }

  await sendWhatsAppMessage(supabase, telefone, safeTexto, conversa_id, isDemo, empresaId, allowIntro);
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

function parseAvailabilityTime(value: unknown, fallbackHour: number): { hour: number; minute: number } {
  const match = String(value ?? "").match(/^([01]\d|2[0-3]):([0-5]\d)/);
  if (!match) return { hour: fallbackHour, minute: 0 };
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function localDay(date: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

function addCalendarDays(day: string, amount: number): string {
  const [year, month, date] = day.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, date + amount));
  return shifted.toISOString().slice(0, 10);
}

function normalizePt(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function resolveBookingDateHint(message: string, now: Date, tz: string): {
  expectedDay?: string;
  ambiguous?: boolean;
} {
  const text = normalizePt(message || "");
  const today = localDay(now, tz);

  if (/\b(hoje)\b/.test(text)) return { expectedDay: today };
  if (/\b(amanha)\b/.test(text)) return { expectedDay: addCalendarDays(today, 1) };

  const explicit = text.match(/\b([0-3]?\d)[\/.\-]([01]?\d)(?:[\/.\-](\d{2,4}))?\b/);
  if (explicit) {
    const currentYear = Number(today.slice(0, 4));
    let year = explicit[3] ? Number(explicit[3]) : currentYear;
    if (year < 100) year += 2000;
    let candidate = `${year}-${String(Number(explicit[2])).padStart(2, "0")}-${String(Number(explicit[1])).padStart(2, "0")}`;
    if (!explicit[3] && candidate < today) candidate = `${year + 1}${candidate.slice(4)}`;
    return { expectedDay: candidate };
  }

  const weekdays: Array<[RegExp, number]> = [
    [/\bdomingo\b/, 0], [/\bsegunda(?:-feira)?\b/, 1], [/\bterca(?:-feira)?\b/, 2],
    [/\bquarta(?:-feira)?\b/, 3], [/\bquinta(?:-feira)?\b/, 4],
    [/\bsexta(?:-feira)?\b/, 5], [/\bsabado\b/, 6],
  ];
  const weekday = weekdays.find(([pattern]) => pattern.test(text));
  if (weekday) {
    const [y, m, d] = today.split("-").map(Number);
    const currentWeekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    let delta = (weekday[1] - currentWeekday + 7) % 7;
    if (delta === 0) delta = 7;
    if (/\b(proxima semana|semana que vem)\b/.test(text) && delta < 7) delta += 7;
    return { expectedDay: addCalendarDays(today, delta) };
  }

  if (/\b(proxima semana|semana que vem)\b/.test(text)) return { ambiguous: true };
  return {};
}

export interface AutoScheduleParams {
  empresaId: string;
  prospect: any;
  prospect_id: string;
  conversa_id: string;
  telefone: string;
  mensagem_cliente?: string;
  sugestoes_anteriores?: Array<{ start?: string; end?: string; label?: string; label_full?: string }>;
  agendamento: any;
}

export interface AutoScheduleDeps {
  getTokenForEmpresa: typeof getTokenForEmpresa;
  ensureFreshAccessToken: typeof ensureFreshAccessToken;
  checkAvailability: typeof checkAvailability;
  createCalendarEvent: typeof createCalendarEvent;
  deleteCalendarEvent: (accessToken: string, calendarId: string, eventId: string) => Promise<void>;
  now: () => Date;
}

async function defaultDeleteCalendarEvent(accessToken: string, calendarId: string, eventId: string): Promise<void> {
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`;
  const r = await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` } });
  // 404/410 = já não existe; considerar sucesso silencioso
  if (!r.ok && r.status !== 404 && r.status !== 410) {
    console.warn(`[orbit-ai-agent] deleteCalendarEvent status=${r.status}`);
  }
}

function dayOfWeek(day: string): number {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date)).getUTCDay();
}

function isDefaultBusinessDay(day: string): boolean {
  const weekday = dayOfWeek(day);
  return weekday >= 1 && weekday <= 5;
}

function localMinutes(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0) % 24;
  const minute = Number(parts.find((part) => part.type === "minute")?.value || 0);
  return hour * 60 + minute;
}

function preferredPeriod(message: string): "morning" | "afternoon" | "evening" | null {
  const text = normalizePt(message || "");
  if (/\b(manha|cedo)\b/.test(text)) return "morning";
  if (/\b(tarde|depois do almoco)\b/.test(text)) return "afternoon";
  if (/\b(noite|noturno)\b/.test(text)) return "evening";
  return null;
}

type AvailabilityBounds = { start: number; end: number };

function clockMinutes(hourValue: string, minuteValue?: string): number | null {
  const hour = Number(hourValue);
  const minute = Number(minuteValue || 0);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }
  return hour * 60 + minute;
}

function availabilityBreakBounds(token: any): AvailabilityBounds | null {
  const startParts = String(token?.availability_break_start || "").match(/^(\d{1,2}):(\d{2})/);
  const endParts = String(token?.availability_break_end || "").match(/^(\d{1,2}):(\d{2})/);
  if (!startParts || !endParts) return null;
  const start = clockMinutes(startParts[1], startParts[2]);
  const end = clockMinutes(endParts[1], endParts[2]);
  return start !== null && end !== null && end > start ? { start, end } : null;
}

export function explicitTimeBounds(message: string): AvailabilityBounds | null {
  const text = normalizePt(message || "")
    .replace(/\s+/g, " ")
    .trim();
  const time = "(\\d{1,2})(?:[:h](\\d{2}))?";
  const rangePatterns = [
    new RegExp(`\\bentre\\s+${time}\\s*(?:h(?:oras?)?)?\\s*(?:e|as|a|ate|-)\\s*${time}\\s*(?:h(?:oras?)?)?\\b`),
    new RegExp(`\\b(?:de|das?)\\s+${time}\\s*(?:h(?:oras?)?)?\\s*(?:as|a|ate|-)\\s*${time}\\s*(?:h(?:oras?)?)?\\b`),
    new RegExp(`\\b${time}\\s*h(?:oras?)?\\s*(?:as|a|ate|-)\\s*${time}\\s*(?:h(?:oras?)?)?\\b`),
  ];

  for (const pattern of rangePatterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const start = clockMinutes(match[1], match[2]);
    const end = clockMinutes(match[3], match[4]);
    if (start !== null && end !== null && end > start) return { start, end };
  }

  return null;
}

function availabilityBoundsForMessage(
  startMinutes: number,
  endMinutes: number,
  message: string,
): AvailabilityBounds {
  const explicit = explicitTimeBounds(message);
  if (explicit) {
    return {
      start: Math.max(startMinutes, explicit.start),
      end: Math.min(endMinutes, explicit.end),
    };
  }

  const period = preferredPeriod(message);
  if (period === "morning") return { start: startMinutes, end: Math.min(endMinutes, 12 * 60) };
  if (period === "afternoon") return { start: Math.max(startMinutes, 12 * 60), end: Math.min(endMinutes, 18 * 60) };
  if (period === "evening") return { start: Math.max(startMinutes, 18 * 60), end: endMinutes };
  return { start: startMinutes, end: endMinutes };
}

async function findNearestAvailableSlots(params: {
  deps: AutoScheduleDeps;
  token: any;
  accessToken: string;
  calendarId: string;
  timezone: string;
  startDay: string;
  durationMinutes: number;
  minNoticeMinutes: number;
  maxDays: number;
  now: Date;
  message: string;
}): Promise<Array<{ start: string; end: string; label: string; label_full: string }>> {
  const availabilityStart = parseAvailabilityTime(params.token.availability_start, 9);
  const availabilityEnd = parseAvailabilityTime(params.token.availability_end, 18);
  const configuredStart = availabilityStart.hour * 60 + availabilityStart.minute;
  const configuredEnd = availabilityEnd.hour * 60 + availabilityEnd.minute;
  const bounds = availabilityBoundsForMessage(configuredStart, configuredEnd, params.message);
  const breakBounds = availabilityBreakBounds(params.token);
  const durationMs = params.durationMinutes * 60_000;
  const stepMs = Math.max(30, params.durationMinutes) * 60_000;
  const noticeFloor = params.now.getTime() + params.minNoticeMinutes * 60_000;
  const suggestions: Array<{ start: string; end: string; label: string; label_full: string }> = [];

  if (bounds.end - bounds.start < params.durationMinutes) return suggestions;

  for (let dayOffset = 0; dayOffset < params.maxDays && suggestions.length < 2; dayOffset++) {
    const day = addCalendarDays(params.startDay, dayOffset);
    if (!isDefaultBusinessDay(day)) continue;

    const dayStart = isoWithOffset(day, Math.floor(bounds.start / 60), bounds.start % 60, params.timezone);
    const dayEnd = isoWithOffset(day, Math.floor(bounds.end / 60), bounds.end % 60, params.timezone);
    const endMs = new Date(dayEnd).getTime();
    const dayStartMs = new Date(dayStart).getTime();
    const breakStartMs = breakBounds
      ? new Date(isoWithOffset(day, Math.floor(breakBounds.start / 60), breakBounds.start % 60, params.timezone)).getTime()
      : null;
    const breakEndMs = breakBounds
      ? new Date(isoWithOffset(day, Math.floor(breakBounds.end / 60), breakBounds.end % 60, params.timezone)).getTime()
      : null;
    let cursor = Math.max(dayStartMs, noticeFloor);
    cursor = dayStartMs + Math.ceil((cursor - dayStartMs) / stepMs) * stepMs;
    if (cursor + durationMs > endMs) continue;

    let busy: Array<{ start: string; end: string }> = [];
    try {
      const availability = await params.deps.checkAvailability(
        params.accessToken,
        params.calendarId,
        dayStart,
        dayEnd,
        params.timezone,
      );
      busy = availability.busy || [];
    } catch (error) {
      console.error("[orbit-ai-agent] freeBusy falhou ao buscar próximos horários:", error);
      throw error;
    }

    while (cursor + durationMs <= endMs && suggestions.length < 2) {
      const slotEnd = cursor + durationMs;
      const overlaps = busy.some((item) => {
        const busyStart = new Date(item.start).getTime();
        const busyEnd = new Date(item.end).getTime();
        return cursor < busyEnd && slotEnd > busyStart;
      });
      const overlapsBreak = breakStartMs !== null && breakEndMs !== null &&
        cursor < breakEndMs && slotEnd > breakStartMs;
      if (!overlaps && !overlapsBreak) {
        const start = new Date(cursor);
        const label = new Intl.DateTimeFormat("pt-BR", {
          timeZone: params.timezone,
          hour: "2-digit",
          minute: "2-digit",
        }).format(start);
        const dayLabel = new Intl.DateTimeFormat("pt-BR", {
          timeZone: params.timezone,
          weekday: "long",
          day: "2-digit",
          month: "long",
        }).format(start);
        suggestions.push({
          start: start.toISOString(),
          end: new Date(slotEnd).toISOString(),
          label,
          label_full: `${dayLabel} às ${label}`,
        });
      }
      cursor += stepMs;
    }
  }

  return suggestions;
}

function formatSuggestionsResponse(
  suggestions: Array<{ label_full?: string; label?: string }>,
): string {
  if (!suggestions.length) {
    return "Não encontrei horários livres dentro do expediente nos próximos dias. Vou pedir para a equipe conferir a agenda e continuar com você.";
  }
  if (suggestions.length === 1) {
    return `Encontrei este horário livre: ${suggestions[0].label_full || suggestions[0].label}. Funciona para você?`;
  }
  return `Encontrei estes dois horários livres: 1) ${suggestions[0].label_full || suggestions[0].label}; 2) ${suggestions[1].label_full || suggestions[1].label}. Qual deles você prefere?`;
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
    now: depsIn?.now ?? (() => new Date()),
  };

  const ag = params.agendamento || {};
  const rawToken = await deps.getTokenForEmpresa(params.empresaId).catch(() => null);
  if (!rawToken) {
    console.log("[orbit-ai-agent] Google Calendar não conectado — fallback para handoff manual", { empresaId: params.empresaId });
    return { handled: false, not_connected: true };
  }
  const token = schedulingPolicy(params.empresaId, rawToken);

  const tz = token.timezone || "America/Sao_Paulo";
  const previousSuggestions = Array.isArray(params.sugestoes_anteriores) ? params.sugestoes_anteriores : [];
  if (isAmbiguousSlotAcceptance(params.mensagem_cliente || "", previousSuggestions.length)) {
    return {
      handled: true,
      created: false,
      response_override: "Para eu agendar corretamente, escolha explicitamente a opção 1 ou a opção 2, por favor.",
      suggestions: previousSuggestions,
    };
  }
  let selectedSuggestion = selectExplicitSuggestion(params.mensagem_cliente || "", previousSuggestions);

  const calId = token.calendar_id;
  const duracaoMin = Math.max(15, Math.min(240, Number(ag.duracao_min) || 60));
  const titulo = String(ag.titulo || `Call com ${params.prospect?.nome_razao || params.prospect?.nome_fantasia || "lead"}`).slice(0, 200);
  const now = deps.now();
  const configuredNotice = Number(token.booking_min_notice_minutes);
  const configuredHorizon = Number(token.booking_max_horizon_days);
  const minNoticeMinutes = Math.max(0, Number.isFinite(configuredNotice) ? configuredNotice : 60);
  const maxHorizonDays = Math.max(1, Number.isFinite(configuredHorizon) ? configuredHorizon : 60);
  const hint = resolveBookingDateHint(params.mensagem_cliente || "", now, tz);

  // Sem data informada: consultar a agenda e oferecer os dois horários úteis mais próximos.
  if (!selectedSuggestion?.start && !ag.data_iso) {
    const access = await deps.ensureFreshAccessToken(token);
    const today = localDay(now, tz);
    const startDay = hint.expectedDay || (hint.ambiguous ? addCalendarDays(today, 7) : today);
    try {
      const suggestions = await findNearestAvailableSlots({
        deps,
        token,
        accessToken: access,
        calendarId: calId,
        timezone: tz,
        startDay,
        durationMinutes: duracaoMin,
        minNoticeMinutes,
        maxDays: Math.min(maxHorizonDays, 14),
        now,
        message: params.mensagem_cliente || "",
      });
      return {
        handled: true,
        created: false,
        response_override: formatSuggestionsResponse(suggestions),
        suggestions,
      };
    } catch {
      return { handled: false, error: "freeBusy falhou" };
    }
  }

  const effectiveDataIso = selectedSuggestion?.start || ag.data_iso;
  const startDate = new Date(effectiveDataIso);
  if (isNaN(startDate.getTime())) {
    return { handled: false, error: "data_iso inválida" };
  }
  const temHorario = Boolean(selectedSuggestion?.start) || ag.tem_horario === true;
  const dayStr = localDay(startDate, tz);

  // ── Guardrails determinísticos: texto, passado, antecedência e horizonte ──
  if (!selectedSuggestion && hint.ambiguous) {
    const access = await deps.ensureFreshAccessToken(token);
    try {
      const suggestions = await findNearestAvailableSlots({
        deps,
        token,
        accessToken: access,
        calendarId: calId,
        timezone: tz,
        startDay: addCalendarDays(localDay(now, tz), 7),
        durationMinutes: duracaoMin,
        minNoticeMinutes,
        maxDays: Math.min(maxHorizonDays, 14),
        now,
        message: params.mensagem_cliente || "",
      });
      return {
        handled: true,
        created: false,
        response_override: formatSuggestionsResponse(suggestions),
        suggestions,
      };
    } catch {
      return { handled: false, error: "freeBusy falhou" };
    }
  }
  if (!selectedSuggestion && hint.expectedDay && hint.expectedDay !== dayStr) {
    console.warn("[orbit-ai-agent] data do modelo diverge da mensagem", {
      message: params.mensagem_cliente, expectedDay: hint.expectedDay, modelDay: dayStr,
    });
    const access = await deps.ensureFreshAccessToken(token);
    try {
      const suggestions = await findNearestAvailableSlots({
        deps,
        token,
        accessToken: access,
        calendarId: calId,
        timezone: tz,
        startDay: hint.expectedDay,
        durationMinutes: duracaoMin,
        minNoticeMinutes,
        maxDays: Math.min(maxHorizonDays, 14),
        now,
        message: params.mensagem_cliente || "",
      });
      return {
        handled: true,
        created: false,
        response_override: formatSuggestionsResponse(suggestions),
        suggestions,
      };
    } catch {
      return { handled: false, error: "freeBusy falhou" };
    }
  }
  if (startDate.getTime() > now.getTime() + maxHorizonDays * 24 * 60 * 60 * 1000) {
    console.warn("[orbit-ai-agent] agendamento rejeitado (fora do horizonte):", effectiveDataIso);
    return {
      handled: true,
      created: false,
      response_override: `Consigo consultar a agenda para os próximos ${maxHorizonDays} dias. Qual data dentro desse período funciona para você?`,
    };
  }
  if (temHorario) {
    if (startDate.getTime() <= now.getTime() + minNoticeMinutes * 60 * 1000) {
      console.warn("[orbit-ai-agent] agendamento rejeitado (passado/imediato):", ag.data_iso);
      return {
        handled: true,
        created: false,
        response_override: `Esse horário já passou ou não respeita a antecedência mínima de ${minNoticeMinutes} minutos. Pode me indicar outro horário?`,
      };
    }

    const availabilityStart = parseAvailabilityTime(token.availability_start, 9);
    const availabilityEnd = parseAvailabilityTime(token.availability_end, 18);
    const configuredStart = availabilityStart.hour * 60 + availabilityStart.minute;
    const configuredEnd = availabilityEnd.hour * 60 + availabilityEnd.minute;
    const appointmentStart = localMinutes(startDate, tz);
    const appointmentEndDate = new Date(startDate.getTime() + duracaoMin * 60_000);
    const appointmentEnd = localMinutes(appointmentEndDate, tz);
    const sameLocalDay = localDay(appointmentEndDate, tz) === dayStr;
    const insideBusinessHours = isDefaultBusinessDay(dayStr) && sameLocalDay &&
      appointmentStart >= configuredStart && appointmentEnd <= configuredEnd;
    if (!insideBusinessHours) {
      console.warn("[orbit-ai-agent] horário rejeitado fora do expediente:", {
        effectiveDataIso,
        availabilityStart: token.availability_start,
        availabilityEnd: token.availability_end,
        timezone: tz,
      });
      const access = await deps.ensureFreshAccessToken(token);
      try {
        const suggestions = await findNearestAvailableSlots({
          deps,
          token,
          accessToken: access,
          calendarId: calId,
          timezone: tz,
          startDay: dayStr,
          durationMinutes: duracaoMin,
          minNoticeMinutes,
          maxDays: Math.min(maxHorizonDays, 14),
          now,
          message: params.mensagem_cliente || "",
        });
        return {
          handled: true,
          created: false,
          response_override: `Esse horário fica fora do nosso expediente de ${String(token.availability_start || "09:00").slice(0, 5)} às ${String(token.availability_end || "18:00").slice(0, 5)}. ${formatSuggestionsResponse(suggestions)}`,
          suggestions,
        };
      } catch {
        return { handled: false, error: "freeBusy falhou" };
      }
    }

    const breakBounds = availabilityBreakBounds(token);
    const overlapsBreak = Boolean(
      breakBounds && appointmentStart < breakBounds.end && appointmentEnd > breakBounds.start,
    );
    if (overlapsBreak) {
      console.warn("[orbit-ai-agent] horário rejeitado durante pausa da agenda:", {
        effectiveDataIso,
        availabilityBreakStart: token.availability_break_start,
        availabilityBreakEnd: token.availability_break_end,
        timezone: tz,
      });
      const access = await deps.ensureFreshAccessToken(token);
      try {
        const suggestions = await findNearestAvailableSlots({
          deps,
          token,
          accessToken: access,
          calendarId: calId,
          timezone: tz,
          startDay: dayStr,
          durationMinutes: duracaoMin,
          minNoticeMinutes,
          maxDays: Math.min(maxHorizonDays, 14),
          now,
          message: params.mensagem_cliente || "",
        });
        return {
          handled: true,
          created: false,
          response_override: `Esse horário coincide com nossa pausa de ${String(token.availability_break_start).slice(0, 5)} às ${String(token.availability_break_end).slice(0, 5)}. ${formatSuggestionsResponse(suggestions)}`,
          suggestions,
        };
      } catch {
        return { handled: false, error: "freeBusy falhou" };
      }
    }
  } else {
    // Dia sem horário: rejeitar se o dia local da agenda já passou
    const todayStr = localDay(now, tz);
    if (dayStr < todayStr) {
      console.warn("[orbit-ai-agent] agendamento rejeitado (dia passado):", ag.data_iso, "dayStr=", dayStr, "todayStr=", todayStr);
      return {
        handled: true,
        created: false,
        response_override: "Essa data já passou. Você quis dizer a próxima semana? Me confirme a data (e, se possível, o horário), por favor.",
      };
    }
  }

  // ── Ramo: dia sem horário — sugerir os 2 slots úteis mais próximos ──
  if (!temHorario) {
    const access = await deps.ensureFreshAccessToken(token);
    try {
      const suggestions = await findNearestAvailableSlots({
        deps,
        token,
        accessToken: access,
        calendarId: calId,
        timezone: tz,
        startDay: dayStr,
        durationMinutes: duracaoMin,
        minNoticeMinutes,
        maxDays: Math.min(maxHorizonDays, 14),
        now,
        message: params.mensagem_cliente || "",
      });
      return {
        handled: true,
        created: false,
        response_override: formatSuggestionsResponse(suggestions),
        suggestions,
      };
    } catch (e) {
      console.error("[orbit-ai-agent] freeBusy falhou:", e);
      return { handled: false, error: "freeBusy falhou" };
    }
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
