// Marcador tenant-scoped de reengajamento controlado (Viver Semijoias).
//
// Escopo MÍNIMO e explícito: apenas campanhas (`source_type='campaign'`) do tenant
// Viver Semijoias que carregam `metadata.viver_controlled_reengagement === true`
// podem ignorar EXCLUSIVAMENTE o motivo de corte temporal
// `auto_reply_new_leads_from` (reason `automation_cutoff`).
//
// Nenhum outro bloqueio é afetado: human_talk/handoff, opt-out, cross-tenant,
// prospect deletado, deal terminal, reunião futura, campaign-safety, cota, janela
// e idempotência continuam valendo integralmente.

export const VIVER_CONTROLLED_REENGAGEMENT_EMPRESA_ID =
  "36f26579-66ad-4ef1-9788-141e4c727232";

export const VIVER_CONTROLLED_REENGAGEMENT_METADATA_KEY =
  "viver_controlled_reengagement";

export interface ControlledReengagementInput {
  empresa_id?: string | null;
  source_type?: string | null;
  /** Campo tipado propagado pelo produtor/worker. */
  controlled_reengagement?: boolean | null;
  /** Metadata persistida no item de outbox (fonte no re-check do worker). */
  metadata?: Record<string, unknown> | null;
}

/** True somente para campanha controlada do tenant Viver com marcador explícito. */
export function isViverControlledReengagement(
  input: ControlledReengagementInput,
): boolean {
  if (input.empresa_id !== VIVER_CONTROLLED_REENGAGEMENT_EMPRESA_ID) return false;
  if (input.source_type !== "campaign") return false;
  if (input.controlled_reengagement === true) return true;
  return input.metadata?.[VIVER_CONTROLLED_REENGAGEMENT_METADATA_KEY] === true;
}

/** Lê o marcador a partir da metadata persistida (usado no re-check do worker). */
export function controlledReengagementFromMetadata(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  return metadata?.[VIVER_CONTROLLED_REENGAGEMENT_METADATA_KEY] === true;
}
