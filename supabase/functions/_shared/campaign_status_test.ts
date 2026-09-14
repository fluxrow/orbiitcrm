import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  CAMPAIGN_STATUSES,
  campaignStatusForAbort,
  isValidCampaignStatus,
  updateCampaignStatus,
} from "./campaign-status.ts";
import { VIVER_EMPRESA_ID } from "./tenant-scheduling-policy.ts";

const CAMPAIGN = "0b8e3a9a-97ee-4876-8ae8-a52407e84120";
const OTHER_TENANT = "fa0ac793-5c5a-43c6-b4c2-eacc276d0d67";

interface Row {
  id: string;
  empresa_id: string;
  status: string;
  motivo_reprovacao?: string | null;
  hold_until?: string | null;
}

/**
 * Stub realista: aplica os filtros encadeados (id, empresa_id, status IN),
 * imita a CHECK constraint real e devolve SOMENTE as linhas efetivamente
 * afetadas — como o PostgREST com `.select()`.
 */
function dbStub(rows: Row[]) {
  const state = rows.map((r) => ({ ...r }));
  const attempts: Array<{ values: Record<string, unknown>; filters: Array<[string, unknown]> }> = [];

  const client = {
    from(_table: string) {
      return {
        update(values: Record<string, unknown>) {
          const filters: Array<[string, unknown]> = [];
          const builder: any = {
            eq(column: string, value: unknown) {
              filters.push([column, value]);
              return builder;
            },
            in(column: string, values2: readonly unknown[]) {
              filters.push([column, [...values2]]);
              return builder;
            },
            select(_columns: string) {
              attempts.push({ values, filters });
              const status = String(values.status ?? "");
              if (!(CAMPAIGN_STATUSES as readonly string[]).includes(status)) {
                return Promise.resolve({
                  data: null,
                  error: { message: 'violates check constraint "orbit_campaigns_status_check"' },
                });
              }
              const affected = state.filter((row) =>
                filters.every(([column, value]) =>
                  Array.isArray(value)
                    ? value.includes((row as any)[column])
                    : (row as any)[column] === value
                )
              );
              for (const row of affected) Object.assign(row, values);
              return Promise.resolve({ data: affected.map((r) => ({ id: r.id })), error: null });
            },
          };
          return builder;
        },
      };
    },
  };
  return { client, state, attempts };
}

const viverSending: Row[] = [
  { id: CAMPAIGN, empresa_id: VIVER_EMPRESA_ID, status: "enviando", motivo_reprovacao: null, hold_until: "2026-09-14T13:00:00Z" },
];

Deno.test("regressão do incidente: 'falha' não é status válido no banco", () => {
  assertEquals(isValidCampaignStatus("falha"), false);
  assertEquals(isValidCampaignStatus("enviando"), true);
  assertEquals(isValidCampaignStatus("agendada"), true);
  assertEquals(isValidCampaignStatus("pausada"), true);
});

Deno.test("mapeamento novo é EXCLUSIVO da Viver; outros tenants ficam no legado", () => {
  // Viver
  assertEquals(campaignStatusForAbort("ZAPI_DISCONNECTED", { empresaId: VIVER_EMPRESA_ID }), "agendada");
  assertEquals(campaignStatusForAbort("ZAPI_REAL_SEND_BLOCKED", { empresaId: VIVER_EMPRESA_ID }), "pausada");
  assertEquals(campaignStatusForAbort("CAMPAIGN_ALL_FAILED", { empresaId: VIVER_EMPRESA_ID }), "pausada");
  assertEquals(campaignStatusForAbort("WHATSAPP_RHYTHM_DISABLED", { empresaId: VIVER_EMPRESA_ID }), "pausada");
  // Outros tenants (semântica histórica preservada)
  for (const tenant of [OTHER_TENANT, undefined, null, ""]) {
    assertEquals(campaignStatusForAbort("ZAPI_DISCONNECTED", { empresaId: tenant }), "falha", String(tenant));
    assertEquals(campaignStatusForAbort("ZAPI_REAL_SEND_BLOCKED", { empresaId: tenant }), "falha", String(tenant));
    assertEquals(campaignStatusForAbort("CAMPAIGN_ALL_FAILED", { empresaId: tenant }), "falha", String(tenant));
    assertEquals(campaignStatusForAbort("WHATSAPP_RHYTHM_DISABLED", { empresaId: tenant }), "pausada", String(tenant));
  }
});

