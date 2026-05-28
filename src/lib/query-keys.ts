/**
 * Query key factory centralizado para garantir que invalidações
 * propaguem corretamente entre componentes.
 *
 * Regra: chaves derivadas usam o mesmo prefixo da raiz, para que
 * `invalidateQueries({ queryKey: orbitCampaignKeys.all })` invalide
 * a listagem E os counts de destinatários numa única chamada.
 */

export const orbitCampaignKeys = {
  all: ["orbit_campaigns"] as const,
  lists: () => [...orbitCampaignKeys.all, "list"] as const,
  list: (filters?: Record<string, unknown> | object) =>
    [...orbitCampaignKeys.lists(), filters ?? {}] as const,
  counts: () => [...orbitCampaignKeys.all, "recipient_counts"] as const,
  countsByIds: (ids: string[]) =>
    [...orbitCampaignKeys.counts(), [...ids].sort()] as const,
};

/**
 * Mesma lógica para prospects: todas as derivadas compartilham o
 * prefixo `orbit_prospects`, então invalidar `orbitProspectKeys.all`
 * atualiza listagens, detalhes e counts (globais e por empresa).
 */
export const orbitProspectKeys = {
  all: ["orbit_prospects"] as const,
  lists: () => [...orbitProspectKeys.all, "list"] as const,
  list: (filters?: Record<string, unknown> | object) =>
    [...orbitProspectKeys.lists(), filters ?? {}] as const,
  details: () => [...orbitProspectKeys.all, "detail"] as const,
  detail: (id: string) => [...orbitProspectKeys.details(), id] as const,
  counts: () => [...orbitProspectKeys.all, "count"] as const,
  count: () => [...orbitProspectKeys.counts(), "global"] as const,
  countByEmpresa: (empresaId: string | null) =>
    [...orbitProspectKeys.counts(), "empresa", empresaId] as const,
};
