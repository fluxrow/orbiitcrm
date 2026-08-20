export type TenantShadowComparison = {
  matches: boolean;
  legacyCount: number;
  scopedCount: number;
};

function sortedIds(rows: Array<{ id?: string | null }>): string[] {
  return rows.flatMap(row => row.id ? [row.id] : []).sort();
}

export function compareProspectShadow(
  legacy: { id?: string | null; empresa_id?: string | null } | null,
  scoped: { id?: string | null; empresa_id?: string | null } | null,
  expectedTenantId: string,
): TenantShadowComparison {
  const legacyIds = sortedIds(legacy ? [legacy] : []);
  const scopedIds = sortedIds(scoped ? [scoped] : []);
  return {
    matches:
      JSON.stringify(legacyIds) === JSON.stringify(scopedIds)
      && (!legacy || legacy.empresa_id === expectedTenantId)
      && (!scoped || scoped.empresa_id === expectedTenantId),
    legacyCount: legacyIds.length,
    scopedCount: scopedIds.length,
  };
}

export function compareFunnelShadow(
  legacyStages: Array<{ id?: string | null; deals?: Array<{ id?: string | null }> }> | undefined,
  scopedStages: Array<{ id?: string | null; deals?: Array<{ id?: string | null }> }> | undefined,
): TenantShadowComparison {
  const legacyIds = sortedIds((legacyStages ?? []).flatMap(stage => stage.deals ?? []));
  const scopedIds = sortedIds((scopedStages ?? []).flatMap(stage => stage.deals ?? []));
  const legacyStageIds = sortedIds(legacyStages ?? []);
  const scopedStageIds = sortedIds(scopedStages ?? []);
  return {
    matches:
      JSON.stringify(legacyIds) === JSON.stringify(scopedIds)
      && JSON.stringify(legacyStageIds) === JSON.stringify(scopedStageIds),
    legacyCount: legacyIds.length,
    scopedCount: scopedIds.length,
  };
}
