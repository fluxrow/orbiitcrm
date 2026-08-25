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

  it("does not let unused email and calendar integrations block go-live", () => {
    const result = getOnboardingOperationalReadiness({
      status: "concluido",
      responses: trainedResponses,
      checklist: [
        { key: "ia", label: "Treinar IA", done: true },
        { key: "zapi", label: "Conectar WhatsApp", done: true },
        { key: "resend", label: "Configurar Resend", done: false },
        { key: "calendar", label: "Validar calendário", done: false },
        { key: "kickoff", label: "Realizar kickoff", done: false },
      ],
    });

    expect(result.realGoLiveEligible).toBe(true);
    expect(result.requiredTotal).toBe(2);
    expect(result.optionalPendingLabels).toEqual(["Realizar kickoff"]);
    expect(result.notApplicableLabels).toEqual(["Configurar Resend", "Validar calendário"]);
    expect(result.pendingLabels).toEqual([]);
  });

  it("makes calendar a blocker when automated scheduling is part of the scope", () => {
    const result = getOnboardingOperationalReadiness({
      status: "concluido",
      responses: {
        ...trainedResponses,
        ia: { ...trainedResponses.ia, objetivo_ia: "Qualificar e agendar uma reunião" },
      },
      checklist: [
        { key: "ia", label: "Treinar IA", done: true },
        { key: "calendar", label: "Validar calendário", done: false },
      ],
    });

    expect(result.realGoLiveEligible).toBe(false);
    expect(result.pendingLabels).toEqual(["Validar calendário"]);
    expect(result.items.find((item) => item.key === "calendar")?.requirement).toBe("required");
  });
});
