// Gates de segurança preservados pela política de 50 vagas diárias da Viver.
// A cota diária muda apenas O QUE CONTA; nada aqui é dispensado:
// opt-out, handoff humano, resposta do lead e reunião agendada continuam
// bloqueando o primeiro contato de campanha.
//
// Rodar:
//   deno test --allow-net --allow-env supabase/functions/_shared/viver_daily_quota_gates_test.ts

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  checkEligibility,
  type OutboxContext,
} from "./orbit-whatsapp-outbox.ts";
import { checkCampaignRecipientEligibility } from "./campaign-safety.ts";
import { VIVER_SEMIJOIAS_EMPRESA_ID } from "./viver-daily-quota-policy.ts";

interface Fx {
  prospects: any[];
  conversas: any[];
  deals: any[];
  stages: any[];
  meetings: any[];
  mensagens: any[];
  outbox?: any[];
  lidMap?: any[];
  webhookLogs?: any[];
  failedReadTable?: string;
}

function makeSupabase(fx: Fx) {
  function query(table: string) {
    const filters: Array<[string, any]> = [];
    const inFilters: Array<[string, any[]]> = [];
    const gteFilters: Array<[string, string]> = [];
    const containsFilters: Array<[string, Record<string, unknown>]> = [];
    let limitN = Infinity;
    let orderBy: string | null = null;
    let orderAscending = true;
    const api: any = {
      select: () => api,
      eq: (col: string, val: any) => {
        filters.push([col, val]);
        return api;
      },
      in: (col: string, vals: any[]) => {
        inFilters.push([col, vals]);
        return api;
      },
      gte: (col: string, v: string) => {
        gteFilters.push([col, v]);
        return api;
      },
      contains: (col: string, value: Record<string, unknown>) => {
        containsFilters.push([col, value]);
        return api;
      },
      limit: (n: number) => {
        limitN = n;
        return api;
      },
      order: (col: string, options: { ascending?: boolean } = {}) => {
        orderBy = col;
        orderAscending = options.ascending !== false;
        return api;
      },
      maybeSingle: () =>
        Promise.resolve({
          data: pickRows(table).find(matches) ?? null,
          error: null,
        }),
      single: () => Promise.resolve({ data: null, error: null }),
      then: undefined,
    };
    api.then = (resolve: any) => {
      {
        let rows = pickRows(table).filter(matches);
        if (orderBy) {
          rows = [...rows].sort((a, b) =>
            String(a[orderBy!] ?? "").localeCompare(String(b[orderBy!] ?? "")) *
            (orderAscending ? 1 : -1)
          );
        }
        resolve(fx.failedReadTable === table
          ? { data: null, error: { message: "read unavailable" } }
          : { data: rows.slice(0, limitN), error: null });
      }
    };
    function pickRows(t: string): any[] {
      if (t === "orbit_prospects") return fx.prospects;
      if (t === "orbit_conversas") return fx.conversas;
      if (t === "orbit_deals") return fx.deals;
      if (t === "orbit_pipeline_stages") return fx.stages;
      if (t === "orbit_meetings") return fx.meetings;
      if (t === "orbit_mensagens") return fx.mensagens;
      if (t === "orbit_whatsapp_outbox") return fx.outbox ?? [];
      if (t === "orbit_whatsapp_lid_map") return fx.lidMap ?? [];
      if (t === "orbit_webhook_logs") return fx.webhookLogs ?? [];
      return [];
    }
    function matches(r: any): boolean {
      for (const [c, v] of filters) if (r[c] !== v) return false;
      for (const [c, vals] of inFilters) if (!vals.includes(r[c])) return false;
      for (const [c, v] of gteFilters) {
        if (!(String(r[c] ?? "") >= v)) return false;
      }
      for (const [c, expected] of containsFilters) {
        const actual = r[c];
        if (!actual || typeof actual !== "object") return false;
        for (const [key, value] of Object.entries(expected)) {
          if (actual[key] !== value) return false;
        }
      }
      return true;
    }
    return api;
  }
  return { from: (t: string) => query(t) };
}

