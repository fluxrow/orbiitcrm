export interface OrbitCampaignAudienceFilters extends Record<string, unknown> {
  selected_prospect_ids: string[];
  selected_group_ids: string[];
}

export function buildCampaignAudienceFilters(
  filtros: Record<string, unknown> = {},
  selectedProspectIds: string[] = [],
  selectedGroupIds: string[] = [],
): OrbitCampaignAudienceFilters {
  return {
    ...filtros,
    selected_prospect_ids: selectedProspectIds,
    selected_group_ids: selectedGroupIds,
  };
}
