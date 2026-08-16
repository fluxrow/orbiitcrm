import { describe, it, expect } from "vitest";
import {
  DEBOUNCE_RECOVERY_GRACE_MS,
  computeFireAfter,
  decideDebounce,
  evaluateReplySla,
  isRecoverable,
  readDebounceConfig,
} from "../../supabase/functions/_shared/ai-reply-debounce";

/** Carência por tenant lida da config (mesma regra aplicada no tick). */
function graceOf(cfgRow: any): number {
  const raw = cfgRow?.ai_reply_debounce?.recovery_grace_ms;
  return Number.isFinite(Number(raw))
    ? Math.min(120_000, Math.max(0, Math.round(Number(raw))))
    : DEBOUNCE_RECOVERY_GRACE_MS;
}

/** Consolidação de inbound: coluna correta é `mensagem` (nunca `conteudo`). */
function consolidate(rows: Array<Record<string, unknown>>): string[] {
  return rows
    .map((m: any) => String(m.mensagem ?? m.media_extracted_text ?? "").trim())
    .filter(Boolean);
}

describe("debounce recovery — incidente 2026-08-16", () => {
  it("consolida inbound pela coluna mensagem", () => {
    const texts = consolidate([
      { mensagem: "quanto custa?" },
      { mensagem: "  " },
      { mensagem: null, media_extracted_text: "audio transcrito" },
    ]);
    expect(texts).toEqual(["quanto custa?", "audio transcrito"]);
  });

  it("não confunde ausência de coluna com nothing_to_answer", () => {
    // Antes do fix o select trazia `conteudo` (inexistente) → lote vazio.
    const legacy = [{ mensagem: "oi" }].map((m: any) => String(m.conteudo ?? "").trim()).filter(Boolean);
    expect(legacy).toEqual([]);
    expect(consolidate([{ mensagem: "oi" }])).toEqual(["oi"]);
  });

  it("carência default preservada e override por tenant respeitado", () => {
    expect(graceOf({ ai_reply_debounce: { enabled: true } })).toBe(DEBOUNCE_RECOVERY_GRACE_MS);
    expect(graceOf({ ai_reply_debounce: { enabled: true, recovery_grace_ms: 0 } })).toBe(0);
    expect(graceOf({ ai_reply_debounce: { enabled: true, recovery_grace_ms: -5 } })).toBe(0);
    expect(graceOf(null)).toBe(DEBOUNCE_RECOVERY_GRACE_MS);
  });

  it("com carência 0 o job é recuperável assim que a janela vence", () => {
    const fire = computeFireAfter("2026-08-16T22:00:00.000Z", 20_000);
    const at = new Date("2026-08-16T22:00:21.000Z");
    expect(isRecoverable({ status: "pending", fire_after: fire }, at, 0)).toBe(true);
    expect(isRecoverable({ status: "pending", fire_after: fire }, at, DEBOUNCE_RECOVERY_GRACE_MS)).toBe(false);
  });

  it("token stale nunca gera segunda resposta", () => {
    const row = { claim_token: "novo", fire_after: "2026-08-16T22:00:20Z", status: "pending" as const };
    expect(decideDebounce(row, "antigo")).toEqual({ action: "abort", reason: "stale_job" });
    expect(decideDebounce(row, "novo", new Date("2026-08-16T22:00:25Z")).action).toBe("fire");
  });

  it("SLA de 60s cumprido no caminho simulado IN → envio", () => {
    const v = evaluateReplySla(
      {
        received_at: "2026-08-16T22:00:00.000Z",
        ai_generated_at: "2026-08-16T22:00:31.000Z",
        queued_at: "2026-08-16T22:00:31.500Z",
        sent_at: "2026-08-16T22:00:44.000Z",
      },
      60_000,
      20_000,
    );
    expect(v.totalMs).toBe(44_000);
    expect(v.withinSla).toBe(true);
    expect(readDebounceConfig({ ai_reply_debounce: { enabled: true, wait_ms: 20_000, sla_ms: 60_000 } })).toEqual({
      enabled: true,
      waitMs: 20_000,
      slaMs: 60_000,
    });
  });
});
