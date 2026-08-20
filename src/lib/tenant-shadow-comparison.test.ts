import { describe, expect, it } from "vitest";
import { compareFunnelShadow, compareProspectShadow } from "./tenant-shadow-comparison";

describe("tenant shadow comparison", () => {
  it("requires prospect identity and tenant equality", () => {
    expect(compareProspectShadow(
      { id: "p1", empresa_id: "fluxrow-id" },
      { id: "p1", empresa_id: "fluxrow-id" },
      "fluxrow-id",
    ).matches).toBe(true);
    expect(compareProspectShadow(
      { id: "p1", empresa_id: "other-id" },
      { id: "p1", empresa_id: "fluxrow-id" },
      "fluxrow-id",
    ).matches).toBe(false);
  });

  it("compares funnel stage and deal sets independent of order", () => {
    const result = compareFunnelShadow(
      [{ id: "s1", deals: [{ id: "d2" }, { id: "d1" }] }],
      [{ id: "s1", deals: [{ id: "d1" }, { id: "d2" }] }],
    );
    expect(result).toEqual({ matches: true, legacyCount: 2, scopedCount: 2 });
  });

  it("reports sanitized counts on divergence", () => {
    const result = compareFunnelShadow(
      [{ id: "s1", deals: [{ id: "d1" }] }],
      [{ id: "s1", deals: [] }],
    );
    expect(result).toEqual({ matches: false, legacyCount: 1, scopedCount: 0 });
  });
});
