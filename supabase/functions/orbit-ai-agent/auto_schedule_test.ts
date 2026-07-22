// Testes de contrato para tryAutoScheduleMeeting.
// Rodar: deno test --allow-net --allow-env supabase/functions/orbit-ai-agent/auto_schedule_test.ts
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveBookingDateHint, tryAutoScheduleMeeting } from "./index.ts";

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
  availability_start: "09:00",
  availability_end: "18:00",
  booking_min_notice_minutes: 60,
  booking_max_horizon_days: 60,
};

Deno.test("interpreta datas relativas no fuso do tenant sem inventar mês", () => {
  const now = new Date("2026-07-20T15:00:00.000Z"); // segunda, 12h BRT
  assertEquals(resolveBookingDateHint("pode ser quinta-feira", now, "America/Sao_Paulo"), {
    expectedDay: "2026-07-23",
  });
  assertEquals(resolveBookingDateHint("amanhã funciona", now, "America/Sao_Paulo"), {
    expectedDay: "2026-07-21",
  });
  assertEquals(resolveBookingDateHint("semana que vem", now, "America/Sao_Paulo"), {
    ambiguous: true,
  });
});

Deno.test("bloqueia data do modelo divergente do dia informado pelo lead", async () => {
  const state: FakeState = { meetings: [], deals: [], pipeline_stages: [], flow_events: [], order: [] };
  const params = baseParams() as any;
  params.mensagem_cliente = "pode ser quinta-feira";
  params.agendamento.data_iso = "2027-01-14T15:00:00-03:00";
  const res = await tryAutoScheduleMeeting(makeFakeSupabase(state) as any, params, {
    getTokenForEmpresa: async () => TOKEN,
    ensureFreshAccessToken: async () => "at",
    checkAvailability: async () => ({ busy: [] }),
    now: () => new Date("2026-07-20T15:00:00.000Z"),
  });
  assertEquals(res.handled, true);
  assertEquals(res.created, false);
  assertEquals(res.suggestions?.length, 2);
  assertEquals(res.suggestions?.[0]?.start, "2026-07-23T12:00:00.000Z");
  assert(String(res.response_override).includes("dois horários livres"));
  assertEquals(state.order.length, 0);
});

Deno.test("sem data consulta freeBusy e oferece os 2 horários úteis mais próximos", async () => {
  const state: FakeState = { meetings: [], deals: [], pipeline_stages: [], flow_events: [], order: [] };
  const params = baseParams() as any;
  params.mensagem_cliente = "sim, quero agendar";
  params.agendamento = { data_iso: null, tem_horario: false, duracao_min: 60 };
  const queriedDays: string[] = [];
  const res = await tryAutoScheduleMeeting(makeFakeSupabase(state) as any, params, {
    getTokenForEmpresa: async () => TOKEN,
    ensureFreshAccessToken: async () => "at",
    checkAvailability: async (_at, _cal, min) => {
      queriedDays.push(String(min));
      return { busy: [] };
    },
    now: () => new Date("2026-07-20T15:00:00.000Z"), // segunda, 12h BRT
  });
  assertEquals(res.handled, true);
  assertEquals(res.created, false);
  assertEquals(res.suggestions?.map((slot) => slot.label), ["13:00", "14:00"]);
  assertEquals(queriedDays, ["2026-07-20T12:00:00.000Z"]);
  assert(String(res.response_override).includes("Qual deles você prefere?"));
  assert(!state.order.includes("orbit_meetings.insert"));
});

Deno.test("horário explícito fora do expediente não cria evento e oferece alternativas válidas", async () => {
  const state: FakeState = { meetings: [], deals: [], pipeline_stages: [], flow_events: [], order: [] };
  const params = baseParams() as any;
  params.mensagem_cliente = "pode ser dia 30/07 às 8h";
  params.agendamento = {
    data_iso: "2026-07-30T11:00:00.000Z", // 08h BRT
    tem_horario: true,
    duracao_min: 60,
  };
  let createCalls = 0;
  const res = await tryAutoScheduleMeeting(makeFakeSupabase(state) as any, params, {
    getTokenForEmpresa: async () => TOKEN,
    ensureFreshAccessToken: async () => "at",
    checkAvailability: async () => ({ busy: [] }),
    createCalendarEvent: async () => { createCalls++; return { id: "must-not-run" }; },
    now: () => new Date("2026-07-20T15:00:00.000Z"),
  });
  assertEquals(res.handled, true);
  assertEquals(res.created, false);
  assertEquals(createCalls, 0);
  assertEquals(res.suggestions?.map((slot) => slot.label), ["09:00", "10:00"]);
  assert(String(res.response_override).includes("fora do nosso expediente de 09:00 às 18:00"));
  assert(!state.order.includes("rpc.ensure_deal_for_prospect"));
  assert(!state.order.includes("orbit_meetings.insert"));
});

