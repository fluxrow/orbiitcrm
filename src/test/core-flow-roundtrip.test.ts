// E2E do round-trip do [CORE] Orbit Core Flow:
//   1. Serializa a definicao seedada via buildTemplateExport (simula "Exportar" no UI).
//   2. Escreve → lê o JSON (simula gravar arquivo e recarregar).
//   3. parseTemplateImport (simula "Importar" no UI).
//   4. Valida que TODAS as 7 etapas estão íntegras após o round-trip:
//      switch origem, IA qualificação, if/else qualificado, sub-if/else renda,
//      delay 3h, IA follow-up, switch status, if/else handoff.
import { describe, it, expect } from "vitest";
import coreFlowDefinicao from "./fixtures/core-flow.definicao.json";
import {
  buildTemplateExport,
  parseTemplateImport,
  FLOW_TEMPLATE_EXPORT_VERSION,
} from "@/lib/flowTemplateSchema";

const CORE_META = {
  nome: "[CORE] Orbit Core Flow",
  descricao:
    "Espinha dorsal universal: ingestão de lead → tag de origem → qualificação IA → deal + notificação OU nurturing/downsell → follow-up cadenciado → handoff. Customize apenas os templates de mensagem [CORE] e o prompt de identidade da IA.",
  categoria: "Core",
  definicao: coreFlowDefinicao,
};

function roundTrip() {
  const exported = buildTemplateExport(CORE_META);
  // simula "download" + "upload"
  const asString = JSON.stringify(exported, null, 2);
  const parsed = parseTemplateImport(asString);
  if (parsed.ok !== true) throw new Error(`import falhou: ${(parsed as any).error}`);
  return parsed.data;
}

describe("[CORE] Orbit Core Flow — round-trip export/import", () => {
  it("exporta com versão e metadados corretos", () => {
    const exp = buildTemplateExport(CORE_META);
    expect(exp.version).toBe(FLOW_TEMPLATE_EXPORT_VERSION);
    expect(exp.nome).toBe("[CORE] Orbit Core Flow");
    expect(exp.categoria).toBe("Core");
    expect(exp.exported_from).toBe("orbit-crm");
    expect(typeof exp.exported_at).toBe("string");
  });

  it("importa de volta sem perdas (schema Zod aceita)", () => {
    const data = roundTrip();
    expect(data.nome).toBe(CORE_META.nome);
    expect(data.descricao).toBe(CORE_META.descricao);
    expect(data.categoria).toBe(CORE_META.categoria);
    expect(data.definicao.trigger_type).toBe("lead_recebido");
    expect(Array.isArray(data.definicao.actions)).toBe(true);
  });

  it("rejeita JSON inválido e reporta erro estruturado", () => {
    const bad = parseTemplateImport("{ not json");
    expect(bad.ok).toBe(false);
    if (bad.ok === false) expect(bad.error).toMatch(/JSON inválido/i);

    const badSchema = parseTemplateImport(JSON.stringify({ nome: "x" }));
    expect(badSchema.ok).toBe(false);
  });

  // ── Validação estrutural: as 7 etapas do Core Flow ───────────────
  it("etapa 1 — SWITCH de prospect.origem com 2 casos + default", () => {
    const a = roundTrip().definicao.actions![0];
    expect(a.action_type).toBe("switch");
    expect(a.action_config.field).toBe("prospect.origem");
    const cases = a.action_config.cases as any[];
    expect(cases).toHaveLength(2);
    expect(cases[0].id).toBe("c_ads");
    expect(cases[0].match.value).toContain("instagram");
    expect(cases[1].id).toBe("c_site");
    expect(cases[1].match.value).toContain("typebot");
    expect(a.action_config.default).toBeDefined();
  });

  it("etapa 2 — IA Agent de qualificação inicial", () => {
    const a = roundTrip().definicao.actions![1];
    expect(a.action_type).toBe("toggle_ai_agent");
    expect(a.action_config.prompt_slug).toBe("CORE_QUALIFICACAO_INICIAL");
    expect(a.action_config.human_talk).toBe(false);
  });

  it("etapa 3 — IF/ELSE qualificado com sub-IF/ELSE renda_baixa no ELSE", () => {
    const a = roundTrip().definicao.actions![2];
    expect(a.action_type).toBe("if_else");
    const cond = a.action_config.condition;
    expect(cond.logic).toBe("AND");
    expect(cond.children[0].field).toBe("prospect.qualificado");
    expect(cond.children[0].op).toBe("equals");
    expect(cond.children[0].value).toBe("true");

    // THEN: cria tarefa + notifica vendedor
    const thenActions = a.action_config.then as any[];
    expect(thenActions.map((x) => x.action_type)).toEqual([
      "create_task",
      "notify_vendedor",
    ]);
    expect(thenActions[1].action_config.template_slug).toBe(
      "[CORE] Novo Deal Qualificado",
    );

    // ELSE: sub if_else de renda_baixa
    const elseActions = a.action_config.else as any[];
    expect(elseActions).toHaveLength(1);
    const subIf = elseActions[0];
    expect(subIf.action_type).toBe("if_else");
    expect(subIf.action_config.condition.children[0].field).toBe(
      "prospect.renda_baixa",
    );
    expect(subIf.action_config.then[0].action_config.template_slug).toBe(
      "[CORE] OFFER_LOW_TICKET",
    );
    expect(subIf.action_config.else[0].action_config.template_slug).toBe(
      "[CORE] NURTURING_GENERICO",
    );
  });

  it("etapa 4 — delay de 3 horas", () => {
    const a = roundTrip().definicao.actions![3];
    expect(a.action_type).toBe("delay_execution");
    expect(a.action_config.wait_value).toBe(3);
    expect(a.action_config.wait_unit).toBe("hours");
  });

  it("etapa 5 — IA Agent de follow-up", () => {
    const a = roundTrip().definicao.actions![4];
    expect(a.action_type).toBe("toggle_ai_agent");
    expect(a.action_config.prompt_slug).toBe("CORE_FOLLOWUP");
  });

  it("etapa 6 — SWITCH de conversa.status (aberta/encerrada)", () => {
    const a = roundTrip().definicao.actions![5];
    expect(a.action_type).toBe("switch");
    expect(a.action_config.field).toBe("conversa.status");
    const cases = a.action_config.cases as any[];
    expect(cases.map((c) => c.id)).toEqual(["aberta", "encerrada"]);
    // aberta agenda re-check em 24h
    expect(cases[0].actions[0].action_type).toBe("delay_execution");
    expect(cases[0].actions[0].action_config.wait_value).toBe(24);
  });

  it("etapa 7 — IF/ELSE de handoff dispara notificação + tarefa urgente", () => {
    const a = roundTrip().definicao.actions![6];
    expect(a.action_type).toBe("if_else");
    expect(a.action_config.condition.children[0].field).toBe("conversa.status");
    expect(a.action_config.condition.children[0].value).toBe("handoff");
    const then = a.action_config.then as any[];
    expect(then.map((x) => x.action_type)).toEqual([
      "notify_vendedor",
      "create_task",
    ]);
    expect(then[0].action_config.template_slug).toBe("[CORE] Handoff Ouro");
    expect(then[1].action_config.prazo_dias).toBe(0);
  });

  it("total: 7 etapas top-level (nada foi perdido no reload)", () => {
    const actions = roundTrip().definicao.actions!;
    expect(actions).toHaveLength(7);
    expect(actions.map((a) => a.action_type)).toEqual([
      "switch",
      "toggle_ai_agent",
      "if_else",
      "delay_execution",
      "toggle_ai_agent",
      "switch",
      "if_else",
    ]);
  });
});