const EMP = VIVER_SEMIJOIAS_EMPRESA_ID;
const PRO = "prospect-viver-1";
const CONV = "conv-viver-1";

function baseFx(overrides: Partial<Fx> = {}): Fx {
  return {
    prospects: [{
      id: PRO,
      empresa_id: EMP,
      optout_whatsapp: false,
      deleted_at: null,
    }],
    conversas: [{
      id: CONV,
      empresa_id: EMP,
      prospect_id: PRO,
      human_talk: false,
      human_user_id: null,
    }],
    deals: [],
    stages: [],
    meetings: [],
    mensagens: [],
    ...overrides,
  };
}

function ctxCampaign(): OutboxContext {
  return {
    empresa_id: EMP,
    prospect_id: PRO,
    conversa_id: CONV,
    source_type: "campaign",
    campaign_id: "camp-viver-1",
    source_id: "recipient-1",
  } as OutboxContext;
}

Deno.test("VG1 opt-out bloqueia o primeiro contato de campanha", async () => {
  const fx = baseFx({
    prospects: [{
      id: PRO,
      empresa_id: EMP,
      optout_whatsapp: true,
      deleted_at: null,
    }],
  });
  const r = await checkEligibility(makeSupabase(fx), ctxCampaign());
  assert(r.reasons.includes("opt_out"), r.reasons.join(","));
  assertEquals(r.eligible, false);
});

Deno.test("VG2 handoff humano bloqueia o primeiro contato de campanha", async () => {
  const fx = baseFx({
    conversas: [{
      id: CONV,
      empresa_id: EMP,
      prospect_id: PRO,
      human_talk: true,
      human_user_id: "user-1",
    }],
  });
  const r = await checkEligibility(makeSupabase(fx), ctxCampaign());
  assert(r.reasons.includes("human_handoff"), r.reasons.join(","));
  assertEquals(r.eligible, false);
});

Deno.test("VG3 resposta do lead bloqueia o destinatário de campanha", async () => {
  const fx = baseFx({
    mensagens: [{
      id: "m-in",
      conversa_id: CONV,
      direcao: "IN",
      status: "recebida",
    }],
  });
  const r = await checkCampaignRecipientEligibility(makeSupabase(fx), {
    campaign: { filtros_json: { campaign_safety: { skip_if_replied: true } } },
    empresa_id: EMP,
    prospect: fx.prospects[0],
  });
  assertEquals(r.eligible, false);
  assertEquals(r.motivo, "lead_replied");
});

Deno.test("VG3a OUT com aceite do provedor e status READ bloqueia novo primeiro contato", async () => {
  const fx = baseFx({
    mensagens: [{
      id: "m-read",
      conversa_id: CONV,
      direcao: "OUT",
      status: "READ",
      provider_message_id: "provider-accepted",
    }],
  });
  const r = await checkCampaignRecipientEligibility(makeSupabase(fx), {
    campaign: { filtros_json: { campaign_safety: { skip_if_contacted: true } } },
    empresa_id: EMP,
    prospect: fx.prospects[0],
  });
  assertEquals(r.eligible, false);
  assertEquals(r.motivo, "already_contacted");
});

Deno.test("VG3a simulação sem aceite não conta como contato real", async () => {
  const fx = baseFx({
    mensagens: [{
      id: "m-simulated",
      conversa_id: CONV,
      direcao: "OUT",
      status: "simulated",
      provider_message_id: null,
    }],
  });
  const r = await checkCampaignRecipientEligibility(makeSupabase(fx), {
    campaign: { filtros_json: { campaign_safety: { skip_if_contacted: true } } },
    empresa_id: EMP,
    prospect: fx.prospects[0],
  });
  assertEquals(r.eligible, true);
});

