import { describe, it, expect } from "vitest";
import { isApplyable, getBlockReasons, type AdvisorSuggestion } from "@/hooks/useAdvisorSuggestions";

/**
 * Smoke test do gate do Orbit Advisor.
 *
 * Garante que sugestões fora do playbook do tenant (ex.: "Ativar IA em leads
 * novos" ou "Lembrete de Reunião 24h" oferecidas para a Viver enquanto a Viver
 * só aceita fluxos com prefixo "VIVER -") nunca sejam apresentadas como
 * "Ação aplicável" na UI. Elas continuam visíveis como diagnóstico.
 */

const base: Omit<AdvisorSuggestion, "action"> = {
  id: "sug-1",
  tipo: "flow_error_spike",
  titulo: "",
  racional: "",
  risco: "medio",
  status: "pending",
  gerada_em: new Date().toISOString(),
  expires_at: null,
};

function make(action: AdvisorSuggestion["action"], titulo = "Sugestão de teste"): AdvisorSuggestion {
  return { ...base, titulo, action };
}

describe("Advisor playbook gate — isApplyable", () => {
  it("bloqueia sugestão de fluxo fora do playbook do tenant Viver", () => {
    // Cenário Viver: playbook exige prefixo "VIVER -".
    const s = make({
      kind: "flow_pause",
      target_id: "flow-a",
      flow_name: "Ativar IA em leads novos",
      playbook_ok: false,
      playbook_prefixes: ["VIVER -"],
      apply_gate_reasons: ["flow_not_in_playbook"],
    }, "Ativar IA em leads novos");
    expect(isApplyable(s)).toBe(false);
    expect(getBlockReasons(s)).toContain("flow_not_in_playbook");
  });

  it("bloqueia sugestão dependente de agenda quando calendário não está pronto", () => {
    const s = make({
      kind: "flow_variation_propose",
      target_id: "flow-b",
      flow_name: "Lembrete de Reunião 24h",
      depends_on_calendar: true,
      calendar_ready: false,
      apply_gate_reasons: ["calendar_not_ready"],
    }, "Lembrete de Reunião 24h");
    expect(isApplyable(s)).toBe(false);
    expect(getBlockReasons(s)).toContain("calendar_not_ready");
  });

  it("bloqueia sugestão dependente de WhatsApp quando envio real está bloqueado", () => {
    const s = make({
      kind: "flow_pause",
      target_id: "flow-c",
      flow_name: "VIVER - Boas vindas",
      depends_on_whatsapp: true,
      zapi_available: true,
      envio_real_liberado: false,
      apply_gate_reasons: ["zapi_envio_real_bloqueado"],
    });
    expect(isApplyable(s)).toBe(false);
    expect(getBlockReasons(s)).toContain("zapi_envio_real_bloqueado");
  });

  it("permite aplicar sugestão dentro do playbook e sem dependências pendentes", () => {
    const s = make({
      kind: "flow_pause",
      target_id: "flow-d",
      flow_name: "VIVER - Follow-up 3 dias",
      playbook_ok: true,
      depends_on_whatsapp: false,
      depends_on_calendar: false,
      apply_gate_reasons: [],
    });
    expect(isApplyable(s)).toBe(true);
    expect(getBlockReasons(s)).toEqual([]);
  });

  it("nunca torna aplicáveis kinds fora da whitelist", () => {
    const s = make({
      kind: "flow_create",
      target_id: "flow-e",
      flow_name: "Ativar IA em leads novos",
    } as any);
    expect(isApplyable(s)).toBe(false);
  });
});
