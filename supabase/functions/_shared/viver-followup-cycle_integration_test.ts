// Integração REALISTA do novo ciclo autorizado de follow-ups da Viver
// (quota_policy = viver_list15_followups_separate_2026-09-11).
//
// Não é teste de função pura: exercita `reconstituteViverControlledFollowups`
// contra um banco em memória que reproduz o estado REAL de produção —
// `orbit_flow_scheduled_actions` com status=success e last_error=null que nunca
// produziram envio, cancelamentos operacionais históricos, toques aceitos,
// toques de resultado incerto e os índices únicos reais:
//   • orbit_flow_runs (pkey id)
//   • UNIQUE(run_id, ordem) WHERE status IN (pending, running, success)
//   • UNIQUE(cadence_key) WHERE status IN (pending, running)
//
// Rodar:
//   deno test --allow-none supabase/functions/_shared/viver-followup-cycle_integration_test.ts

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  followupCadenceKey,
  rankViverReconcileCandidates,
  reconstituteViverControlledFollowups,
  VIVER_FOLLOWUP_CYCLE_QUOTA_POLICY,
  VIVER_FOLLOWUP_EMPRESA_ID,
  VIVER_HISTORICAL_OPERATIONAL_CANCEL_REASONS,
} from "./viver-followup-reconstitution.ts";

const EMPRESA = VIVER_FOLLOWUP_EMPRESA_ID;
const PROSPECT = "11111111-1111-4111-8111-111111111111";
const CONVERSA = "22222222-2222-4222-8222-222222222222";
const CAMPAIGN = "33333333-3333-4333-8333-333333333333";
const FLOW = "0da4e8dc-05ee-4faa-b4ca-4b359ae5feb7"; // Typebot individual aprovado
const OLD_RUN = "55555555-5555-4555-8555-555555555555";
const EVENT = "66666666-6666-4666-8666-666666666666";
const OUTBOX = "77777777-7777-4777-8777-777777777777";
const PROVIDER = "ZAPI-REAL-1";
const SENT_AT = "2026-09-11T13:04:00.000Z";
const DAY = 86_400;

const D1 = "aaaaaaa1-0000-4000-8000-000000000001";
const D3 = "aaaaaaa1-0000-4000-8000-000000000003";
const D7 = "aaaaaaa1-0000-4000-8000-000000000007";

// ───────────────────────── banco em memória ─────────────────────────

const ACTIVE = new Set(["pending", "running", "success"]);
const ACTIVE_CADENCE = new Set(["pending", "running"]);

type Row = Record<string, any>;

class FakeDb {
  tables: Record<string, Row[]> = {};
  constructor(seed: Record<string, Row[]>) {
    for (const [t, rows] of Object.entries(seed)) {
      this.tables[t] = rows.map((r) => ({ ...r }));
    }
  }
  rows(table: string): Row[] {
    this.tables[table] ??= [];
    return this.tables[table];
  }
  insert(table: string, row: Row): { data: Row | null; error: any } {
    const rows = this.rows(table);
    if (table === "orbit_flow_runs" && row.id && rows.some((r) => r.id === row.id)) {
      return { data: null, error: { code: "23505", message: "duplicate pkey" } };
    }
    if (table === "orbit_flow_scheduled_actions") {
      const status = String(row.status ?? "").toLowerCase();
      if (
        ACTIVE.has(status) &&
        rows.some((r) =>
          r.run_id === row.run_id && Number(r.ordem) === Number(row.ordem) &&
          ACTIVE.has(String(r.status ?? "").toLowerCase())
        )
      ) {
        return { data: null, error: { code: "23505", message: "run_id+ordem" } };
      }
      if (
        row.cadence_key && ACTIVE_CADENCE.has(status) &&
        rows.some((r) =>
          r.cadence_key === row.cadence_key &&
          ACTIVE_CADENCE.has(String(r.status ?? "").toLowerCase())
        )
      ) {
        return { data: null, error: { code: "23505", message: "cadence_key" } };
      }
    }
    const created = { id: row.id ?? crypto.randomUUID(), ...row };
    rows.push(created);
    return { data: created, error: null };
  }
}

