import { describe, expect, it } from "vitest";
import { getTenantOperationsReadContract } from "./tenant-operations-context";

describe("getTenantOperationsReadContract", () => {
  it("uses the explicit tenant-scoped RPC when the canary flag is enabled", () => {
    expect(getTenantOperationsReadContract("queues", "fluxrow", true)).toEqual({
      rpc: "orbit_tenant_ops_read_scoped",
      args: { p_tenant_slug: "fluxrow", p_section: "queues" },
    });
  });

  it("preserves the legacy contract while the rollout flag is disabled", () => {
    expect(getTenantOperationsReadContract("health", "bullink-negocios", false)).toEqual({
      rpc: "orbit_tenant_ops_read",
      args: { p_section: "health" },
    });
  });
});
