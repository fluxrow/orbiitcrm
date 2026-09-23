import {
  assert,
  assertEquals,
  assertFalse,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  consumesDailyQuotaFor,
  dailyQuotaSourcesFor,
  dailyUsageDate,
  effectiveDailyLimitFor,
  isControlledDailyCapAccepted,
  isViverTenant,
  RETAIN_REASON_VIVER_CAMPAIGN_SPACING,
  VIVER_CAMPAIGN_MIN_GAP_MS,
  VIVER_DAILY_FIRST_CONTACT_LIMIT,
  VIVER_SEMIJOIAS_EMPRESA_ID,
  viverCampaignSpacingWaitMs,
} from "./viver-daily-quota-policy.ts";
import {
  consumesProspectingQuota,
  effectiveDailyLimit,
  RETAIN_REASON_RATE,
  simulateWarmupBatch,
} from "./outbox-quota.ts";

const VIVER = VIVER_SEMIJOIAS_EMPRESA_ID;
const OUTRO = "fa0ac793-5c5a-43c6-b4c2-eacc276d0d67";

const viverCfg = {
  warmup_enabled: true,
  warmup_start_date: "2026-09-01",
  daily_limit: VIVER_DAILY_FIRST_CONTACT_LIMIT,
};

function items(n: number, source_type: string, offset = 0) {
  return Array.from({ length: n }, (_, i) => ({
    id: `${source_type}-${offset + i}`,
    source_type,
  }));
}

/** Espelha a decisão diária do worker sob a política do tenant. */
function simulateTenant(params: {
  empresaId: string;
  items: { id: string; source_type: string }[];
  sentToday?: number;
  maxPerMinute?: number | null;
  sentLastMinute?: number;
  now?: Date;
}) {
  const effective = effectiveDailyLimitFor(
    params.empresaId,
    viverCfg,
    params.now ?? new Date("2026-09-20T13:00:00Z"),
  );
  let used = params.sentToday ?? 0;
  let minute = params.sentLastMinute ?? 0;
  const out: { id: string; decision: "send" | "retain"; reason?: string }[] = [];
  for (const item of params.items) {
    const daily = consumesDailyQuotaFor(params.empresaId, item.source_type);
    const rate = consumesProspectingQuota(item.source_type);
    if (daily && effective.limit != null && used >= effective.limit) {
      out.push({ id: item.id, decision: "retain", reason: "WARMUP_DAILY_LIMIT" });
      continue;
    }
    if (
      rate && params.maxPerMinute != null && params.maxPerMinute > 0 &&
      minute >= params.maxPerMinute
    ) {
      out.push({ id: item.id, decision: "retain", reason: RETAIN_REASON_RATE });
      continue;
    }
    if (daily) used++;
    if (rate) minute++;
    out.push({ id: item.id, decision: "send" });
  }
  return { decisions: out, effective, used };
}

Deno.test("Viver conta somente campaign na cota diária", () => {
  assertEquals(dailyQuotaSourcesFor(VIVER), ["campaign"]);
  assert(consumesDailyQuotaFor(VIVER, "campaign"));
  for (
    const s of ["flow_initial", "flow_followup", "ai_reply", "meeting_confirmation", "manual"]
  ) {
    assertFalse(consumesDailyQuotaFor(VIVER, s), s);
  }
});

Deno.test("outros tenants mantêm a política agregada existente", () => {
  assertEquals(dailyQuotaSourcesFor(OUTRO), [
    "campaign",
    "flow_initial",
    "flow_followup",
  ]);
  for (const s of ["campaign", "flow_initial", "flow_followup"]) {
    assert(consumesDailyQuotaFor(OUTRO, s), s);
  }
  // Rampa de warm-up dos demais tenants intacta.
  const base = effectiveDailyLimit(
    { warmup_enabled: true, warmup_start_date: "2026-09-01", daily_limit: 10 },
    new Date("2026-09-20T13:00:00Z"),
  );
  assertEquals(effectiveDailyLimitFor(OUTRO, {
    warmup_enabled: true,
    warmup_start_date: "2026-09-01",
    daily_limit: 10,
  }, new Date("2026-09-20T13:00:00Z")).limit, base.limit);
  assertEquals(base.limit, 60);
  // Simulação padrão continua idêntica (nenhuma regressão global).
  const sim = simulateWarmupBatch({
    items: items(3, "flow_initial"),
    config: { warmup_enabled: false, daily_limit: 2 },
  });
  assertEquals(sim.sent.length, 2);
  assertEquals(sim.retained.length, 1);
});

Deno.test("Viver: teto diário é 20 mesmo com rampa de warm-up acima", () => {
  const eff = effectiveDailyLimitFor(
    VIVER,
    { warmup_enabled: true, warmup_start_date: "2026-09-01", daily_limit: 10 },
    new Date("2026-09-20T13:00:00Z"),
  );
  assertEquals(eff.limit, 20);
  assertEquals(
    effectiveDailyLimitFor(VIVER, { daily_limit: null }).limit,
    20,
  );
  assertEquals(effectiveDailyLimitFor(VIVER, { daily_limit: 5 }).limit, 5);
});

Deno.test("20 campanhas passam e a 21ª é retida", () => {
  const r = simulateTenant({ empresaId: VIVER, items: items(21, "campaign") });
  assertEquals(r.decisions.filter((d) => d.decision === "send").length, 20);
  const retained = r.decisions.filter((d) => d.decision === "retain");
  assertEquals(retained.length, 1);
  assertEquals(retained[0].reason, "WARMUP_DAILY_LIMIT");
});