function client(db: FakeDb) {
  return {
    from(table: string) {
      let rows = () => db.rows(table).map((r) => ({ ...r }));
      const filters: Array<(r: Row) => boolean> = [];
      let limit = Infinity;
      let orderKey: string | null = null;
      let orderAsc = true;
      let insertRow: Row | null = null;

      const run = () => {
        if (insertRow) return db.insert(table, insertRow);
        let out = rows().filter((r) => filters.every((f) => f(r)));
        if (orderKey) {
          out = out.sort((a, b) => {
            const av = String(a[orderKey!] ?? "");
            const bv = String(b[orderKey!] ?? "");
            return orderAsc ? av.localeCompare(bv) : bv.localeCompare(av);
          });
        }
        return { data: out.slice(0, limit), error: null };
      };

      const api: any = {
        select: () => api,
        eq: (c: string, v: any) => {
          filters.push((r) => String(r[c] ?? "") === String(v));
          return api;
        },
        in: (c: string, vals: any[]) => {
          const set = new Set(vals.map(String));
          filters.push((r) => set.has(String(r[c] ?? "")));
          return api;
        },
        gt: (c: string, v: any) => {
          filters.push((r) => String(r[c] ?? "") > String(v));
          return api;
        },
        gte: (c: string, v: any) => {
          filters.push((r) => String(r[c] ?? "") >= String(v));
          return api;
        },
        not: (c: string, _op: string, _v: any) => {
          filters.push((r) => r[c] != null);
          return api;
        },
        order: (c: string, o?: { ascending?: boolean }) => {
          orderKey = c;
          orderAsc = o?.ascending !== false;
          return api;
        },
        limit: (n: number) => {
          limit = n;
          return api;
        },
        insert: (row: Row) => {
          insertRow = row;
          return api;
        },
        maybeSingle: () => {
          const res = run();
          if (insertRow) return Promise.resolve(res);
          const data = (res.data as Row[])[0] ?? null;
          return Promise.resolve({ data, error: res.error });
        },
        then: (resolve: any, reject?: any) => {
          try {
            return resolve(run());
          } catch (e) {
            return reject ? reject(e) : Promise.reject(e);
          }
        },
      };
      return api;
    },
  };
}

function scheduledSuccessNoDelivery(actionId: string, ordem: number, over: Row = {}): Row {
  return {
    id: crypto.randomUUID(),
    empresa_id: EMPRESA,
    prospect_id: PROSPECT,
    run_id: OLD_RUN,
    flow_id: FLOW,
    action_id: actionId,
    ordem,
    status: "success", // histórico: success SEM outbox/provider → não é envio
    last_error: null,
    canceled_reason: null,
    cadence_key: followupCadenceKey({
      empresa_id: EMPRESA,
      prospect_id: PROSPECT,
      flow_id: FLOW,
      action_id: actionId,
    }),
    ...over,
  };
}

function flowAction(id: string, days: number, over: Row = {}): Row {
  return {
    id,
    flow_id: FLOW,
    ordem: days,
    action_type: "send_whatsapp_template",
    delay_seconds: days * DAY,
    action_config: {
      enabled: true,
      viver_controlled_followup: true,
      cancel_on_reply: true,
      template_id: `tpl-${days}`,
      ...(over.action_config ?? {}),
    },
  };
}

function seed(opts: {
  scheduled?: Row[];
  followupOutbox?: Row[];
  quotaPolicy?: string | null;
} = {}) {
  const filtros: Row = {
    batch_label: "viver_fernanda_audio_ramp_5_8_10_2026-09-09",
    controlled_reengagement: { source_form: "typebot", requires_day_close_review: true },
  };
  if (opts.quotaPolicy !== null) {
    filtros.quota_policy = opts.quotaPolicy ?? VIVER_FOLLOWUP_CYCLE_QUOTA_POLICY;
  }
  return new FakeDb({
    orbit_whatsapp_outbox: [
      {
        id: OUTBOX,
        empresa_id: EMPRESA,
        prospect_id: PROSPECT,
        conversa_id: CONVERSA,
        campaign_id: CAMPAIGN,
        source_type: "campaign",
        status: "sent",
        provider_message_id: PROVIDER,
        sent_at: SENT_AT,
        metadata: { viver_controlled_reengagement: true },
      },
      ...(opts.followupOutbox ?? []),
    ],
    orbit_mensagens: [
      {
        id: "msg-out",
        empresa_id: EMPRESA,
        conversa_id: CONVERSA,
        campaign_id: CAMPAIGN,
        direcao: "OUT",
        status: "enviada",
        provider_message_id: PROVIDER,
        timestamp: SENT_AT,
        sender_type: "ai",
      },
    ],
    orbit_campaigns: [
      { id: CAMPAIGN, empresa_id: EMPRESA, aprovacao_status: "aprovada", filtros_json: filtros },
    ],
    orbit_prospects: [
      {
        id: PROSPECT,
        empresa_id: EMPRESA,
        deleted_at: null,
        optout_whatsapp: false,
        whatsapp_status: "valido",
      },
    ],
    orbit_conversas: [
      { id: CONVERSA, empresa_id: EMPRESA, prospect_id: PROSPECT, human_talk: false },
    ],
    orbit_flow_runs: [
      {
        id: OLD_RUN,
        empresa_id: EMPRESA,
        flow_id: FLOW,
        event_id: EVENT,
        entity_type: "prospect",
        entity_id: PROSPECT,
        created_at: "2026-08-01T10:00:00.000Z",
      },
    ],
    orbit_flow_events: [
      {
        id: EVENT,
        empresa_id: EMPRESA,
        event_type: "lead_recebido",
        entity_type: "prospect",
        entity_id: PROSPECT,
        created_at: "2026-08-01T10:00:00.000Z",
      },
    ],
    orbit_flows: [
      { id: FLOW, empresa_id: EMPRESA, ativo: true, trigger_type: "lead_recebido", condicoes: {} },
    ],
    orbit_flow_actions: [flowAction(D1, 1), flowAction(D3, 3), flowAction(D7, 7)],
    orbit_meetings: [],
    orbit_deals: [],
    orbit_flow_scheduled_actions: opts.scheduled ?? [],
    orbit_audit_log: [],
  });
}

