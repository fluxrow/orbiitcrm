import { describe, expect, it } from "vitest";
import {
  getOnboardingOperationalReadiness,
  resolveOnboardingChecklist,
} from "@/lib/onboarding-sections";

const trainedResponses = {
  ia: {
    persona_ia: "Consultora comercial",
    objetivo_ia: "Qualificar o contato",
    tom_voz: "Consultivo",
    regras_handoff: "Transferir quando houver intenção de compra",
  },
  caminho_lead: {
    qualificacao_inicial: "Validar perfil e necessidade",
  },
  integracoes: {
    whatsapp_provider: "Oficial Meta",
  },
};

describe("onboarding operational readiness", () => {
  it("does not treat a completed form as real go-live authorization", () => {
    const result = getOnboardingOperationalReadiness({
      status: "concluido",
      responses: trainedResponses,
      checklist: [
        { key: "ia", label: "Treinar IA", done: true },
        { key: "zapi", label: "Conectar Z-API", done: false },
      ],
    });

    expect(result.formComplete).toBe(true);
    expect(result.sandboxEligible).toBe(true);
    expect(result.realGoLiveEligible).toBe(false);
    expect(result.implementationProgress).toBe(50);
  });

  it("shows the selected provider without connecting or enabling it", () => {
    const checklist = resolveOnboardingChecklist(
      [{ key: "zapi", label: "Conectar Z-API", done: false }],
      trainedResponses,
    );

    expect(checklist[0].key).toBe("zapi");
    expect(checklist[0].label).toBe("Conectar WhatsApp (Oficial Meta) e validar número");
    expect(checklist[0].done).toBe(false);
  });

  it("keeps sandbox blocked when the minimum agent training is incomplete", () => {
    const result = getOnboardingOperationalReadiness({
      status: "concluido",
      responses: { ia: { persona_ia: "Consultora" } },
      checklist: [],
    });

    expect(result.formComplete).toBe(true);
    expect(result.sandboxEligible).toBe(false);
    expect(result.realGoLiveEligible).toBe(false);
  });

  it("requires every implementation item before real go-live eligibility", () => {
    const result = getOnboardingOperationalReadiness({
      status: "revisado",
      responses: trainedResponses,
      checklist: [
        { key: "ia", label: "Treinar IA", done: true },
        { key: "zapi", label: "Conectar WhatsApp", done: true },
      ],
    });

    expect(result.realGoLiveEligible).toBe(true);
  });
});
