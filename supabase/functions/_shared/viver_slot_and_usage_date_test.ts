import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  dailyUsageDate,
  dailyUsageDateFor,
  legacyDailyUsageDate,
  needsViverCampaignSpacingCheck,
  RETAIN_REASON_VIVER_SLOT_LOCK,
  VIVER_SEMIJOIAS_EMPRESA_ID,
  viverCampaignSlotDecision,
} from "./viver-daily-quota-policy.ts";

const OTHER = "4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18";

Deno.test("leitura de espaçamento só é necessária para Viver + campaign", () => {
  assertEquals(
    needsViverCampaignSpacingCheck(VIVER_SEMIJOIAS_EMPRESA_ID, "campaign"),
    true,
  );
  for (const src of ["ai_reply", "flow_initial", "flow_followup", "meeting_confirmation"]) {
    assertEquals(needsViverCampaignSpacingCheck(VIVER_SEMIJOIAS_EMPRESA_ID, src), false);
  }
  assertEquals(needsViverCampaignSpacingCheck(OTHER, "campaign"), false);
});

Deno.test("trava de vaga: apenas o menor id prossegue entre claims concorrentes", () => {
  const inflight = [{ id: "aaa" }, { id: "bbb" }];
  const winner = viverCampaignSlotDecision({
    empresaId: VIVER_SEMIJOIAS_EMPRESA_ID,
    sourceType: "campaign",
    itemId: "aaa",
    inflight,
  });
  assertEquals(winner.proceed, true);

  const loser = viverCampaignSlotDecision({
    empresaId: VIVER_SEMIJOIAS_EMPRESA_ID,
    sourceType: "campaign",
    itemId: "bbb",
    inflight,
  });
  assertEquals(loser.proceed, false);
  assertEquals(loser.reason, RETAIN_REASON_VIVER_SLOT_LOCK);
  assertEquals(loser.blocked_by, "aaa");
});

Deno.test("trava de vaga não afeta outras origens nem outros tenants", () => {
  assertEquals(
    viverCampaignSlotDecision({
      empresaId: VIVER_SEMIJOIAS_EMPRESA_ID,
      sourceType: "ai_reply",
      itemId: "zzz",
      inflight: [{ id: "aaa" }],
    }).proceed,
    true,
  );
  assertEquals(
    viverCampaignSlotDecision({
      empresaId: OTHER,
      sourceType: "campaign",
      itemId: "zzz",
      inflight: [{ id: "aaa" }],
    }).proceed,
    true,
  );
});

Deno.test("data do contador: Viver em São Paulo, outros tenants em UTC legado", () => {
  const t = new Date("2026-09-21T02:30:00Z");
  assertEquals(dailyUsageDateFor(VIVER_SEMIJOIAS_EMPRESA_ID, t), dailyUsageDate(t));
  assertEquals(dailyUsageDateFor(VIVER_SEMIJOIAS_EMPRESA_ID, t), "2026-09-20");
  assertEquals(dailyUsageDateFor(OTHER, t), legacyDailyUsageDate(t));
  assertEquals(dailyUsageDateFor(OTHER, t), "2026-09-21");
});
