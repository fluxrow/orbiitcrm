// Testes de contrato para tryAutoScheduleMeeting.
// Rodar: deno test --allow-net --allow-env supabase/functions/orbit-ai-agent/auto_schedule_test.ts
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { tryAutoScheduleMeeting } from "./index.ts";

type Row = Record<string, any>;

interface FakeState {
  meetings: Row[];
  deals: Row[];
  pipeline_stages: Row[];
  flow_events: Row[];
  meetingInsertFails?: boolean;
  // Simula corrida 23505: primeiro insert em orbit_meetings falha com unique_violation
  // e uma linha "vencedora" é apresentada nos SELECTs seguintes.
  meetingInsertUniqueViolation?: boolean;
  winningMeeting?: Row | null;
  ensureDealResult?: { data: any; error: any };
  order: string[];
}


function makeFakeSupabase(state: FakeState) {
  // Query builder terminal-agnóstico.
  function tableApi(table: string) {
    const filters: Array<{ col: string; op: string; val: any }> = [];
    let pending: any = null;
    const api: any = {
      _record(op: string) { state.order.push(`${table}.${op}`); },
      insert(payload: any) {
        state.order.push(`${table}.insert`);
        if (table === "orbit_meetings" && state.meetingInsertUniqueViolation) {
          // 1º insert: falha 23505 e "instala" a vencedora nas próximas leituras.
          state.meetingInsertUniqueViolation = false;
          if (state.winningMeeting) state.meetings.push(state.winningMeeting);
          pending = { data: null, error: { code: "23505", message: "duplicate key value violates unique constraint" } };
        } else if (table === "orbit_meetings" && state.meetingInsertFails) {
          pending = { data: null, error: { code: "XX000", message: "insert failed" } };
        } else if (table === "orbit_meetings") {
          const row = { id: `meeting-${state.meetings.length + 1}`, ...payload };
          state.meetings.push(row);
          pending = { data: row, error: null };
        } else if (table === "orbit_flow_events") {
          state.flow_events.push(payload);
          pending = { data: payload, error: null };
        } else {
          pending = { data: payload, error: null };
        }
        return api;
      },

      update(patch: any) {
        state.order.push(`${table}.update`);
        if (table === "orbit_deals") {
          for (const d of state.deals) Object.assign(d, patch);
        } else if (table === "orbit_meetings") {
          for (const m of state.meetings) Object.assign(m, patch);
        }
        pending = { data: null, error: null };
        return api;
      },
      select(_cols?: string) { return api; },
      eq(col: string, val: any) { filters.push({ col, op: "eq", val }); return api; },
      in(col: string, vals: any[]) { filters.push({ col, op: "in", val: vals }); return api; },
      ilike(col: string, val: any) { filters.push({ col, op: "ilike", val }); return api; },
      order(_c: string, _o?: any) { return api; },
      limit(_n: number) { return api; },
      maybeSingle() {
        if (pending) return Promise.resolve(pending);
        state.order.push(`${table}.select`);
        let rows: Row[] =
          table === "orbit_meetings" ? state.meetings :
          table === "orbit_deals" ? state.deals :
          table === "orbit_pipeline_stages" ? state.pipeline_stages :
          [];
        for (const f of filters) {
          rows = rows.filter((r) => {
            if (f.op === "eq") return r[f.col] === f.val;
            if (f.op === "in") return (f.val as any[]).includes(r[f.col]);
            if (f.op === "ilike") return String(r[f.col] || "").toLowerCase().includes(String(f.val).replaceAll("%", "").toLowerCase());
            return true;
          });
        }
        return Promise.resolve({ data: rows[0] ?? null, error: null });
      },
    };
    return api;
  }
  return {
    from: (table: string) => tableApi(table),
    rpc: (fn: string, _args: any) => {
      state.order.push(`rpc.${fn}`);
      if (fn === "ensure_deal_for_prospect") {
        return Promise.resolve(state.ensureDealResult ?? { data: "deal-1", error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
  };
}

const TOKEN: any = {
  id: "tok-1",
  empresa_id: "emp-1",
  user_id: "u-1",
  google_email: "x@y.com",
  access_token: "a",
  refresh_token: "r",
  expires_at: new Date(Date.now() + 3600_000).toISOString(),
  calendar_id: "primary",
  timezone: "America/Sao_Paulo",
};

const START = "2026-07-30T18:00:00.000Z"; // 15:00 BRT
const END = "2026-07-30T19:00:00.000Z";

function baseParams() {
  return {
    empresaId: "emp-1",
    prospect: { nome_razao: "Eliene", email_principal: "e@x.com" },
    prospect_id: "prospect-1",
    conversa_id: "conv-1",
    telefone: "+5511999999999",
    agendamento: { data_iso: START, tem_horario: true, duracao_min: 60, titulo: "Call com Eliene" },
  };
}

Deno.test("order: meeting lookup → ensure_deal → freeBusy exato → createEvent → insert meeting", async () => {
  const state: FakeState = { meetings: [], deals: [{ id: "deal-1", etapa_id: null }], pipeline_stages: [{ id: "stage-1", nome: "Agendado", ordem: 1, empresa_id: "emp-1", is_archived: false }], flow_events: [], order: [] };
  const supa = makeFakeSupabase(state);
  const created = { id: "gev-1", hangoutLink: "https://meet/x", htmlLink: "https://cal/x" };
  const res = await tryAutoScheduleMeeting(supa as any, baseParams() as any, {
    getTokenForEmpresa: async () => { state.order.push("getToken"); return TOKEN; },
    ensureFreshAccessToken: async () => { state.order.push("ensureAccess"); return "at"; },
    checkAvailability: async (_at, _cal, tmin, tmax) => { state.order.push(`freeBusy:${tmin}:${tmax}`); return { busy: [] }; },
    createCalendarEvent: async () => { state.order.push("createEvent"); return created; },
    deleteCalendarEvent: async () => { state.order.push("delete"); },
  });
  assertEquals(res.handled, true);
  assertEquals(res.created, true);
  assertEquals(res.deal_id, "deal-1");
  assert(res.meeting_id);
  const seq = state.order;
  const idxLookup = seq.indexOf("orbit_meetings.select");
  const idxEnsure = seq.indexOf("rpc.ensure_deal_for_prospect");
  const idxFB = seq.findIndex((s) => s.startsWith("freeBusy:"));
  const idxCreate = seq.indexOf("createEvent");
  const idxInsert = seq.indexOf("orbit_meetings.insert");
  assert(idxLookup !== -1 && idxLookup < idxEnsure, `lookup antes de ensure_deal (seq=${seq.join(",")})`);
  assert(idxEnsure < idxFB, `ensure_deal antes do freeBusy exato (seq=${seq.join(",")})`);
  assert(idxFB < idxCreate, `freeBusy antes do createEvent (seq=${seq.join(",")})`);
  assert(idxCreate < idxInsert, `createEvent antes do insert meeting (seq=${seq.join(",")})`);
  assertEquals(seq[idxFB], `freeBusy:${START}:${END}`);
});

Deno.test("rollback: se insert meeting falhar, DELETE do evento Google é chamado", async () => {
  const state: FakeState = { meetings: [], deals: [{ id: "deal-1" }], pipeline_stages: [], flow_events: [], meetingInsertFails: true, order: [] };
  const supa = makeFakeSupabase(state);
  let deleted: any = null;
  const res = await tryAutoScheduleMeeting(supa as any, baseParams() as any, {
    getTokenForEmpresa: async () => TOKEN,
    ensureFreshAccessToken: async () => "at",
    checkAvailability: async () => ({ busy: [] }),
    createCalendarEvent: async () => ({ id: "gev-42" }),
    deleteCalendarEvent: async (_at, cal, ev) => { deleted = { cal, ev }; },
  });
  assertEquals(res.handled, false);
  assertEquals(res.error, "insert orbit_meetings falhou");
  assert(deleted, "deleteCalendarEvent deve ter sido chamado");
  assertEquals(deleted.ev, "gev-42");
});

Deno.test("ensure_deal_for_prospect falhando aborta antes de tocar Google", async () => {
  const state: FakeState = { meetings: [], deals: [], pipeline_stages: [], flow_events: [], ensureDealResult: { data: null, error: { message: "boom" } }, order: [] };
  const supa = makeFakeSupabase(state);
  let touchedGoogle = false;
  const res = await tryAutoScheduleMeeting(supa as any, baseParams() as any, {
    getTokenForEmpresa: async () => TOKEN,
    ensureFreshAccessToken: async () => "at",
    checkAvailability: async () => { touchedGoogle = true; return { busy: [] }; },
    createCalendarEvent: async () => { touchedGoogle = true; return { id: "x" }; },
    deleteCalendarEvent: async () => {},
  });
  assertEquals(res.handled, false);
  assertEquals(res.error, "ensure_deal_for_prospect falhou");
  assertEquals(touchedGoogle, false);
});

Deno.test("freeBusy exato conflitante NÃO cria evento e NÃO faz handoff", async () => {
  const state: FakeState = { meetings: [], deals: [{ id: "deal-1" }], pipeline_stages: [], flow_events: [], order: [] };
  const supa = makeFakeSupabase(state);
  let created = false;
  const res = await tryAutoScheduleMeeting(supa as any, baseParams() as any, {
    getTokenForEmpresa: async () => TOKEN,
    ensureFreshAccessToken: async () => "at",
    checkAvailability: async () => ({ busy: [{ start: START, end: END }] }),
    createCalendarEvent: async () => { created = true; return { id: "x" }; },
    deleteCalendarEvent: async () => {},
  });
  assertEquals(created, false);
  assertEquals(res.handled, true); // suprime handoff
  assertEquals(res.created, false);
  assert(res.response_override && res.response_override.includes("ocupado"));
});

Deno.test("dedupe: meeting pré-existente reutilizado sem tocar Google nem criar novo insert", async () => {
  const state: FakeState = {
    meetings: [{ id: "m-existing", empresa_id: "emp-1", prospect_id: "prospect-1", scheduled_at: START, status: "scheduled", meeting_url: "https://meet/old" }],
    deals: [], pipeline_stages: [], flow_events: [], order: [],
  };
  const supa = makeFakeSupabase(state);
  let touched = 0;
  const res = await tryAutoScheduleMeeting(supa as any, baseParams() as any, {
    getTokenForEmpresa: async () => TOKEN,
    ensureFreshAccessToken: async () => "at",
    checkAvailability: async () => { touched++; return { busy: [] }; },
    createCalendarEvent: async () => { touched++; return { id: "x" }; },
    deleteCalendarEvent: async () => { touched++; },
  });
  assertEquals(touched, 0);
  assertEquals(res.handled, true);
  assertEquals(res.created, false);
  assertEquals(res.meeting_id, "m-existing");
  assert(!state.order.includes("rpc.ensure_deal_for_prospect"));
});

Deno.test("deal_stage_changed inclui prospect_id e meeting_id no payload", async () => {
  const state: FakeState = {
    meetings: [],
    deals: [{ id: "deal-1", etapa_id: null }],
    pipeline_stages: [{ id: "stage-agendado", nome: "Agendado", ordem: 1, empresa_id: "emp-1", is_archived: false }],
    flow_events: [], order: [],
  };
  const supa = makeFakeSupabase(state);
  const res = await tryAutoScheduleMeeting(supa as any, baseParams() as any, {
    getTokenForEmpresa: async () => TOKEN,
    ensureFreshAccessToken: async () => "at",
    checkAvailability: async () => ({ busy: [] }),
    createCalendarEvent: async () => ({ id: "gev-1", hangoutLink: "https://meet/x" }),
    deleteCalendarEvent: async () => {},
  });
  assertEquals(res.created, true);
  assertEquals(state.flow_events.length, 1);
  const ev = state.flow_events[0];
  assertEquals(ev.event_type, "deal_stage_changed");
  assertEquals(ev.payload.prospect_id, "prospect-1");
  assertEquals(ev.payload.meeting_id, res.meeting_id);
  assertEquals(ev.payload.deal_id, "deal-1");
});

Deno.test("Google Calendar não conectado devolve not_connected (handoff manual)", async () => {
  const state: FakeState = { meetings: [], deals: [], pipeline_stages: [], flow_events: [], order: [] };
  const supa = makeFakeSupabase(state);
  const res = await tryAutoScheduleMeeting(supa as any, baseParams() as any, {
    getTokenForEmpresa: async () => null as any,
    ensureFreshAccessToken: async () => "at",
    checkAvailability: async () => ({ busy: [] }),
    createCalendarEvent: async () => ({ id: "x" }),
    deleteCalendarEvent: async () => {},
  });
  assertEquals(res.handled, false);
  assertEquals(res.not_connected, true);
});
