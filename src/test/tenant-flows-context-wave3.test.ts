import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(__dirname, path), "utf8");
const hook = read("../hooks/useOrbitFlows.ts");
const reorder = read("../hooks/useReorderFlowActions.ts");
const instantiate = read("../hooks/useInstantiateCoreFlow.ts");
const conditions = read("../components/orbit/FlowConditionsDialog.tsx");
const migration = read("../../supabase/migrations/20260821090000_tenant_flows_context_wave3_part5.sql");

describe("tenant flows context wave 3.5", () => {
  it("routes canary reads and writes through slug-scoped RPCs", () => {
    expect(hook).toContain("tenant_flows_context_wave3_v1");
    expect(hook).toContain("orbit_tenant_flows_read_scoped");
    expect(hook).toContain("orbit_tenant_flows_mutate_scoped");
    expect(reorder).toContain('"reorder_actions"');
    expect(instantiate).toContain('"create_flow"');
    expect(conditions).toContain('"update_conditions"');
  });

  it("validates flow ownership and protects direct DML in the canary", () => {
    expect(migration).toContain("FLOW_TENANT_MISMATCH");
    expect(migration).toContain("FLOW_ACTION_TENANT_MISMATCH");
    expect(migration).toContain("AS RESTRICTIVE");
    expect(migration).toContain("orbit_tenant_flows_direct_dml_allowed");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.orbit_tenant_flows_mutate_scoped");
  });

  it("keeps the rollout exclusive to Fluxrow", () => {
    expect(migration).toContain("e.slug='fluxrow'");
    expect(migration).toContain("('bullink-negocios',false)");
    expect(migration).toContain("('fabrica-de-pesquisadores',false)");
    expect(migration).toContain("('viver-semijoias',false)");
  });
});