Deno.test("20 campanhas + follow-ups não bloqueiam os follow-ups", () => {
  const r = simulateTenant({
    empresaId: VIVER,
    items: [...items(20, "campaign"), ...items(6, "flow_followup")],
    maxPerMinute: null,
  });
  const sent = r.decisions.filter((d) => d.decision === "send");
  assertEquals(sent.length, 26);
  assertEquals(r.used, 20);
});

Deno.test("flow_initial e ai_reply não consomem as 20 vagas", () => {
  const r = simulateTenant({
    empresaId: VIVER,
    items: [...items(20, "flow_initial"), ...items(20, "ai_reply")],
  });
  assertEquals(r.decisions.filter((d) => d.decision === "retain").length, 0);
  assertEquals(r.used, 0);
});

Deno.test("lembretes de reunião não consomem as 20 vagas", () => {
  const r = simulateTenant({
    empresaId: VIVER,
    items: items(5, "meeting_confirmation"),
    sentToday: 20,
  });
  assertEquals(r.decisions.filter((d) => d.decision === "send").length, 5);
});

Deno.test("limitação por minuto continua valendo para prospecção Viver", () => {
  const r = simulateTenant({
    empresaId: VIVER,
    items: [...items(2, "campaign"), ...items(2, "flow_followup")],
    maxPerMinute: 1,
  });
  const retained = r.decisions.filter((d) => d.decision === "retain");
  assertEquals(retained.length, 3);
  for (const d of retained) assertEquals(d.reason, RETAIN_REASON_RATE);
});

Deno.test("espaçamento de 30 min entre campanhas medido no envio real", () => {
  const now = Date.parse("2026-09-20T15:00:00Z");
  assertEquals(
    viverCampaignSpacingWaitMs({
      empresaId: VIVER,
      sourceType: "campaign",
      lastCampaignSentAtMs: null,
      nowMs: now,
    }),
    0,
  );
  assertEquals(
    viverCampaignSpacingWaitMs({
      empresaId: VIVER,
      sourceType: "campaign",
      lastCampaignSentAtMs: now - 10 * 60_000,
      nowMs: now,
    }),
    20 * 60_000,
  );
  assertEquals(
    viverCampaignSpacingWaitMs({
      empresaId: VIVER,
      sourceType: "campaign",
      lastCampaignSentAtMs: now - VIVER_CAMPAIGN_MIN_GAP_MS,
      nowMs: now,
    }),
    0,
  );
  // Backlog vencido (envio antigo) não dispara em rajada: cada item recalcula
  // a espera contra o ÚLTIMO envio real, sem crédito acumulado.
  let last = now - 90 * 60_000;
  let t = now;
  const gaps: number[] = [];
  for (let i = 0; i < 3; i++) {
    const wait = viverCampaignSpacingWaitMs({
      empresaId: VIVER,
      sourceType: "campaign",
      lastCampaignSentAtMs: last,
      nowMs: t,
    });
    t += wait;
    gaps.push(t - last);
    last = t;
  }
  assertEquals(gaps[0] >= VIVER_CAMPAIGN_MIN_GAP_MS, true);
  assertEquals(gaps[1], VIVER_CAMPAIGN_MIN_GAP_MS);
  assertEquals(gaps[2], VIVER_CAMPAIGN_MIN_GAP_MS);
  assertEquals(RETAIN_REASON_VIVER_CAMPAIGN_SPACING, "VIVER_CAMPAIGN_MIN_GAP");
});

Deno.test("espaçamento não afeta outras fontes nem outros tenants", () => {
  const now = Date.parse("2026-09-20T15:00:00Z");
  assertEquals(
    viverCampaignSpacingWaitMs({
      empresaId: VIVER,
      sourceType: "ai_reply",
      lastCampaignSentAtMs: now - 60_000,
      nowMs: now,
    }),
    0,
  );
  assertEquals(
    viverCampaignSpacingWaitMs({
      empresaId: OUTRO,
      sourceType: "campaign",
      lastCampaignSentAtMs: now - 60_000,
      nowMs: now,
    }),
    0,
  );
});

Deno.test("contador diário usa a data America/Sao_Paulo (virada 00:00 SP)", () => {
  assertEquals(dailyUsageDate(new Date("2026-09-21T02:59:00Z")), "2026-09-20");
  assertEquals(dailyUsageDate(new Date("2026-09-21T03:00:00Z")), "2026-09-21");
  // Cota reabre só na virada SP: às 23:00 SP ainda é o mesmo dia.
  assertEquals(dailyUsageDate(new Date("2026-09-21T02:00:00Z")), "2026-09-20");
});

Deno.test("controlled pilot aceita daily_cap 20 só na Viver", () => {
  assert(isControlledDailyCapAccepted(VIVER, 20));
  assertFalse(isControlledDailyCapAccepted(VIVER, 21));
  assertFalse(isControlledDailyCapAccepted(VIVER, 0));
  assert(isControlledDailyCapAccepted(OUTRO, 10));
  assertFalse(isControlledDailyCapAccepted(OUTRO, 11));
  assert(isViverTenant(VIVER));
  assertFalse(isViverTenant(OUTRO));
});
