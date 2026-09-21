import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  PILOT_FOLLOWUP_CANCELED_AFTER_HUMAN_OUTBOUND,
  PILOT_FOLLOWUP_CANCELED_ON_REPLY,
  PILOT_FOLLOWUP_INITIAL_DELIVERY_REQUIRED,
  PILOT_FOLLOWUP_STALE_BACKLOG,
  pilotInboundBlockReason,
  VIVER_SEMIJOIAS_EMPRESA_ID,
} from "./outbox-pilot.ts";

type Row = Record<string, any>;

class Query {
  #rows: Row[];
  constructor(rows: Row[]) {
    this.#rows = [...rows];
  }
  select(_columns: string) {
    return this;
  }
  eq(column: string, value: unknown) {
    this.#rows = this.#rows.filter((row) =>
      String(row[column] ?? "") === String(value ?? "")
    );
    return this;
  }
  in(column: string, values: unknown[]) {
    const accepted = new Set(values.map((value) => String(value)));
    this.#rows = this.#rows.filter((row) => accepted.has(String(row[column])));
    return this;
  }
  not(column: string, operator: string, value: unknown) {
    if (operator === "is" && value === null) {
      this.#rows = this.#rows.filter((row) => row[column] != null);
    }
    return this;
  }
  neq(column: string, value: unknown) {
    this.#rows = this.#rows.filter((row) =>
      String(row[column] ?? "") !== String(value ?? "")
    );
    return this;
  }
  gt(column: string, value: unknown) {
    const cutoff = Date.parse(String(value ?? ""));
    this.#rows = this.#rows.filter((row) =>
      Date.parse(String(row[column] ?? "")) > cutoff
    );
    return this;
  }
  order(column: string, options: { ascending?: boolean } = {}) {
    const direction = options.ascending === false ? -1 : 1;
    this.#rows.sort((a, b) =>
      String(a[column] ?? "").localeCompare(String(b[column] ?? "")) * direction
    );
    return this;
  }
  limit(value: number) {
    this.#rows = this.#rows.slice(0, value);
    return this;
  }
  async maybeSingle() {
    return { data: this.#rows[0] ?? null, error: null };
  }
  then(resolve: (value: { data: Row[]; error: null }) => unknown) {
    return Promise.resolve({ data: this.#rows, error: null }).then(resolve);
  }
}

function fixture(overrides: Partial<Record<string, Row[]>> = {}) {
  const rows: Record<string, Row[]> = {
    orbit_flow_scheduled_actions: [{
      id: "scheduled-1",
      empresa_id: VIVER_SEMIJOIAS_EMPRESA_ID,
      run_id: "run-1",
      flow_id: "flow-1",
      action_id: "action-1",
      prospect_id: "prospect-1",
      scheduled_for: "2026-09-21T14:30:00Z",
      action_config: {
        enabled: true,
        cancel_on_reply: true,
        viver_controlled_followup: true,
      },
    }],
    orbit_flow_runs: [{
      id: "run-1",
      empresa_id: VIVER_SEMIJOIAS_EMPRESA_ID,
      flow_id: "flow-1",
      event_id: "event-1",
      entity_id: "prospect-1",
    }],
    orbit_whatsapp_outbox: [{
      id: "initial-1",
      empresa_id: VIVER_SEMIJOIAS_EMPRESA_ID,
      flow_run_id: "run-1",
      prospect_id: "prospect-1",
      conversa_id: "conversation-1",
      source_type: "flow_initial",
      status: "sent",
      sent_at: "2026-09-21T13:30:00Z",
      provider_message_id: "provider-1",
    }],
    orbit_conversas: [{
      id: "conversation-1",
      empresa_id: VIVER_SEMIJOIAS_EMPRESA_ID,
      prospect_id: "prospect-1",
      human_talk: false,
      handoff_sent_at: null,
    }],
    orbit_mensagens: [],
    ...overrides,
  };
  return {
    from(table: string) {
      return new Query(rows[table] ?? []);
    },
  };
}

const item = {
  id: "followup-outbox-1",
  empresa_id: VIVER_SEMIJOIAS_EMPRESA_ID,
  source_type: "flow_followup",
  scheduled_action_id: "scheduled-1",
  flow_run_id: "run-1",
  prospect_id: "prospect-1",
  conversa_id: "conversation-1",
  created_at: "2026-09-21T14:30:00Z",
  metadata: {
    viver_controlled_followup: true,
    pilot_not_before: "2026-09-21T13:30:00Z",
  },
};

const now = new Date("2026-09-21T14:31:00Z");

Deno.test("Viver follow-up permits only a provider-accepted initial delivery without later contact", async () => {
  assertEquals(await pilotInboundBlockReason(fixture(), item, now), null);
});

Deno.test("Viver follow-up blocks when the initial delivery is not proven", async () => {
  const db = fixture({ orbit_whatsapp_outbox: [] });
  assertEquals(
    await pilotInboundBlockReason(db, item, now),
    PILOT_FOLLOWUP_INITIAL_DELIVERY_REQUIRED,
  );
});

Deno.test("Viver follow-up never compensates a stale scheduled backlog", async () => {
  const db = fixture({
    orbit_flow_scheduled_actions: [{
      id: "scheduled-1",
      empresa_id: VIVER_SEMIJOIAS_EMPRESA_ID,
      run_id: "run-1",
      flow_id: "flow-1",
      action_id: "action-1",
      prospect_id: "prospect-1",
      scheduled_for: "2026-09-21T13:30:00Z",
      action_config: {
        enabled: true,
        cancel_on_reply: true,
        viver_controlled_followup: true,
      },
    }],
  });
  assertEquals(
    await pilotInboundBlockReason(db, item, now),
    PILOT_FOLLOWUP_STALE_BACKLOG,
  );
});

Deno.test("Viver follow-up cancels after a lead reply", async () => {
  const db = fixture({
    orbit_mensagens: [{
      id: "reply-1",
      empresa_id: VIVER_SEMIJOIAS_EMPRESA_ID,
      conversa_id: "conversation-1",
      direcao: "IN",
      timestamp: "2026-09-21T13:40:00Z",
      sent_by_user_id: null,
      sender_type: "contact",
    }],
  });
  assertEquals(
    await pilotInboundBlockReason(db, item, now),
    PILOT_FOLLOWUP_CANCELED_ON_REPLY,
  );
});

Deno.test("Viver follow-up cancels after Fernanda sends from the conversation", async () => {
  const db = fixture({
    orbit_mensagens: [{
      id: "human-1",
      empresa_id: VIVER_SEMIJOIAS_EMPRESA_ID,
      conversa_id: "conversation-1",
      direcao: "OUT",
      timestamp: "2026-09-21T13:45:00Z",
      sent_by_user_id: "fernanda-user",
      sender_type: "human",
    }],
  });
  assertEquals(
    await pilotInboundBlockReason(db, item, now),
    PILOT_FOLLOWUP_CANCELED_AFTER_HUMAN_OUTBOUND,
  );
});
