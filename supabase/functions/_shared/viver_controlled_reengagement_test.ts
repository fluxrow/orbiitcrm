// Reengajamento controlado Viver Semijoias: isenção MÍNIMA do corte temporal.
//
// V1 campanha controlada Viver com prospect pré-corte → elegível (passa só pelo corte)
// V2 campanha Viver sem marcador → automation_cutoff
// V3 outro tenant com marcador → automation_cutoff
// V4 demais motivos continuam bloqueando (opt-out, handoff, reunião futura, cross-tenant)
// V5 worker preserva o marcador no re-check (metadata persistida)
//
// Rodar: deno test --allow-net --allow-env supabase/functions/_shared/viver_controlled_reengagement_test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { checkEligibility } from "./orbit-whatsapp-outbox.ts";
import {
  controlledReengagementFromMetadata,
  isViverControlledReengagement,
  VIVER_CONTROLLED_REENGAGEMENT_EMPRESA_ID as VIVER,
} from "./viver-controlled-reengagement.ts";

const OTHER = "11111111-2222-3333-4444-555555555555";
const CUTOFF = "2026-09-01T12:00:00.000Z";
const CUT_MS = Date.parse(CUTOFF);
const iso = (ms: number) => new Date(ms).toISOString();

interface Fx {
  prospects: any[];
  conversas: any[];
  deals: any[];
  stages: any[];
  meetings: any[];
  mensagens: any[];
  ai_config: any[];
}