const call = (db: FakeDb) =>
  reconstituteViverControlledFollowups(client(db) as any, {
    empresa_id: EMPRESA,
    outbox_id: OUTBOX,
  });

const pending = (db: FakeDb) =>
  db.rows("orbit_flow_scheduled_actions").filter((r) => r.status === "pending");

// ───────────────────────── casos ─────────────────────────

Deno.test("novo ciclo: success histórico SEM envio não bloqueia — planeja D1/D3/D7", async () => {
  const db = seed({
    scheduled: [
      scheduledSuccessNoDelivery(D1, 1),
      scheduledSuccessNoDelivery(D3, 3),
      scheduledSuccessNoDelivery(D7, 7),
    ],
  });
  const r = await call(db);
  assertEquals(r.ok, true);
  assertEquals(r.planned, 3);
  assertEquals(r.scheduled_ids.length, 3);

  const novos = pending(db);
  assertEquals(novos.length, 3);
  // Âncora NOVA: nenhum agendamento novo reaproveita o run antigo.
  assert(novos.every((r2) => r2.run_id !== OLD_RUN));
  assertEquals(new Set(novos.map((r2) => r2.run_id)).size, 1);
  // Histórico preservado intacto.
  assertEquals(
    db.rows("orbit_flow_scheduled_actions").filter((r2) => r2.status === "success").length,
    3,
  );
  // Delays ancorados no sent_at REAL da campanha.
  assertEquals(
    novos.map((r2) => r2.scheduled_for).sort(),
    [
      "2026-09-12T13:04:00.000Z",
      "2026-09-14T13:04:00.000Z",
      "2026-09-18T13:04:00.000Z",
    ],
  );
  // Contexto usa o evento âncora REAL.
  assert(novos.every((r2) => r2.context?.event_id === EVENT));
  assert(novos.every((r2) => r2.context?.payload?.event_id === EVENT));
});

Deno.test("novo ciclo: segunda execução não cria nada (idempotente)", async () => {
  const db = seed({ scheduled: [scheduledSuccessNoDelivery(D1, 1)] });
  const first = await call(db);
  assertEquals(first.scheduled_ids.length, 3);
  const second = await call(db);
  assertEquals(second.scheduled_ids.length, 0);
  assertEquals(pending(db).length, 3);
});

Deno.test("novo ciclo: dois ticks concorrentes criam UMA única âncora", async () => {
  const db = seed({ scheduled: [scheduledSuccessNoDelivery(D1, 1)] });
  const [a, b] = await Promise.all([call(db), call(db)]);
  const anchors = db.rows("orbit_flow_runs").filter((r) => r.id !== OLD_RUN);
  assertEquals(anchors.length, 1);
  assertEquals(pending(db).length, 3);
  assertEquals(a.scheduled_ids.length + b.scheduled_ids.length, 3);
});

Deno.test("novo ciclo: os 3 cancelamentos históricos operacionais não bloqueiam", async () => {
  for (const reason of VIVER_HISTORICAL_OPERATIONAL_CANCEL_REASONS) {
    const db = seed({
      scheduled: [
        scheduledSuccessNoDelivery(D1, 1, { status: "canceled", canceled_reason: reason }),
        scheduledSuccessNoDelivery(D3, 3, { status: "canceled", canceled_reason: reason }),
        scheduledSuccessNoDelivery(D7, 7, { status: "canceled", canceled_reason: reason }),
      ],
    });
    const r = await call(db);
    assertEquals(r.planned, 3, reason);
    // As rows antigas permanecem canceladas (nada foi reativado).
    assertEquals(
      db.rows("orbit_flow_scheduled_actions").filter((x) => x.status === "canceled").length,
      3,
    );
  }
});

