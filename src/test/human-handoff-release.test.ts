import { describe, it, expect } from "vitest";
import { getConversaOwnership } from "@/lib/conversa-ownership";

const aiOn = { modo_automatico: true, auto_reply_new_leads_from: null };

describe("posse da conversa — devolução humano → IA", () => {
  it("humano assumiu no Orbit: pode devolver quando modo automático está ligado", () => {
    const o = getConversaOwnership({
      conversa: { human_talk: true, human_user_id: "u1" },
      aiConfig: aiOn,
    });
    expect(o.state).toBe("human_assigned");
    expect(o.canRelease).toBe(true);
  });

  it("modo automático desligado bloqueia devolução", () => {
    const o = getConversaOwnership({
      conversa: { human_talk: true, human_user_id: "u1" },
      aiConfig: { modo_automatico: false, auto_reply_new_leads_from: null },
    });
    expect(o.canRelease).toBe(false);
    expect(o.releaseBlockedReason).toBeTruthy();
  });

  it("lead anterior ao corte bloqueia devolução", () => {
    const o = getConversaOwnership({
      conversa: { human_talk: true, human_user_id: "u1" },
      prospect: { created_at: "2026-01-01T00:00:00Z" },
      aiConfig: { modo_automatico: true, auto_reply_new_leads_from: "2026-06-01T00:00:00Z" },
    });
    expect(o.canRelease).toBe(false);
  });

  it("atendimento humano externo (celular): sem human_user_id, mas pode assumir ou devolver", () => {
    const o = getConversaOwnership({
      conversa: {
        human_talk: true,
        human_user_id: null,
        ai_contexto: { external_human_active: true },
      },
      aiConfig: aiOn,
    });
    expect(o.state).toBe("human_external");
    expect(o.statusLabel).toBe("Atendimento humano externo");
    expect(o.canAssume).toBe(true);
    expect(o.canRelease).toBe(true);
  });

  it("aguardando humano (isolamento) continua sem devolução direta", () => {
    const o = getConversaOwnership({
      conversa: { human_talk: true, human_user_id: null },
      aiConfig: aiOn,
    });
    expect(o.state).toBe("awaiting_human");
    expect(o.canRelease).toBe(false);
  });

  it("posse da IA após release: handoff histórico não muda o estado", () => {
    const o = getConversaOwnership({
      conversa: { human_talk: false, human_user_id: null, ai_contexto: { last_ai_release: { at: "x" } } as any },
      aiConfig: aiOn,
    });
    expect(o.state).toBe("ai");
    expect(o.canAssume).toBe(true);
  });
});