function makeSupabase(fx: Fx) {
  function query(table: string) {
    const filters: Array<[string, any]> = [];
    const inFilters: Array<[string, any[]]> = [];
    const gteFilters: Array<[string, string]> = [];
    let limitN = Infinity;
    const api: any = {
      select: () => api,
      eq: (c: string, v: any) => { filters.push([c, v]); return api; },
      in: (c: string, v: any[]) => { inFilters.push([c, v]); return api; },
      gte: (c: string, v: string) => { gteFilters.push([c, v]); return api; },
      limit: (n: number) => { limitN = n; return api; },
      maybeSingle: () => Promise.resolve({ data: rows().find(matches) ?? null, error: null }),
      then: undefined as any,
    };
    api.then = (resolve: any) =>
      resolve({ data: rows().filter(matches).slice(0, limitN), error: null });
    function rows(): any[] {
      if (table === "orbit_prospects") return fx.prospects;
      if (table === "orbit_conversas") return fx.conversas;
      if (table === "orbit_deals") return fx.deals;
      if (table === "orbit_pipeline_stages") return fx.stages;
      if (table === "orbit_meetings") return fx.meetings;
      if (table === "orbit_mensagens") return fx.mensagens;
      if (table === "orbit_ai_config") return fx.ai_config;
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

function baseFx(over: Partial<Fx> = {}): Fx {
  return {
    prospects: [],
    conversas: [],
    deals: [],
    stages: [],
    meetings: [],
    mensagens: [],
    ai_config: [
      { empresa_id: VIVER, auto_reply_new_leads_from: CUTOFF },
      { empresa_id: OTHER, auto_reply_new_leads_from: CUTOFF },
    ],
    ...over,
  };
}

const prospect = (id: string, empresa: string, createdMs: number, over: any = {}) => ({
  id,
  empresa_id: empresa,
  created_at: iso(createdMs),
  deleted_at: null,
  optout_whatsapp: false,
  ...over,
});
const conversa = (id: string, prospect_id: string, empresa: string, over: any = {}) => ({
  id,
  empresa_id: empresa,
  prospect_id,
  human_talk: false,
  human_user_id: null,
  archived_at: null,
  quarantine_reason: null,
  handoff_sent_at: null,
  ...over,
});

const MARKER = { viver_controlled_reengagement: true };

Deno.test("V0 marcador só vale para campanha do tenant Viver", () => {
  assertEquals(isViverControlledReengagement({ empresa_id: VIVER, source_type: "campaign", metadata: MARKER }), true);
  assertEquals(isViverControlledReengagement({ empresa_id: VIVER, source_type: "campaign", metadata: {} }), false);
  assertEquals(isViverControlledReengagement({ empresa_id: VIVER, source_type: "ai_reply", metadata: MARKER }), false);
  assertEquals(isViverControlledReengagement({ empresa_id: VIVER, source_type: "flow_followup", metadata: MARKER }), false);
  assertEquals(isViverControlledReengagement({ empresa_id: OTHER, source_type: "campaign", metadata: MARKER }), false);
  assertEquals(controlledReengagementFromMetadata(MARKER), true);
  assertEquals(controlledReengagementFromMetadata(null), false);
});

Deno.test("V1 campanha controlada Viver com prospect pré-corte é elegível", async () => {
  const fx = baseFx({
    prospects: [prospect("p-old", VIVER, CUT_MS - 30 * 86400_000)],
    conversas: [conversa("c-old", "p-old", VIVER)],
  });
  const elig = await checkEligibility(makeSupabase(fx), {
    empresa_id: VIVER,
    prospect_id: "p-old",
    conversa_id: "c-old",
    campaign_id: "camp-1",
    source_type: "campaign",
    source_id: "rec-1",
    metadata: MARKER,
  });
  assertEquals(elig.reasons, []);
  assertEquals(elig.eligible, true);
});

Deno.test("V2 campanha Viver sem marcador continua bloqueada pelo corte", async () => {
  const fx = baseFx({
    prospects: [prospect("p-old", VIVER, CUT_MS - 30 * 86400_000)],
    conversas: [conversa("c-old", "p-old", VIVER)],
  });
  const elig = await checkEligibility(makeSupabase(fx), {
    empresa_id: VIVER,
    prospect_id: "p-old",
    conversa_id: "c-old",
    campaign_id: "camp-1",
    source_type: "campaign",
    source_id: "rec-1",
  });
  assertEquals(elig.eligible, false);
  assert(elig.reasons.includes("automation_cutoff"));
});

Deno.test("V3 outro tenant com marcador continua bloqueado pelo corte", async () => {
  const fx = baseFx({
    prospects: [prospect("p-old", OTHER, CUT_MS - 86400_000)],
    conversas: [conversa("c-old", "p-old", OTHER)],
  });
  const elig = await checkEligibility(makeSupabase(fx), {
    empresa_id: OTHER,
    prospect_id: "p-old",
    conversa_id: "c-old",
    campaign_id: "camp-2",
    source_type: "campaign",
    source_id: "rec-2",
    metadata: MARKER,
  });
  assertEquals(elig.eligible, false);
  assert(elig.reasons.includes("automation_cutoff"));
});

Deno.test("V4 demais motivos de segurança continuam bloqueando com marcador", async () => {
  // handoff humano
  const handoff = baseFx({
    prospects: [prospect("p1", VIVER, CUT_MS - 86400_000)],
    conversas: [conversa("c1", "p1", VIVER, { human_talk: true })],
  });
  const r1 = await checkEligibility(makeSupabase(handoff), {
    empresa_id: VIVER, prospect_id: "p1", conversa_id: "c1",
    source_type: "campaign", source_id: "r1", metadata: MARKER,
  });
  assertEquals(r1.eligible, false);
  assert(r1.reasons.includes("human_handoff"));

  // opt-out
  const optout = baseFx({
    prospects: [prospect("p2", VIVER, CUT_MS - 86400_000, { optout_whatsapp: true })],
  });
  const r2 = await checkEligibility(makeSupabase(optout), {
    empresa_id: VIVER, prospect_id: "p2",
    source_type: "campaign", source_id: "r2", metadata: MARKER,
  });
  assertEquals(r2.eligible, false);
  assert(r2.reasons.includes("opt_out"));

  // prospect deletado
  const deleted = baseFx({
    prospects: [prospect("p3", VIVER, CUT_MS - 86400_000, { deleted_at: iso(CUT_MS) })],
  });
  const r3 = await checkEligibility(makeSupabase(deleted), {
    empresa_id: VIVER, prospect_id: "p3",
    source_type: "campaign", source_id: "r3", metadata: MARKER,
  });
  assertEquals(r3.eligible, false);
  assert(r3.reasons.includes("prospect_deleted"));

  // reunião futura
  const meeting = baseFx({
    prospects: [prospect("p4", VIVER, CUT_MS - 86400_000)],
    meetings: [{ id: "m1", prospect_id: "p4", status: "scheduled", scheduled_at: iso(Date.now() + 86400_000) }],
  });
  const r4 = await checkEligibility(makeSupabase(meeting), {
    empresa_id: VIVER, prospect_id: "p4",
    source_type: "campaign", source_id: "r4", metadata: MARKER,
  });
  assertEquals(r4.eligible, false);
  assert(r4.reasons.includes("meeting_scheduled"));

  // cross-tenant
  const cross = baseFx({
    prospects: [prospect("p5", OTHER, CUT_MS + 86400_000)],
  });
  const r5 = await checkEligibility(makeSupabase(cross), {
    empresa_id: VIVER, prospect_id: "p5",
    source_type: "campaign", source_id: "r5", metadata: MARKER,
  });
  assertEquals(r5.eligible, false);
  assert(r5.reasons.includes("cross_tenant"));
});

Deno.test("V5 worker preserva o marcador no re-check (metadata persistida)", async () => {
  const fx = baseFx({
    prospects: [prospect("p-old", VIVER, CUT_MS - 10 * 86400_000)],
    conversas: [conversa("c-old", "p-old", VIVER)],
  });
  const itemMetadata: Record<string, unknown> = { ...MARKER, controlled_reengagement_wave: 1 };
  const elig = await checkEligibility(makeSupabase(fx), {
    empresa_id: VIVER,
    prospect_id: "p-old",
    conversa_id: "c-old",
    campaign_id: "camp-1",
    source_type: "campaign",
    source_id: "rec-1",
    controlled_reengagement: controlledReengagementFromMetadata(itemMetadata),
    metadata: itemMetadata,
  });
  assertEquals(elig.reasons, []);
  assertEquals(elig.eligible, true);

  // Sem o marcador na metadata, o worker volta a cancelar por corte.
  const eligNoMarker = await checkEligibility(makeSupabase(fx), {
    empresa_id: VIVER,
    prospect_id: "p-old",
    conversa_id: "c-old",
    campaign_id: "camp-1",
    source_type: "campaign",
    source_id: "rec-1",
    controlled_reengagement: controlledReengagementFromMetadata({}),
    metadata: {},
  });
  assertEquals(eligNoMarker.eligible, false);
  assert(eligNoMarker.reasons.includes("automation_cutoff"));
});
