export type ProviderHealthStatus =
  | "healthy"
  | "warning"
  | "critical"
  | "depleted"
  | "degraded"
  | "unknown";

export interface ProviderMonitorConfig {
  warning_days_remaining: number;
  critical_days_remaining: number;
  warning_balance_usd: number;
  critical_balance_usd: number;
  baseline_credit_usd: number | null;
  baseline_recorded_at: string | null;
}

export interface AnthropicCostBucket {
  starting_at?: string;
  ending_at?: string;
  results?: Array<{ amount?: string | number; currency?: string }>;
}

export interface CostMetrics {
  currency: string;
  cost_today_usd: number;
  cost_7d_usd: number;
  cost_30d_usd: number;
  cost_since_baseline_usd: number | null;
  average_daily_cost_7d_usd: number;
  estimated_balance_usd: number | null;
  projected_days_remaining: number | null;
}

function round(value: number, decimals = 6): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function bucketAmount(bucket: AnthropicCostBucket): number {
  return (bucket.results ?? []).reduce((sum, item) => {
    const amount = Number(item?.amount ?? 0);
    return sum + (Number.isFinite(amount) && amount > 0 ? amount : 0);
  }, 0);
}

export function aggregateAnthropicCosts(
  buckets: AnthropicCostBucket[],
  config: ProviderMonitorConfig,
  now = new Date(),
): CostMetrics {
  const nowMs = now.getTime();
  const dayMs = 86_400_000;
  const todayStart = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const sevenDaysStart = todayStart - 6 * dayMs;
  const thirtyDaysStart = todayStart - 29 * dayMs;
  const baselineMs = config.baseline_recorded_at
    ? Date.parse(config.baseline_recorded_at)
    : Number.NaN;

  let today = 0;
  let seven = 0;
  let thirty = 0;
  let sinceBaseline = 0;
  let hasBaselineCoverage = Number.isFinite(baselineMs);
  let currency = "USD";

  for (const bucket of buckets) {
    const start = Date.parse(bucket.starting_at ?? "");
    if (!Number.isFinite(start) || start > nowMs) continue;
    const amount = bucketAmount(bucket);
    const firstCurrency = bucket.results?.find((r) => r.currency)?.currency;
    if (firstCurrency) currency = firstCurrency;
    if (start >= todayStart) today += amount;
    if (start >= sevenDaysStart) seven += amount;
    if (start >= thirtyDaysStart) thirty += amount;
    if (Number.isFinite(baselineMs) && start >= baselineMs) {
      sinceBaseline += amount;
    }
  }

  if (Number.isFinite(baselineMs)) {
    const oldest = buckets
      .map((b) => Date.parse(b.starting_at ?? ""))
      .filter(Number.isFinite)
      .sort((a, b) => a - b)[0];
    hasBaselineCoverage = Number.isFinite(oldest) && oldest <= baselineMs;
  }

  const avg7 = seven / 7;
  const estimated = config.baseline_credit_usd != null && hasBaselineCoverage
    ? Math.max(0, Number(config.baseline_credit_usd) - sinceBaseline)
    : null;
  const projected = estimated != null && avg7 > 0 ? estimated / avg7 : null;

  return {
    currency,
    cost_today_usd: round(today),
    cost_7d_usd: round(seven),
    cost_30d_usd: round(thirty),
    cost_since_baseline_usd: config.baseline_credit_usd == null
      ? null
      : round(sinceBaseline),
    average_daily_cost_7d_usd: round(avg7),
    estimated_balance_usd: estimated == null ? null : round(estimated),
    projected_days_remaining: projected == null ? null : round(projected, 2),
  };
}

export function resolveProviderHealthStatus(input: {
  providerOk: boolean | null;
  providerErrorCode?: string | null;
  adminApiConfigured: boolean;
  adminApiOk: boolean;
  metrics: CostMetrics;
  config: ProviderMonitorConfig;
}): ProviderHealthStatus {
  if (
    input.providerErrorCode === "credits" ||
    input.metrics.estimated_balance_usd === 0
  ) {
    return "depleted";
  }
  if (input.providerOk === false) return "degraded";
  if (input.adminApiConfigured && !input.adminApiOk) return "degraded";

  const balance = input.metrics.estimated_balance_usd;
  const days = input.metrics.projected_days_remaining;
  if (
    (balance != null && balance <= Number(input.config.critical_balance_usd)) ||
    (days != null && days <= Number(input.config.critical_days_remaining))
  ) return "critical";
  if (
    (balance != null && balance <= Number(input.config.warning_balance_usd)) ||
    (days != null && days <= Number(input.config.warning_days_remaining))
  ) return "warning";

  if (input.providerOk === true) return "healthy";
  return "unknown";
}

export function providerAlertMessage(
  status: ProviderHealthStatus,
  metrics: CostMetrics,
): string {
  const balance = metrics.estimated_balance_usd == null
    ? "não configurado"
    : `US$ ${metrics.estimated_balance_usd.toFixed(2)}`;
  const days = metrics.projected_days_remaining == null
    ? "indisponível"
    : `${metrics.projected_days_remaining.toFixed(1)} dias`;
  return `Anthropic: status ${status}; saldo estimado ${balance}; projeção ${days}; custo 7d US$ ${
    metrics.cost_7d_usd.toFixed(2)
  }.`;
}
