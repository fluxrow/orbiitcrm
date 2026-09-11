// Gates de segurança preservados pela política de 15 vagas diárias da Viver.
// A cota diária muda apenas O QUE CONTA; nada aqui é dispensado:
// opt-out, handoff humano, resposta do lead e reunião agendada continuam
// bloqueando o primeiro contato de campanha.
//
// Rodar:
//   deno test --allow-net --allow-env supabase/functions/_shared/viver_daily_quota_gates_test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { checkEligibility, type OutboxContext } from "./orbit-whatsapp-outbox.ts";
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
}

function makeSupabase(fx: Fx) {
  function query(table: string) {
    const filters: Array<[string, any]> = [];
    const inFilters: Array<[string, any[]]> = [];
    const gteFilters: Array<[string, string]> = [];
    let limitN = Infinity;
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
      limit: (n: number) => {
        limitN = n;
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
      resolve({ data: pickRows(table).filter(matches).slice(0, limitN), error: null });
    };
    function pickRows(t: string): any[] {
      if (t === "orbit_prospects") return fx.prospects;
      if (t === "orbit_conversas") return fx.conversas;
      if (t === "orbit_deals") return fx.deals;
      if (t === "orbit_pipeline_stages") return fx.stages;
      if (t === "orbit_meetings") return fx.meetings;
      if (t === "orbit_mensagens") return fx.mensagens;
      if (t === "orbit_whatsapp_outbox") return fx.outbox ?? [];
      return [];
    }
    function matches(r: any): boolean {
      for (const [c, v] of filters) if (r[c] !== v) return false;
      for (const [c, vals] of inFilters) if (!vals.includes(r[c])) return false;
      for (const [c, v] of gteFilters) if (!(String(r[c] ?? "") >= v)) return false;
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
