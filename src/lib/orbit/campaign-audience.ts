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

export function isManualOnlyCampaignAudience(
  filtros: Record<string, unknown> = {},
  selectedProspectIds: string[] = [],
  selectedGroupIds: string[] = [],
): boolean {
  const hasManualSelection = selectedProspectIds.length > 0 || selectedGroupIds.length > 0;
  if (!hasManualSelection) return false;

  return !Object.values(filtros).some((value) => {
    if (value == null || value === false || value === "") return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "number") return value > 0;
    return true;
  });
}
