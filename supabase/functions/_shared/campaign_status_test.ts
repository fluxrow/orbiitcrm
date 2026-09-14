import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  CAMPAIGN_STATUSES,
  campaignStatusForAbort,
  isValidCampaignStatus,
  updateCampaignStatus,
} from "./campaign-status.ts";

const CAMPAIGN = "0b8e3a9a-97ee-4876-8ae8-a52407e84120";

/** Stub que imita a CHECK constraint real do banco. */
function dbStub() {
  const calls: Array<{ table: string; values: Record<string, unknown>; id: unknown }> = [];
  const client = {
    from(table: string) {
      return {
        update(values: Record<string, unknown>) {
          return {
            eq(_col: string, id: unknown) {
              calls.push({ table, values, id });
              const status = String(values.status ?? "");
              if (!(CAMPAIGN_STATUSES as readonly string[]).includes(status)) {
                return Promise.resolve({
                  error: { message: `violates check constraint "orbit_campaigns_status_check"` },
                });
              }
              return Promise.resolve({ error: null });
            },
          };
        },
      };
    },
  };
  return { client, calls };
}

Deno.test("regressão do incidente: 'falha' não é status válido", () => {
  assertEquals(isValidCampaignStatus("falha"), false);
  assertEquals(isValidCampaignStatus("enviando"), true);
  assertEquals(isValidCampaignStatus("pausada"), true);
  assertEquals(isValidCampaignStatus("agendada"), true);
});

Deno.test("status inválido nunca chega ao banco e é reportado", async () => {
  const { client, calls } = dbStub();
  const r = await updateCampaignStatus(client, { campaign_id: CAMPAIGN, status: "falha" });
  assertEquals(r, { applied: false, status: "falha", error: "invalid_campaign_status" });
  assertEquals(calls.length, 0);
});

Deno.test("Z-API desconectada => agendada (retomável) com motivo", async () => {
  assertEquals(campaignStatusForAbort("ZAPI_DISCONNECTED"), "agendada");
  const { client, calls } = dbStub();
  const r = await updateCampaignStatus(client, {
    campaign_id: CAMPAIGN,
    status: campaignStatusForAbort("ZAPI_DISCONNECTED"),
    motivo_reprovacao: "ZAPI_DISCONNECTED",
  });
  assertEquals(r.applied, true);
  assertEquals(calls.length, 1);
  assertEquals(calls[0].table, "orbit_campaigns");
  assertEquals(calls[0].values, { status: "agendada", motivo_reprovacao: "ZAPI_DISCONNECTED" });
  assertEquals(calls[0].id, CAMPAIGN);
  // Nunca fica preso em `enviando`.
  assertEquals(calls[0].values.status === "enviando", false);
});

Deno.test("bloqueios de política são fail-closed (pausada, sem auto-resume)", async () => {
  for (const reason of ["ZAPI_REAL_SEND_BLOCKED", "WHATSAPP_RHYTHM_DISABLED", "CAMPAIGN_ALL_FAILED"] as const) {
    assertEquals(campaignStatusForAbort(reason), "pausada");
    const { client, calls } = dbStub();
    const r = await updateCampaignStatus(client, {
      campaign_id: CAMPAIGN,
      status: campaignStatusForAbort(reason),
      motivo_reprovacao: reason,
    });
    assertEquals(r.applied, true, reason);
    assertEquals(calls[0].values.motivo_reprovacao, reason);
  }
});

Deno.test("erro do banco é devolvido (não passa em silêncio)", async () => {
  const client = {
    from: () => ({
      update: () => ({ eq: () => Promise.resolve({ error: { message: "permission denied" } }) }),
    }),
  };
  const r = await updateCampaignStatus(client as any, { campaign_id: CAMPAIGN, status: "pausada" });
  assertEquals(r.applied, false);
  assertEquals(r.error, "permission denied");
});

Deno.test("update é idempotente por campanha (mesmo alvo, sem efeito colateral)", async () => {
  const { client, calls } = dbStub();
  for (let i = 0; i < 3; i++) {
    await updateCampaignStatus(client, {
      campaign_id: CAMPAIGN,
      status: "agendada",
      motivo_reprovacao: "ZAPI_DISCONNECTED",
    });
  }
  assertEquals(calls.length, 3);
  assertEquals(new Set(calls.map((c) => JSON.stringify(c.values))).size, 1);
});
