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
