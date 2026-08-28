import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  aggregateAnthropicCosts,
  resolveProviderHealthStatus,
} from "./ai-provider-health.ts";

const config = {
  warning_days_remaining: 7,
  critical_days_remaining: 3,
  warning_balance_usd: 20,
  critical_balance_usd: 10,
  baseline_credit_usd: 100,
  baseline_recorded_at: "2026-08-01T00:00:00Z",
};

Deno.test("agrega custos oficiais e calcula saldo estimado", () => {
  const metrics = aggregateAnthropicCosts(
    [
      {
        starting_at: "2026-08-27T00:00:00Z",
        results: [{ amount: "14", currency: "USD" }],
      },
      {
        starting_at: "2026-08-28T00:00:00Z",
        results: [{ amount: "6", currency: "USD" }],
      },
      {
        starting_at: "2026-08-01T00:00:00Z",
        results: [{ amount: "30", currency: "USD" }],
      },
    ],
    config,
    new Date("2026-08-28T12:00:00Z"),
  );

  assertEquals(metrics.cost_today_usd, 6);
  assertEquals(metrics.cost_7d_usd, 20);
  assertEquals(metrics.cost_30d_usd, 50);
  assertEquals(metrics.estimated_balance_usd, 50);
  assertEquals(metrics.projected_days_remaining, 17.5);
});

Deno.test("crédito esgotado prevalece sobre saúde do probe", () => {
  const metrics = aggregateAnthropicCosts(
    [
      {
        starting_at: "2026-08-01T00:00:00Z",
        results: [{ amount: "100", currency: "USD" }],
      },
    ],
    config,
    new Date("2026-08-28T12:00:00Z"),
  );
  assertEquals(
    resolveProviderHealthStatus({
      providerOk: true,
      adminApiConfigured: true,
      adminApiOk: true,
      metrics,
      config,
    }),
    "depleted",
  );
});

Deno.test("erro de autenticação do relatório degrada o monitor sem inventar saldo", () => {
  const noBaseline = {
    ...config,
    baseline_credit_usd: null,
    baseline_recorded_at: null,
  };
  const metrics = aggregateAnthropicCosts(
    [],
    noBaseline,
    new Date("2026-08-28T12:00:00Z"),
  );
  assertEquals(metrics.estimated_balance_usd, null);
  assertEquals(
    resolveProviderHealthStatus({
      providerOk: true,
      adminApiConfigured: true,
      adminApiOk: false,
      metrics,
      config: noBaseline,
    }),
    "degraded",
  );
});
