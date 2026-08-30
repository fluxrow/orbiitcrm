export interface ConversationOwnershipRow {
  id?: unknown;
  empresa_id?: unknown;
  human_talk?: unknown;
  human_user_id?: unknown;
  prospect_id?: unknown;
}

export type AutomaticReplyOwnershipDecision =
  | { allowed: true; reason: "ai_owned" }
  | { allowed: false; reason: "conversation_missing" | "cross_tenant" | "human_handoff" };

/**
 * Gate comum para qualquer caminho de resposta automática (outbox ou envio
 * direto). Falha fechado se a conversa não existe, mudou de tenant ou está sob
 * posse humana.
 */
export function decideAutomaticReplyOwnership(
  row: ConversationOwnershipRow | null | undefined,
  expectedEmpresaId: string | null | undefined,
): AutomaticReplyOwnershipDecision {
  if (!row?.id) return { allowed: false, reason: "conversation_missing" };
  if (expectedEmpresaId && row.empresa_id !== expectedEmpresaId) {
    return { allowed: false, reason: "cross_tenant" };
  }
  if (row.human_talk === true || !!row.human_user_id) {
    return { allowed: false, reason: "human_handoff" };
  }
  return { allowed: true, reason: "ai_owned" };
}
