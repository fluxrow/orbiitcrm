// Posse (ownership) de uma conversa do Orbit: quem responde o lead agora.
//
// Estados possíveis (independentes de tenant, dirigidos por dados):
//   A) human_talk=false                      → IA é a responsável.
//        - modo_automatico=true  → "Com a IA"   + ação "Assumir conversa"
//        - modo_automatico=false → "IA pausada" + ação "Assumir conversa"
//   B) human_talk=true  + human_user_id != null → humano assumiu.
//        - "Com <nome>" + ação "Devolver para IA" (sujeita ao corte)
//   C) human_talk=true  + human_user_id == null  → ninguém assumiu e a IA está bloqueada.
//        - "Aguardando atendimento humano" + ação "Assumir conversa" (sem "Devolver para IA")
//
// Devolver para IA só é permitido quando:
//   - o tenant está em modo automático, E
//   - o prospect nasceu depois do corte (auto_reply_new_leads_from), quando o corte existe.
// Lead anterior ao corte: atendimento humano obrigatório (nunca volta para a IA).
//
// Este módulo é puro: não faz IO e não dispara nada. Alternar posse nunca gera
// resposta retroativa — apenas o próximo inbound elegível pode acionar a IA.

export type ConversaOwnerState =
  | "ai"
  | "ai_paused"
  | "human_assigned"
  | "awaiting_human"
  | "human_external";

export interface ConversaOwnershipInput {
  conversa: {
    human_talk?: boolean | null;
    human_user_id?: string | null;
    human_user?: { id?: string | null; nome?: string | null } | null;
    archived_at?: string | null;
    /** ai_contexto.external_human_active = atendente falou pelo celular (fora do Orbit). */
    ai_contexto?: { external_human_active?: boolean | null } | null;
  } | null | undefined;
  prospect?: { created_at?: string | null } | null;
  /** orbit_ai_config do tenant atual. */
  aiConfig?: { modo_automatico?: boolean | null; auto_reply_new_leads_from?: string | null } | null;
}


export interface ConversaOwnership {
  state: ConversaOwnerState;
  /** Rótulo do indicador de posse. */
  statusLabel: string;
  ownerName: string | null;
  /** Mostrar botão "Assumir conversa". */
  canAssume: boolean;
  /** Mostrar botão "Devolver para IA". */
  canRelease: boolean;
  /** Motivo do bloqueio da devolução (null quando `canRelease`). */
  releaseBlockedReason: string | null;
  /** Lead nasceu antes do corte do tenant → atendimento humano obrigatório. */
  beforeCutoff: boolean;
}

export const RELEASE_BLOCKED_CUTOFF_MESSAGE =
  "Lead anterior ao corte: atendimento humano obrigatório";
export const RELEASE_BLOCKED_AUTOMATIC_OFF_MESSAGE =
  "Modo automático do tenant está desligado: a IA não pode assumir";

/** `created_at >= cutoff` passa; 1ms antes não passa. Sem cutoff, nada muda. */
export function isProspectAfterCutoff(
  cutoff: string | null | undefined,
  createdAt: string | null | undefined,
): boolean {
  if (!cutoff) return true;
  if (!createdAt) return false;
  const c = Date.parse(cutoff);
  const p = Date.parse(createdAt);
  if (Number.isNaN(c)) return true;
  if (Number.isNaN(p)) return false;
  return p >= c;
}

export function getConversaOwnership(input: ConversaOwnershipInput): ConversaOwnership {
  const conversa = input.conversa ?? null;
  const cutoff = input.aiConfig?.auto_reply_new_leads_from ?? null;
  const modoAutomatico = input.aiConfig?.modo_automatico === true;
  const afterCutoff = isProspectAfterCutoff(cutoff, input.prospect?.created_at ?? null);
  const beforeCutoff = !!cutoff && !afterCutoff;

  const humanTalk = conversa?.human_talk === true;
  const ownerId = conversa?.human_user_id ?? null;
  const ownerName = conversa?.human_user?.nome?.trim() || null;

  // A) IA responsável.
  if (!humanTalk) {
    return {
      state: modoAutomatico ? "ai" : "ai_paused",
      statusLabel: modoAutomatico ? "Com a IA" : "IA pausada",
      ownerName: null,
      canAssume: true,
      canRelease: false,
      releaseBlockedReason: null,
      beforeCutoff,
    };
  }

  // Devolução para a IA depende do modo automático e do corte do tenant.
  let releaseBlockedReason: string | null = null;
  if (beforeCutoff) releaseBlockedReason = RELEASE_BLOCKED_CUTOFF_MESSAGE;
  else if (!modoAutomatico) releaseBlockedReason = RELEASE_BLOCKED_AUTOMATIC_OFF_MESSAGE;

  // C) Bloqueada para IA, mas ninguém assumiu.
  if (!ownerId) {
    return {
      state: "awaiting_human",
      statusLabel: "Aguardando atendimento humano",
      ownerName: null,
      canAssume: true,
      canRelease: false,
      releaseBlockedReason,
      beforeCutoff,
    };
  }

  // B) Humano assumiu.
  return {
    state: "human_assigned",
    statusLabel: ownerName ? `Com ${ownerName}` : "Com atendimento humano",
    ownerName,
    canAssume: false,
    canRelease: releaseBlockedReason === null,
    releaseBlockedReason,
    beforeCutoff,
  };
}
