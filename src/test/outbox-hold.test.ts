import { describe, it, expect } from "vitest";
import {
  evaluateHoldGate,
  parseHoldUntilMs,
  recoveryTagOf,
  isDeliveredOutStatus,
  OUTBOX_HOLD_REASON,
  RECOVERY_SPACING_REASON,
} from "../../supabase/functions/_shared/outbox-hold.ts";

const NOW = Date.parse("2026-08-12T15:00:00.000Z");
const TAG = "recovery-fora-horario-20260812c";

describe("outbox hold gate", () => {
  it("bloqueia quando outbox_hold_until é futuro (sem enviar, sem attempts)", () => {
    const v = evaluateHoldGate({
      metadata: { outbox_hold_until: "2026-08-12T15:30:00.000Z" },
      nowMs: NOW,
    });
    expect(v.allowed).toBe(false);
    expect(v.reason).toBe(OUTBOX_HOLD_REASON);
    expect(v.retryAtIso).toBe("2026-08-12T15:30:00.000Z");
  });

  it("libera exatamente no instante do hold", () => {
    const v = evaluateHoldGate({
      metadata: { outbox_hold_until: "2026-08-12T15:00:00.000Z" },
      nowMs: NOW,
    });
    expect(v.allowed).toBe(true);
    expect(v.reason).toBeNull();
  });

  it("libera quando o hold já passou", () => {
    const v = evaluateHoldGate({
      metadata: { outbox_hold_until: "2026-08-12T14:59:59.999Z" },
      nowMs: NOW,
    });
    expect(v.allowed).toBe(true);
  });

  it("hold inválido ou ausente mantém comportamento legado", () => {
    for (const metadata of [
      {},
      null,
      undefined,
      { outbox_hold_until: null },
      { outbox_hold_until: "" },
      { outbox_hold_until: "amanhã" },
      { outbox_hold_until: 99999 },
    ]) {
      const v = evaluateHoldGate({ metadata, nowMs: NOW });
      expect(v.allowed).toBe(true);
      expect(parseHoldUntilMs(metadata)).toBeNull();
    }
  });

  it("espaçamento de 180s por recovery: bloqueia antes, libera em >= 180s", () => {
    const last = Date.parse("2026-08-12T14:58:00.000Z"); // 120s atrás
    const blocked = evaluateHoldGate({
      metadata: { recovery_tag: TAG },
      nowMs: NOW,
      lastRecoverySentAtMs: last,
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBe(RECOVERY_SPACING_REASON);
    expect(blocked.retryAtIso).toBe("2026-08-12T15:01:00.000Z");

    const exact = evaluateHoldGate({
      metadata: { recovery_tag: TAG },
      nowMs: last + 180_000,
      lastRecoverySentAtMs: last,
    });
    expect(exact.allowed).toBe(true);
  });

  it("hold futuro vence a cadência (bloqueio mais restritivo primeiro)", () => {
    const v = evaluateHoldGate({
      metadata: { recovery_tag: TAG, outbox_hold_until: "2026-08-12T15:10:00.000Z" },
      nowMs: NOW,
      lastRecoverySentAtMs: Date.parse("2026-08-12T14:00:00.000Z"),
    });
    expect(v.allowed).toBe(false);
    expect(v.reason).toBe(OUTBOX_HOLD_REASON);
  });

  it("itens sem recovery_tag não sofrem espaçamento (outros tenants/itens intocados)", () => {
    const v = evaluateHoldGate({
      metadata: { source: "campaign" },
      nowMs: NOW,
      lastRecoverySentAtMs: NOW - 1000,
    });
    expect(v.allowed).toBe(true);
    expect(recoveryTagOf({ source: "campaign" })).toBeNull();
  });

  it("tag inválida não ativa espaçamento", () => {
    const v = evaluateHoldGate({
      metadata: { recovery_tag: "ab" },
      nowMs: NOW,
      lastRecoverySentAtMs: NOW - 1000,
    });
    expect(v.allowed).toBe(true);
  });

  it("sem envio anterior da recovery não há espaçamento", () => {
    const v = evaluateHoldGate({ metadata: { recovery_tag: TAG }, nowMs: NOW, lastRecoverySentAtMs: null });
    expect(v.allowed).toBe(true);
  });

  it("OUT não entregue não conta como resposta", () => {
    expect(isDeliveredOutStatus("queued")).toBe(false);
    expect(isDeliveredOutStatus("cancelada")).toBe(false);
    expect(isDeliveredOutStatus("falhou")).toBe(false);
    expect(isDeliveredOutStatus("enviada")).toBe(true);
    expect(isDeliveredOutStatus("simulated")).toBe(true);
  });
});