Deno.test("novo ciclo: cancelamento legítimo (manual/opt-out) continua bloqueando", async () => {
  for (const reason of ["manual_operator_stop", "lead_optout", "human_handoff", "lead_replied"]) {
    const db = seed({
      scheduled: [
        scheduledSuccessNoDelivery(D1, 1, { status: "canceled", canceled_reason: reason }),
      ],
    });
    const r = await call(db);
    assertEquals(r.planned, 2, reason); // D3 e D7 seguem; D1 não é reativado
    assert(r.skipped.some((s) => s.action_id === D1 && s.reason === "cancelled_not_reactivated"));
  }
});

Deno.test("novo ciclo: toque REAL aceito nunca repete", async () => {
  const db = seed({
    scheduled: [scheduledSuccessNoDelivery(D1, 1)],
    followupOutbox: [{
      id: "fu-1",
      empresa_id: EMPRESA,
      prospect_id: PROSPECT,
      source_type: "flow_followup",
      source_id: D1,
      status: "sent",
      provider_message_id: "ZAPI-FU-1",
      payload: { template_id: "tpl-1" },
    }],
  });
  const r = await call(db);
  assertEquals(r.planned, 2);
  assert(r.skipped.some((s) => s.action_id === D1));
});

Deno.test("novo ciclo: outbox antiga com resultado INCERTO não repete o toque", async () => {
  const db = seed({
    scheduled: [scheduledSuccessNoDelivery(D3, 3)],
    followupOutbox: [{
      id: "fu-2",
      empresa_id: EMPRESA,
      prospect_id: PROSPECT,
      source_type: "flow_followup",
      source_id: D3,
      status: "processing",
      provider_message_id: null,
      payload: { template_id: "tpl-3" },
    }],
  });
  const r = await call(db);
  assertEquals(r.planned, 2);
  assert(r.skipped.some((s) => s.action_id === D3 && s.reason === "touch_outcome_uncertain"));
});

Deno.test("novo ciclo: D1 já ativo + D3/D7 faltando → completa o que falta", async () => {
  const db = seed({
    scheduled: [
      scheduledSuccessNoDelivery(D1, 1, { status: "pending", run_id: "run-novo-anterior" }),
      scheduledSuccessNoDelivery(D3, 3),
    ],
  });
  const r = await call(db);
  assertEquals(r.planned, 2);
  assertEquals(new Set(pending(db).map((x) => x.action_id)), new Set([D1, D3, D7]));
  assert(r.skipped.some((s) => s.action_id === D1 && s.reason === "already_scheduled"));
});

Deno.test("campanha fora da programação preserva a regra antiga (success bloqueia)", async () => {
  const db = seed({
    quotaPolicy: null,
    scheduled: [
      scheduledSuccessNoDelivery(D1, 1),
      scheduledSuccessNoDelivery(D3, 3),
      scheduledSuccessNoDelivery(D7, 7),
    ],
  });
  const r = await call(db);
  assertEquals(r.ok, false);
  assertEquals(r.reason, "nothing_to_schedule");
  assertEquals(pending(db).length, 0);
});

Deno.test("reconciliação prioriza erro e cadência ausente, sem prefixo fixo", () => {
  const cands = Array.from({ length: 20 }, (_, i) => ({
    id: `ob-${i}`,
    prospect_id: `p-${i}`,
    sent_at: `2026-09-1${i % 10}T10:00:00.000Z`,
  }));
  const scheduled = [
    // p-0..p-14 têm cadência ativa; p-15 está em erro; p-16..p-19 sem nada.
    ...Array.from({ length: 15 }, (_, i) => ({ prospect_id: `p-${i}`, status: "pending" })),
    { prospect_id: "p-15", status: "error" },
  ];
  const ranked = rankViverReconcileCandidates(cands, scheduled, 0);
  assertEquals(ranked[0].prospect_id, "p-15");
  assertEquals(
    new Set(ranked.slice(1, 5).map((c) => c.prospect_id)),
    new Set(["p-16", "p-17", "p-18", "p-19"]),
  );
  // Rotação: minutos diferentes não servem sempre os mesmos ativos.
  const a = rankViverReconcileCandidates(cands, scheduled, 0).slice(5, 10);
  const b = rankViverReconcileCandidates(cands, scheduled, 3 * 60_000).slice(5, 10);
  assert(a.map((c) => c.prospect_id).join() !== b.map((c) => c.prospect_id).join());
});