Deno.test("busca automática pula sábado e domingo", async () => {
  const state: FakeState = { meetings: [], deals: [], pipeline_stages: [], flow_events: [], order: [] };
  const params = baseParams() as any;
  params.mensagem_cliente = "quero agendar";
  params.agendamento = { data_iso: null, tem_horario: false, duracao_min: 60 };
  const queried: string[] = [];
  const res = await tryAutoScheduleMeeting(makeFakeSupabase(state) as any, params, {
    getTokenForEmpresa: async () => TOKEN,
    ensureFreshAccessToken: async () => "at",
    checkAvailability: async (_at, _cal, min) => { queried.push(String(min)); return { busy: [] }; },
    now: () => new Date("2026-07-24T23:30:00.000Z"), // sexta, 20:30 BRT; próxima janela é segunda
  });
  assertEquals(res.suggestions?.map((slot) => slot.label), ["09:00", "10:00"]);
  assertEquals(queried, ["2026-07-27T12:00:00.000Z"]);
});

Deno.test("dia sem horário usa janela e fuso configurados no tenant", async () => {
  const state: FakeState = { meetings: [], deals: [], pipeline_stages: [], flow_events: [], order: [] };
  const supa = makeFakeSupabase(state);
  const params = baseParams() as any;
  params.agendamento = { ...params.agendamento, data_iso: START, tem_horario: false };
  let queried: { min: string; max: string; tz: string } | null = null;
  const res = await tryAutoScheduleMeeting(supa as any, params, {
    getTokenForEmpresa: async () => ({
      ...TOKEN,
      timezone: "America/Manaus",
      availability_start: "10:30:00",
      availability_end: "16:30:00",
    }),
    ensureFreshAccessToken: async () => "at",
    checkAvailability: async (_at, _cal, min, max, tz) => {
      queried = { min, max, tz };
      return { busy: [] };
    },
    createCalendarEvent: async () => ({ id: "unused" }),
    deleteCalendarEvent: async () => {},
  });
  assertEquals(res.handled, true);
  assertEquals(res.created, false);
  assertEquals(queried, {
    min: "2026-07-30T14:30:00.000Z",
    max: "2026-07-30T20:30:00.000Z",
    tz: "America/Manaus",
  });
  assertEquals(res.suggestions?.[0]?.label, "10:30");
});

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

