import { describe, it, expect } from "vitest";
import {
  getConversaOwnership,
  isProspectAfterCutoff,
  RELEASE_BLOCKED_CUTOFF_MESSAGE,
  RELEASE_BLOCKED_AUTOMATIC_OFF_MESSAGE,
} from "@/lib/conversa-ownership";

const CUTOFF = "2026-08-11T19:34:16.656913Z";
const cutoffMs = Date.parse(CUTOFF);
const iso = (ms: number) => new Date(ms).toISOString();

const auto = { modo_automatico: true, auto_reply_new_leads_from: CUTOFF };
const autoOff = { modo_automatico: false, auto_reply_new_leads_from: CUTOFF };
const noCutoff = { modo_automatico: true, auto_reply_new_leads_from: null };

describe("isProspectAfterCutoff", () => {
  it("1ms antes do corte não passa", () => {
    expect(isProspectAfterCutoff(CUTOFF, iso(cutoffMs - 1))).toBe(false);
  });
  it("exatamente no corte passa", () => {
    expect(isProspectAfterCutoff(CUTOFF, iso(cutoffMs))).toBe(true);
  });
  it("depois do corte passa", () => {
    expect(isProspectAfterCutoff(CUTOFF, iso(cutoffMs + 1000))).toBe(true);
  });
  it("sem cutoff preserva comportamento dos outros tenants", () => {
    expect(isProspectAfterCutoff(null, iso(cutoffMs - 999999))).toBe(true);
  });
});

describe("estado A — IA responsável", () => {
  it("modo automático ligado mostra 'Com a IA' e permite assumir", () => {
    const o = getConversaOwnership({
      conversa: { human_talk: false, human_user_id: null },
      prospect: { created_at: iso(cutoffMs + 1) },
      aiConfig: auto,
    });
    expect(o.state).toBe("ai");
    expect(o.statusLabel).toBe("Com a IA");
    expect(o.canAssume).toBe(true);
    expect(o.canRelease).toBe(false);
  });

  it("modo automático desligado mostra 'IA pausada'", () => {
    const o = getConversaOwnership({
      conversa: { human_talk: false, human_user_id: null },
      prospect: { created_at: iso(cutoffMs + 1) },
      aiConfig: autoOff,
    });
    expect(o.state).toBe("ai_paused");
    expect(o.statusLabel).toBe("IA pausada");
    expect(o.canAssume).toBe(true);
  });
});

describe("estado B — humano assumiu", () => {
  it("mostra nome do responsável e permite devolver quando elegível", () => {
    const o = getConversaOwnership({
      conversa: { human_talk: true, human_user_id: "u1", human_user: { nome: "Fernando" } },
      prospect: { created_at: iso(cutoffMs) },
      aiConfig: auto,
    });
    expect(o.state).toBe("human_assigned");
    expect(o.statusLabel).toBe("Com Fernando");
    expect(o.canRelease).toBe(true);
    expect(o.canAssume).toBe(false);
    expect(o.releaseBlockedReason).toBeNull();
  });

  it("lead anterior ao corte bloqueia devolução para a IA", () => {
    const o = getConversaOwnership({
      conversa: { human_talk: true, human_user_id: "u1", human_user: { nome: "Fernando" } },
      prospect: { created_at: iso(cutoffMs - 1) },
      aiConfig: auto,
    });
    expect(o.canRelease).toBe(false);
    expect(o.beforeCutoff).toBe(true);
    expect(o.releaseBlockedReason).toBe(RELEASE_BLOCKED_CUTOFF_MESSAGE);
  });

  it("modo automático desligado bloqueia devolução mesmo pós-corte", () => {
    const o = getConversaOwnership({
      conversa: { human_talk: true, human_user_id: "u1" },
      prospect: { created_at: iso(cutoffMs + 5000) },
      aiConfig: autoOff,
    });
    expect(o.canRelease).toBe(false);
    expect(o.releaseBlockedReason).toBe(RELEASE_BLOCKED_AUTOMATIC_OFF_MESSAGE);
  });

  it("sem nome do responsável usa rótulo genérico", () => {
    const o = getConversaOwnership({
      conversa: { human_talk: true, human_user_id: "u1", human_user: { nome: "  " } },
      prospect: { created_at: iso(cutoffMs) },
      aiConfig: auto,
    });
    expect(o.statusLabel).toBe("Com atendimento humano");
  });
});

describe("estado C — bloqueada sem responsável", () => {
  it("mostra 'Aguardando atendimento humano' sem devolver para IA", () => {
    const o = getConversaOwnership({
      conversa: { human_talk: true, human_user_id: null },
      prospect: { created_at: iso(cutoffMs + 1) },
      aiConfig: auto,
    });
    expect(o.state).toBe("awaiting_human");
    expect(o.statusLabel).toBe("Aguardando atendimento humano");
    expect(o.canAssume).toBe(true);
    expect(o.canRelease).toBe(false);
  });

  it("as 72+ conversas legadas caem em atendimento humano obrigatório", () => {
    const o = getConversaOwnership({
      conversa: { human_talk: true, human_user_id: null },
      prospect: { created_at: iso(cutoffMs - 86400000) },
      aiConfig: auto,
    });
    expect(o.state).toBe("awaiting_human");
    expect(o.canRelease).toBe(false);
    expect(o.releaseBlockedReason).toBe(RELEASE_BLOCKED_CUTOFF_MESSAGE);
  });
});

describe("tenants sem cutoff", () => {
  it("devolução para IA continua liberada (Fluxrow intacta)", () => {
    const o = getConversaOwnership({
      conversa: { human_talk: true, human_user_id: "u1", human_user: { nome: "Cauã" } },
      prospect: { created_at: "2020-01-01T00:00:00Z" },
      aiConfig: noCutoff,
    });
    expect(o.beforeCutoff).toBe(false);
    expect(o.canRelease).toBe(true);
  });
});

describe("bordas", () => {
  it("conversa ausente ou config ausente não quebra", () => {
    const o = getConversaOwnership({ conversa: null, prospect: null, aiConfig: null });
    expect(o.state).toBe("ai_paused");
    expect(o.canAssume).toBe(true);
  });

  it("prospect sem created_at com cutoff é tratado como anterior ao corte", () => {
    const o = getConversaOwnership({
      conversa: { human_talk: true, human_user_id: "u1" },
      prospect: { created_at: null },
      aiConfig: auto,
    });
    expect(o.beforeCutoff).toBe(true);
    expect(o.canRelease).toBe(false);
  });
});
