import { describe, expect, it } from "vitest";
import {
  detectOnboardingSchemaVersion,
  getOnboardingCompatibilitySummary,
} from "@/lib/onboarding-sections";

describe("onboarding schema compatibility", () => {
  it("identifies the current form by its current-only sections", () => {
    expect(detectOnboardingSchemaVersion({ empresa: {}, caminho_lead: {} })).toBe("current_v2");
    expect(detectOnboardingSchemaVersion({ empresa: {}, midias: {} })).toBe("current_v2");
  });

  it("identifies the previous high-ticket form without rewriting it", () => {
    const responses = { empresa: {}, ativos: {}, jornada: {}, qualificacao: {} };
    const summary = getOnboardingCompatibilitySummary(responses);
    expect(summary.schemaVersion).toBe("legacy_high_ticket_v1");
    expect(summary.isHistorical).toBe(true);
    expect(summary.schemaLabel).toBe("Formulário histórico v1");
  });

  it("keeps legacy MVP and empty responses distinguishable", () => {
    expect(detectOnboardingSchemaVersion({ empresa: {}, equipe: {} })).toBe("legacy_mvp");
    expect(detectOnboardingSchemaVersion({})).toBe("unknown");
  });
});
