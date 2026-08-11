// Testes puros do warm-up determinístico da fila global de WhatsApp.
// Sem banco, sem fila real, sem Z-API, sem fetch.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  effectiveDailyLimit,
  nextAttemptForRetain,
  RETAIN_REASON_DAILY,
  RETAIN_REASON_RATE,
  simulateWarmupBatch,
  warmupDay,
  WARMUP_RAMP,
} from "./warmup-schedule.ts";

const START = "2026-08-11";
const day = (n: number) => new Date(`2026-08-${String(10 + n).padStart(2, "0")}T15:00:00-03:00`);

const ALL_SOURCES = [
  "ai_reply",
  "manual",
  "meeting_confirmation",
  "flow_initial",
  "flow_followup",
  "flow_stage",
  "campaign",
];

Deno.test("W1 rampa determinística D1..D6", () => {
  const cfg = { warmup_enabled: true, warmup_start_date: START, daily_limit: 10 };
  assertEquals(warmupDay(START, day(1)), 1);
  assertEquals(effectiveDailyLimit(cfg, day(1)).limit, 10);
  assertEquals(effectiveDailyLimit(cfg, day(2)).limit, 15);
  assertEquals(effectiveDailyLimit(cfg, day(3)).limit, 25);
  assertEquals(effectiveDailyLimit(cfg, day(4)).limit, 40);
  assertEquals(effectiveDailyLimit(cfg, day(5)).limit, 60);
  assertEquals(effectiveDailyLimit(cfg, day(6)).limit, 60);
  assertEquals(WARMUP_RAMP[4], 60);
});

Deno.test("W2 daily_limit=10 não congela a rampa", () => {
  const cfg = { warmup_enabled: true, warmup_start_date: START, daily_limit: 10 };
  const d3 = effectiveDailyLimit(cfg, day(3));
  assertEquals(d3.limit, 25);
  assertEquals(d3.source, "warmup_ramp");
});

Deno.test("W3 daily_limit >= topo da rampa age como teto", () => {
  const cfg = { warmup_enabled: true, warmup_start_date: START, daily_limit: 60 };
  assertEquals(effectiveDailyLimit(cfg, day(5)).limit, 60);
  const cap = effectiveDailyLimit({ warmup_enabled: true, warmup_start_date: START, daily_limit: 70 }, day(9));
  assertEquals(cap.limit, 60);
});

Deno.test("W4 warm-up desligado usa daily_limit puro", () => {
  const r = effectiveDailyLimit({ warmup_enabled: false, warmup_start_date: START, daily_limit: 500 }, day(3));
  assertEquals(r.limit, 500);
  assertEquals(r.source, "daily_limit");
});

Deno.test("W5 D1 com 15 mensagens: 10 saem, 5 retidas por WARMUP_DAILY_LIMIT", () => {
  const items = Array.from({ length: 15 }, (_, i) => ({
    id: `msg-${i + 1}`,
    source_type: ALL_SOURCES[i % ALL_SOURCES.length],
    payload_type: i % 4 === 0 ? "video" : "text",
  }));
  const r = simulateWarmupBatch({
    items,
    config: { warmup_enabled: true, warmup_start_date: START, daily_limit: 10 },
    sent_today: 0,
    max_per_minute: null,
    now: day(1),
  });
  assertEquals(r.effective.limit, 10);
  assertEquals(r.sent.length, 10);
  assertEquals(r.retained.length, 5);
  assertEquals(r.retained.map((x) => x.id), ["msg-11", "msg-12", "msg-13", "msg-14", "msg-15"]);
  assertEquals(new Set(r.retained.map((x) => x.reason)), new Set([RETAIN_REASON_DAILY]));
});

Deno.test("W6 nenhuma origem fura a cota (todas as source_type retidas no limite)", () => {
  for (const source of ALL_SOURCES) {
    const items = Array.from({ length: 3 }, (_, i) => ({ id: `${source}-${i}`, source_type: source }));
    const r = simulateWarmupBatch({
      items,
      config: { warmup_enabled: true, warmup_start_date: START, daily_limit: 10 },
      sent_today: 10, // cota do dia já esgotada
      now: day(1),
    });
    assertEquals(r.sent.length, 0, `source ${source} furou a cota diária`);
    assertEquals(r.retained.length, 3);
    assertEquals(r.retained[0].reason, RETAIN_REASON_DAILY);
  }
});

Deno.test("W7 ritmo por minuto retém com WARMUP_RATE_LIMIT", () => {
  const items = ALL_SOURCES.map((s, i) => ({ id: `r-${i}`, source_type: s }));
  const r = simulateWarmupBatch({
    items,
    config: { warmup_enabled: true, warmup_start_date: START, daily_limit: 10 },
    sent_today: 0,
    sent_last_minute: 0,
    max_per_minute: 2,
    now: day(1),
  });
  assertEquals(r.sent.length, 2);
  assertEquals(r.retained.length, items.length - 2);
  assertEquals(new Set(r.retained.map((x) => x.reason)), new Set([RETAIN_REASON_RATE]));
});

Deno.test("W8 next_attempt_at: minuto para rate, próximo dia para cota", () => {
  const now = new Date("2026-08-11T15:00:00-03:00");
  assertEquals(nextAttemptForRetain(RETAIN_REASON_RATE, now), new Date(now.getTime() + 60_000).toISOString());
  assertEquals(nextAttemptForRetain(RETAIN_REASON_DAILY, now), "2026-08-12T03:00:00.000Z");
});
