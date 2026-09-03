import { describe, it, expect } from "vitest";
import {
  DEFAULT_AGENT_AGGREGATION_WAIT_MS,
  readAgentAggregationWaitMs,
} from "../../supabase/functions/_shared/ai-reply-debounce";

describe("espera de agregação do agente (tenant-scoped)", () => {
  it("preserva 10s legados quando não há configuração", () => {
    expect(DEFAULT_AGENT_AGGREGATION_WAIT_MS).toBe(10_000);
    expect(readAgentAggregationWaitMs(null)).toBe(10_000);
    expect(readAgentAggregationWaitMs(undefined)).toBe(10_000);
    expect(readAgentAggregationWaitMs({})).toBe(10_000);
    expect(readAgentAggregationWaitMs({ ai_reply_debounce: {} })).toBe(10_000);
    expect(readAgentAggregationWaitMs({ ai_reply_debounce: { enabled: true } })).toBe(10_000);
  });

  it("aplica override curto de 1.000 ms", () => {
    expect(readAgentAggregationWaitMs({ ai_reply_debounce: { agent_aggregation_wait_ms: 1_000 } })).toBe(1_000);
    expect(readAgentAggregationWaitMs({ ai_reply_debounce: { agent_aggregation_wait_ms: "1000" } })).toBe(1_000);
    expect(readAgentAggregationWaitMs({ ai_reply_debounce: { agent_aggregation_wait_ms: 0 } })).toBe(0);
  });

  it("limita a faixa e arredonda", () => {
    expect(readAgentAggregationWaitMs({ ai_reply_debounce: { agent_aggregation_wait_ms: -5_000 } })).toBe(0);
    expect(readAgentAggregationWaitMs({ ai_reply_debounce: { agent_aggregation_wait_ms: 99_000 } })).toBe(30_000);
    expect(readAgentAggregationWaitMs({ ai_reply_debounce: { agent_aggregation_wait_ms: 1_499.6 } })).toBe(1_500);
  });

  it("fail-safe para valores inválidos", () => {
    for (const raw of ["abc", "", null, undefined, NaN, {}, []]) {
      expect(readAgentAggregationWaitMs({ ai_reply_debounce: { agent_aggregation_wait_ms: raw } })).toBe(10_000);
    }
  });

  it("não altera a leitura do debounce existente", () => {
    expect(readAgentAggregationWaitMs({ ai_reply_debounce: { enabled: true, wait_ms: 20_000 } })).toBe(10_000);
  });
});