Deno.test("caso normal: Viver 'enviando' + Z-API offline => agendada com motivo", async () => {
  const { client, state, attempts } = dbStub(viverSending);
  const r = await updateCampaignStatus(client, {
    campaign_id: CAMPAIGN,
    empresa_id: VIVER_EMPRESA_ID,
    status: campaignStatusForAbort("ZAPI_DISCONNECTED", { empresaId: VIVER_EMPRESA_ID }),
    motivo_reprovacao: "ZAPI_DISCONNECTED",
    expectedStatus: ["enviando"],
  });
  assertEquals(r, { applied: true, status: "agendada" });
  assertEquals(state[0].status, "agendada");
  assertEquals(state[0].motivo_reprovacao, "ZAPI_DISCONNECTED");
  // Escopo de tenant e CAS presentes na query; hold intocado.
  assertEquals(attempts[0].filters, [
    ["id", CAMPAIGN],
    ["empresa_id", VIVER_EMPRESA_ID],
    ["status", ["enviando"]],
  ]);
  assertEquals(state[0].hold_until, "2026-09-14T13:00:00Z");
});

Deno.test("repetir o update não libera hold nem muda mais nada", async () => {
  const { client, state } = dbStub(viverSending);
  const args = {
    campaign_id: CAMPAIGN,
    empresa_id: VIVER_EMPRESA_ID,
    status: "agendada",
    motivo_reprovacao: "ZAPI_DISCONNECTED",
    expectedStatus: ["enviando"] as const,
  };
  const first = await updateCampaignStatus(client, args);
  const second = await updateCampaignStatus(client, args);
  assertEquals(first.applied, true);
  // CAS impede reaplicação: já não está mais em `enviando`.
  assertEquals(second, { applied: false, status: "agendada", error: "no_rows_matched" });
  assertEquals(state[0].hold_until, "2026-09-14T13:00:00Z");
  assertEquals(state[0].status, "agendada");
});

Deno.test("tenant incorreto => zero update", async () => {
  const { client, state, attempts } = dbStub(viverSending);
  const r = await updateCampaignStatus(client, {
    campaign_id: CAMPAIGN,
    empresa_id: OTHER_TENANT,
    status: "agendada",
    expectedStatus: ["enviando"],
  });
  assertEquals(r, { applied: false, status: "agendada", error: "no_rows_matched" });
  assertEquals(state[0].status, "enviando");
  assertEquals(attempts[0].filters[1], ["empresa_id", OTHER_TENANT]);
});

Deno.test("pausa/cancelamento concorrente NÃO volta para agendada", async () => {
  for (const concurrent of ["cancelada", "pausada", "pausada_por_limite", "concluida"]) {
    const { client, state } = dbStub([
      { id: CAMPAIGN, empresa_id: VIVER_EMPRESA_ID, status: concurrent },
    ]);
    const r = await updateCampaignStatus(client, {
      campaign_id: CAMPAIGN,
      empresa_id: VIVER_EMPRESA_ID,
      status: "agendada",
      motivo_reprovacao: "ZAPI_DISCONNECTED",
      expectedStatus: ["enviando"],
    });
    assertEquals(r.applied, false, concurrent);
    assertEquals(r.error, "no_rows_matched", concurrent);
    assertEquals(state[0].status, concurrent);
  }
});

Deno.test("zero rows sempre resulta em applied=false", async () => {
  const { client } = dbStub([]);
  const r = await updateCampaignStatus(client, {
    campaign_id: CAMPAIGN,
    empresa_id: VIVER_EMPRESA_ID,
    status: "pausada",
  });
  assertEquals(r, { applied: false, status: "pausada", error: "no_rows_matched" });
});

Deno.test("status inválido nunca chega ao banco; empresa_id é obrigatório", async () => {
  const { client, attempts } = dbStub(viverSending);
  assertEquals(
    await updateCampaignStatus(client, { campaign_id: CAMPAIGN, empresa_id: VIVER_EMPRESA_ID, status: "falha" }),
    { applied: false, status: "falha", error: "invalid_campaign_status" },
  );
  assertEquals(
    await updateCampaignStatus(client, { campaign_id: CAMPAIGN, empresa_id: "", status: "pausada" }),
    { applied: false, status: "pausada", error: "missing_empresa_id" },
  );
  assertEquals(attempts.length, 0);
});

Deno.test("erro do banco é devolvido (não passa em silêncio)", async () => {
  const client = {
    from: () => ({
      update: () => {
        const b: any = {
          eq: () => b,
          in: () => b,
          select: () => Promise.resolve({ data: null, error: { message: "permission denied" } }),
        };
        return b;
      },
    }),
  };
  const r = await updateCampaignStatus(client as any, {
    campaign_id: CAMPAIGN,
    empresa_id: VIVER_EMPRESA_ID,
    status: "pausada",
  });
  assertEquals(r, { applied: false, status: "pausada", error: "permission denied" });
});