Deno.test("movimento para Agendado não insere deal_stage_changed duplicado manualmente", async () => {
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
  // Em produção o trigger do UPDATE de orbit_deals emite o evento. O agente não
  // deve inserir outro evento manual, pois isso criaria dois runs.
  assertEquals(state.flow_events.length, 0);
  assertEquals(state.deals[0].etapa_id, "stage-agendado");
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

// ────────────────────────────────────────────────────────────────────────────────
// Regressão: idempotência concorrente do autoagendamento
// ────────────────────────────────────────────────────────────────────────────────

Deno.test("meeting existente NÃO chama ensureFreshAccessToken/freeBusy/createEvent nem RPC de deal", async () => {
  const state: FakeState = {
    meetings: [{
      id: "m-existing", empresa_id: "emp-1", prospect_id: "prospect-1",
      scheduled_at: START, status: "scheduled", meeting_url: "https://meet/old",
    }],
    deals: [], pipeline_stages: [], flow_events: [], order: [],
  };
  const supa = makeFakeSupabase(state);
  let ensureCalls = 0, freeBusyCalls = 0, createCalls = 0;
  const res = await tryAutoScheduleMeeting(supa as any, baseParams() as any, {
    getTokenForEmpresa: async () => TOKEN,
    ensureFreshAccessToken: async () => { ensureCalls++; return "at"; },
    checkAvailability: async () => { freeBusyCalls++; return { busy: [] }; },
    createCalendarEvent: async () => { createCalls++; return { id: "x" }; },
    deleteCalendarEvent: async () => {},
  });
  assertEquals(ensureCalls, 0, "ensureFreshAccessToken não pode ser chamado se já existe meeting");
  assertEquals(freeBusyCalls, 0, "freeBusy não pode ser chamado se já existe meeting");
  assertEquals(createCalls, 0, "createCalendarEvent não pode ser chamado se já existe meeting");
  assertEquals(res.handled, true);
  assertEquals(res.created, false);
  assertEquals(res.meeting_id, "m-existing");
  assert(!state.order.includes("rpc.ensure_deal_for_prospect"));
});

Deno.test("corrida 23505: deleta o Google event perdedor e reutiliza a meeting vencedora sem novo deal_stage_changed", async () => {
  const winner = {
    id: "m-winner", empresa_id: "emp-1", prospect_id: "prospect-1",
    scheduled_at: START, status: "scheduled", meeting_url: "https://meet/winner",
    created_at: "2026-07-30T17:59:59.000Z",
  };
  const state: FakeState = {
    meetings: [],
    deals: [{ id: "deal-1", etapa_id: null }],
    pipeline_stages: [{ id: "stage-agendado", nome: "Agendado", ordem: 1, empresa_id: "emp-1", is_archived: false }],
    flow_events: [],
    meetingInsertUniqueViolation: true,
    winningMeeting: winner,
    order: [],
  };
  const supa = makeFakeSupabase(state);
  let deleted: any = null;
  const res = await tryAutoScheduleMeeting(supa as any, baseParams() as any, {
    getTokenForEmpresa: async () => TOKEN,
    ensureFreshAccessToken: async () => "at",
    checkAvailability: async () => ({ busy: [] }),
    createCalendarEvent: async () => ({ id: "gev-loser", hangoutLink: "https://meet/loser" }),
    deleteCalendarEvent: async (_at, cal, ev) => { deleted = { cal, ev }; },
  });
  assert(deleted, "deleteCalendarEvent deve ser chamado no evento perdedor");
  assertEquals(deleted.ev, "gev-loser");
  assertEquals(res.handled, true);
  assertEquals(res.created, false);
  assertEquals(res.meeting_id, "m-winner");
  assertEquals(res.deal_id, "deal-1");
  assertEquals(state.flow_events.length, 0, "nenhum deal_stage_changed adicional pode ser emitido na corrida");
});

Deno.test("ramo somente-dia (tem_horario=false) continua chamando ensureFreshAccessToken + freeBusy antes de sugerir slots", async () => {
  const state: FakeState = { meetings: [], deals: [], pipeline_stages: [], flow_events: [], order: [] };
  const supa = makeFakeSupabase(state);
  let ensureCalls = 0, freeBusyCalls = 0;
  const params = baseParams() as any;
  params.agendamento = { ...params.agendamento, tem_horario: false };
  const res = await tryAutoScheduleMeeting(supa as any, params, {
    getTokenForEmpresa: async () => TOKEN,
    ensureFreshAccessToken: async () => { ensureCalls++; return "at"; },
    checkAvailability: async () => { freeBusyCalls++; return { busy: [] }; },
    createCalendarEvent: async () => ({ id: "should-not-be-created" }),
    deleteCalendarEvent: async () => {},
  });
  assertEquals(ensureCalls, 1, "ensureFreshAccessToken deve ser chamado no ramo somente-dia");
  assertEquals(freeBusyCalls, 1, "freeBusy deve ser chamado no ramo somente-dia");
  assertEquals(res.handled, true);
  // Não pode ter criado meeting nem tocado orbit_meetings insert.
  assert(!state.order.includes("orbit_meetings.insert"));
  assert(Array.isArray(res.suggestions));
});

Deno.test("migration contém o índice único parcial esperado em orbit_meetings", async () => {
  const migPath = new URL(
    "../../migrations/",
    import.meta.url,
  );
  const dir = await Deno.readDir(migPath);
  let found = false;
  let matchingFile = "";
  for await (const entry of dir) {
    if (!entry.isFile || !entry.name.endsWith(".sql")) continue;
    const body = await Deno.readTextFile(new URL(entry.name, migPath));
    if (
      body.includes("orbit_meetings_uniq_active_slot") &&
      /CREATE\s+UNIQUE\s+INDEX/i.test(body) &&
      body.includes("empresa_id") &&
      body.includes("prospect_id") &&
      body.includes("scheduled_at") &&
      body.includes("prospect_id IS NOT NULL") &&
      /status\s+IN\s*\(\s*'scheduled'\s*,\s*'rescheduled'\s*\)/i.test(body)
    ) {
      found = true;
      matchingFile = entry.name;
      break;
    }
  }
  assert(found, `Migration com índice único parcial 'orbit_meetings_uniq_active_slot' não encontrada. Encontrado=${matchingFile}`);
});


// ────────────────────────────────────────────────────────────────────────────────
// Guardrail anti-passado (patch 20260720): agendamentos no passado devem ser bloqueados
// ANTES de qualquer chamada a OAuth/Google/RPC de deal/insert.
// ────────────────────────────────────────────────────────────────────────────────

Deno.test("data/hora passada NÃO chama ensureFreshAccessToken/freeBusy/createEvent nem toca deal/insert", async () => {
  const state: FakeState = { meetings: [], deals: [], pipeline_stages: [], flow_events: [], order: [] };
  const supa = makeFakeSupabase(state);
  let ensureCalls = 0, freeBusyCalls = 0, createCalls = 0;
  const params = baseParams() as any;
  // 1 ano no passado
  const pastStart = new Date(Date.now() - 365 * 24 * 3600_000).toISOString();
  params.agendamento = { ...params.agendamento, data_iso: pastStart, tem_horario: true };
  const res = await tryAutoScheduleMeeting(supa as any, params, {
    getTokenForEmpresa: async () => TOKEN,
    ensureFreshAccessToken: async () => { ensureCalls++; return "at"; },
    checkAvailability: async () => { freeBusyCalls++; return { busy: [] }; },
    createCalendarEvent: async () => { createCalls++; return { id: "x" }; },
    deleteCalendarEvent: async () => {},
  });
  assertEquals(ensureCalls, 0);
  assertEquals(freeBusyCalls, 0);
  assertEquals(createCalls, 0);
  assertEquals(res.handled, true);
  assertEquals(res.created, false);
  assert(res.response_override && res.response_override.toLowerCase().includes("já passou"));
  assert(!state.order.includes("rpc.ensure_deal_for_prospect"));
  assert(!state.order.includes("orbit_meetings.insert"));
});

Deno.test("dia passado sem horário NÃO consulta Google e retorna mensagem pedindo data futura", async () => {
  const state: FakeState = { meetings: [], deals: [], pipeline_stages: [], flow_events: [], order: [] };
  const supa = makeFakeSupabase(state);
  let ensureCalls = 0, freeBusyCalls = 0;
  const params = baseParams() as any;
  const pastDay = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
  params.agendamento = { ...params.agendamento, data_iso: pastDay, tem_horario: false };
  const res = await tryAutoScheduleMeeting(supa as any, params, {
    getTokenForEmpresa: async () => TOKEN,
    ensureFreshAccessToken: async () => { ensureCalls++; return "at"; },
    checkAvailability: async () => { freeBusyCalls++; return { busy: [] }; },
    createCalendarEvent: async () => ({ id: "x" }),
    deleteCalendarEvent: async () => {},
  });
  assertEquals(ensureCalls, 0);
  assertEquals(freeBusyCalls, 0);
  assertEquals(res.handled, true);
  assertEquals(res.created, false);
  assert(res.response_override && res.response_override.toLowerCase().includes("já passou"));
});

Deno.test("data futura com horário continua fluindo normalmente (regressão)", async () => {
  const futureDay = localFutureDay(7);
  const futureStart = `${futureDay}T18:00:00.000Z`; // 15h BRT, dentro de 09h–18h
  const futureEnd = new Date(new Date(futureStart).getTime() + 60 * 60_000).toISOString();
  const state: FakeState = {
    meetings: [], deals: [{ id: "deal-1", etapa_id: null }],
    pipeline_stages: [{ id: "stage-1", nome: "Agendado", ordem: 1, empresa_id: "emp-1", is_archived: false }],
    flow_events: [], order: [],
  };
  const supa = makeFakeSupabase(state);
  const params = baseParams() as any;
  params.agendamento = { ...params.agendamento, data_iso: futureStart, tem_horario: true };
  const res = await tryAutoScheduleMeeting(supa as any, params, {
    getTokenForEmpresa: async () => TOKEN,
    ensureFreshAccessToken: async () => "at",
    checkAvailability: async () => ({ busy: [] }),
    createCalendarEvent: async () => ({ id: "gev-1", hangoutLink: "https://meet/x" }),
    deleteCalendarEvent: async () => {},
  });
  assertEquals(res.handled, true);
  assertEquals(res.created, true);
  assert(res.meeting_id);
  assert(state.order.includes("orbit_meetings.insert"));
});

function localFutureDay(days: number): string {
  const future = new Date(Date.now() + days * 24 * 3600_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(future);
}