Deno.test("VG3a falha ao consultar histórico de OUT bloqueia campanha", async () => {
  const fx = baseFx({ failedReadTable: "orbit_mensagens" });
  const r = await checkCampaignRecipientEligibility(makeSupabase(fx), {
    campaign: { filtros_json: { campaign_safety: { skip_if_contacted: true } } },
    empresa_id: EMP,
    prospect: fx.prospects[0],
  });
  assertEquals(r.eligible, false);
  assertEquals(r.motivo, "contact_history_check_failed");
});

Deno.test("VG3b handoff humano bloqueia o destinatário de campanha", async () => {
  const fx = baseFx({
    conversas: [{
      id: CONV,
      empresa_id: EMP,
      prospect_id: PRO,
      human_talk: true,
      human_user_id: "user-1",
    }],
  });
  const r = await checkCampaignRecipientEligibility(makeSupabase(fx), {
    campaign: { filtros_json: { campaign_safety: { skip_if_handoff: true } } },
    empresa_id: EMP,
    prospect: fx.prospects[0],
  });
  assertEquals(r.eligible, false);
  assertEquals(r.motivo, "human_handoff");
});

Deno.test("VG3c histórico do celular da Fernanda bloqueia campanha mesmo sem mensagem persistida", async () => {
  const fx = baseFx({
    lidMap: [{
      empresa_id: EMP,
      prospect_id: PRO,
      lid: "lead-1@lid",
      instance_id: "instance-viver",
    }],
    webhookLogs: [{
      instance_id: "instance-viver",
      event_type: "on-receive",
      created_at: "2026-09-15T12:12:58Z",
      payload: {
        chatLid: "lead-1@lid",
        fromMe: true,
        fromApi: false,
        text: { message: "mensagem humana" },
      },
    }],
  });
  const r = await checkCampaignRecipientEligibility(makeSupabase(fx), {
    campaign: {
      filtros_json: {
        campaign_safety: { skip_if_contacted: true, skip_if_handoff: true },
      },
    },
    empresa_id: EMP,
    prospect: fx.prospects[0],
  });
  assertEquals(r.eligible, false);
  assertEquals(r.motivo, "human_phone_history");
});

Deno.test("VG3d echo da API não simula atendimento humano", async () => {
  const fx = baseFx({
    lidMap: [{
      empresa_id: EMP,
      prospect_id: PRO,
      lid: "lead-1@lid",
      instance_id: "instance-viver",
    }],
    webhookLogs: [{
      instance_id: "instance-viver",
      event_type: "on-receive",
      created_at: "2026-09-15T12:12:58Z",
      payload: {
        chatLid: "lead-1@lid",
        fromMe: true,
        fromApi: true,
        text: { message: "echo do Orbit" },
      },
    }],
  });
  const r = await checkCampaignRecipientEligibility(makeSupabase(fx), {
    campaign: {
      filtros_json: {
        campaign_safety: { skip_if_contacted: true, skip_if_handoff: true },
      },
    },
    empresa_id: EMP,
    prospect: fx.prospects[0],
  });
  assertEquals(r.eligible, true);
  assertEquals(r.motivo, null);
});

Deno.test("VG4 reunião agendada bloqueia o primeiro contato de campanha", async () => {
  const fx = baseFx({
    meetings: [{
      id: "mt-1",
      prospect_id: PRO,
      status: "scheduled",
      scheduled_at: new Date(Date.now() + 86_400_000).toISOString(),
    }],
  });
  const r = await checkEligibility(makeSupabase(fx), ctxCampaign());
  assert(r.reasons.includes("meeting_scheduled"), r.reasons.join(","));
  assertEquals(r.eligible, false);
});

Deno.test("VG5 prospect deletado bloqueia o primeiro contato de campanha", async () => {
  const fx = baseFx({
    prospects: [{
      id: PRO,
      empresa_id: EMP,
      optout_whatsapp: false,
      deleted_at: new Date().toISOString(),
    }],
  });
  const r = await checkEligibility(makeSupabase(fx), ctxCampaign());
  assert(r.reasons.includes("prospect_deleted"), r.reasons.join(","));
});
