export const PROSPECTING_QUOTA_SOURCES = [
  "campaign",
  "flow_initial",
  "flow_followup",
] as const;

const PROSPECTING_QUOTA_SOURCE_SET = new Set<string>(PROSPECTING_QUOTA_SOURCES);

export function consumesProspectingQuota(sourceType: string | null | undefined): boolean {
  return PROSPECTING_QUOTA_SOURCE_SET.has(String(sourceType ?? ""));
}

export function saoPauloDayStartIso(now = new Date()): string {
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  // Brazil has observed UTC-03 year-round since 2019.
  return `${date}T03:00:00.000Z`;
}
