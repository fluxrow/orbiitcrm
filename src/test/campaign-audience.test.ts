import { describe, expect, it } from "vitest";
import {
  buildCampaignAudienceFilters,
  isManualOnlyCampaignAudience,
} from "@/lib/orbit/campaign-audience";

describe("campaign audience safety", () => {
  it("persists only the explicitly reviewed recipient ids", () => {
    expect(buildCampaignAudienceFilters({}, ["prospect-1", "prospect-2"], [])).toEqual({
      selected_prospect_ids: ["prospect-1", "prospect-2"],
      selected_group_ids: [],
    });
  });

  it("distinguishes an exact manual audience from a broad filtered audience", () => {
    expect(isManualOnlyCampaignAudience({}, ["prospect-1", "prospect-2"], [])).toBe(true);
    expect(isManualOnlyCampaignAudience({}, [], ["group-1"])).toBe(true);
    expect(isManualOnlyCampaignAudience({ segmento: "Tecnologia" }, ["prospect-1"], [])).toBe(false);
    expect(isManualOnlyCampaignAudience({}, [], [])).toBe(false);
  });

  it("ignores empty filter controls when classifying a manual audience", () => {
    expect(isManualOnlyCampaignAudience({
      tags: [],
      segmento: "",
      apenas_consentimento: false,
      score_min: 0,
    }, ["prospect-1"], [])).toBe(true);
  });
});
