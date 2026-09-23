import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  hasViverOperationalDateContract,
  VIVER_OPERATIONAL_DATE_EMPRESA_ID,
  VIVER_OPERATIONAL_DATE_EXPIRED_REASON,
  VIVER_OPERATIONAL_DATE_FUTURE_REASON,
  VIVER_OPERATIONAL_DATE_INVALID_REASON,
  viverOperationalDateDecision,
  viverOperationalDayStartIso,
} from "./viver-campaign-operational-date.ts";

const VIVER = VIVER_OPERATIONAL_DATE_EMPRESA_ID;
const OTHER = "4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18";
const BATCH = "viver_fernanda_audio_ramp_5_8_10_2026-09-09";

function campaign(operational_date: unknown, batch = BATCH) {
  return {
    id: "camp-1",
    empresa_id: VIVER,
    filtros_json: { batch_label: batch, operational_date },
  };
}

function decide(over: Record<string, any> = {}) {
  return viverOperationalDateDecision({
    empresa_id: VIVER,
    source_type: "campaign",
    campaign: campaign("2026-09-14"),
    now: new Date("2026-09-14T15:00:00Z"),
    ...over,
  });
}

Deno.test("contrato só existe para Viver, campaign, batch autorizado e data presente", () => {
  assertEquals(
    hasViverOperationalDateContract({
      empresa_id: VIVER,
      source_type: "campaign",
      campaign: campaign("2026-09-14"),
    }),
    true,
  );
  assertEquals(
    hasViverOperationalDateContract({
      empresa_id: OTHER,
      source_type: "campaign",
      campaign: campaign("2026-09-14"),
    }),
    false,
  );
  assertEquals(
    hasViverOperationalDateContract({
      empresa_id: VIVER,
      source_type: "flow_followup",
      campaign: campaign("2026-09-14"),
    }),
    false,
  );
  assertEquals(
    hasViverOperationalDateContract({
      empresa_id: VIVER,
      source_type: "campaign",
      campaign: campaign("2026-09-14", "outro_batch"),
    }),
    false,
  );
  assertEquals(
    hasViverOperationalDateContract({
      empresa_id: VIVER,
      source_type: "campaign",
      campaign: { id: "c", empresa_id: VIVER, filtros_json: { batch_label: BATCH } },
    }),
    false,
  );
});

Deno.test("dia atual segue os gates normais (10 min + 50/dia)", () => {
  const d = decide();
  assertEquals(d.verdict, "proceed");
  assertEquals(d.reason, "operational_date_today");
  assertEquals(d.today_sp, "2026-09-14");
});

Deno.test("atraso no mesmo dia SP continua liberado (só espaçamento decide)", () => {
  // 2026-09-15T02:00Z = 14/09 23:00 SP → ainda é o dia operacional.
  const d = decide({ now: new Date("2026-09-15T02:00:00Z") });
  assertEquals(d.verdict, "proceed");
  assertEquals(d.today_sp, "2026-09-14");
});

Deno.test("virada do dia SP: item de ontem expira e não ocupa vaga de hoje", () => {
  // 2026-09-15T03:30Z = 15/09 00:30 SP → dia seguinte.
  const d = decide({ now: new Date("2026-09-15T03:30:00Z") });
  assertEquals(d.verdict, "expire");
  assertEquals(d.reason, VIVER_OPERATIONAL_DATE_EXPIRED_REASON);
  assertEquals(d.operational_date, "2026-09-14");
  assertEquals(d.today_sp, "2026-09-15");
});

Deno.test("amanhã não antecipa: espera até 00:00 SP do dia operacional", () => {
  const d = decide({
    campaign: campaign("2026-09-16"),
    now: new Date("2026-09-15T15:00:00Z"),
  });
  assertEquals(d.verdict, "wait");
  assertEquals(d.reason, VIVER_OPERATIONAL_DATE_FUTURE_REASON);
  assertEquals(d.retry_at, viverOperationalDayStartIso("2026-09-16"));
  assertEquals(d.retry_at, "2026-09-16T03:00:00.000Z");
});

Deno.test("item já aceito pelo provedor nunca cancela nem reenvia", () => {
  const byProvider = decide({
    now: new Date("2026-09-20T15:00:00Z"),
    provider_message_id: "ZAPI-1",
  });
  assertEquals(byProvider.verdict, "proceed");
  assertEquals(byProvider.reason, "provider_already_accepted");

  for (const status of ["sent", "delivered", "read"]) {
    const d = decide({ now: new Date("2026-09-20T15:00:00Z"), status });
    assertEquals(d.verdict, "proceed");
    assertEquals(d.reason, "provider_already_accepted");
  }
});

Deno.test("operational_date inválida é fail-closed (adia, nunca envia)", () => {
  for (const bad of ["", "14/09/2026", "2026-13-45", 20260914, {}]) {
    const d = decide({ campaign: campaign(bad) });
    assertEquals(d.verdict, "fail_closed");
    assertEquals(d.reason, VIVER_OPERATIONAL_DATE_INVALID_REASON);
  }
});

Deno.test("campanhas/tenants sem o contrato ficam inalterados", () => {
  assertEquals(
    decide({ empresa_id: OTHER, now: new Date("2026-09-30T15:00:00Z") }).verdict,
    "not_applicable",
  );
  assertEquals(
    decide({ source_type: "flow_followup", now: new Date("2026-09-30T15:00:00Z") })
      .verdict,
    "not_applicable",
  );
  assertEquals(
    decide({ campaign: null, now: new Date("2026-09-30T15:00:00Z") }).verdict,
    "not_applicable",
  );
  assertEquals(
    decide({
      campaign: campaign("2026-09-01", "outro_batch"),
      now: new Date("2026-09-30T15:00:00Z"),
    }).verdict,
    "not_applicable",
  );
});
