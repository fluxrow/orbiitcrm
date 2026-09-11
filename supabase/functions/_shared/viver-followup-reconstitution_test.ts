import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  decideViverFollowupReconstitution,
  followupCadenceKey,
  isApprovedControlledFollowupAction,
  VIVER_FOLLOWUP_EMPRESA_ID,
} from "./viver-followup-reconstitution.ts";

const EMPRESA = VIVER_FOLLOWUP_EMPRESA_ID;
const PROSPECT = "11111111-1111-4111-8111-111111111111";
const CONVERSA = "22222222-2222-4222-8222-222222222222";
const CAMPAIGN = "33333333-3333-4333-8333-333333333333";
const FLOW = "44444444-4444-4444-8444-444444444444";
const RUN = "55555555-5555-4555-8555-555555555555";
const EVENT = "66666666-6666-4666-8666-666666666666";
const PROVIDER = "ZAPI-PROVIDER-ID-1";
const SENT_AT = "2026-09-10T13:00:00.000Z";
const DAY = 86_400;

function action(id: string, delayDays: number, over: Record<string, any> = {}) {
  return {
    id,
    flow_id: FLOW,
    ordem: delayDays,
    action_type: "send_whatsapp_template",
    delay_seconds: delayDays * DAY,
    action_config: {
      enabled: true,
      viver_controlled_followup: true,
      cancel_on_reply: true,
      template_id: `tpl-${delayDays}`,
      ...over,
    },
  };
}

const D1 = "aaaaaaa1-0000-4000-8000-000000000001";
const D3 = "aaaaaaa1-0000-4000-8000-000000000003";
const D7 = "aaaaaaa1-0000-4000-8000-000000000007";

function facts(over: Record<string, any> = {}) {
  return {
    empresa_id: EMPRESA,
    outbox: {
      id: "outbox-1",
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
    out_message: {
      id: "msg-1",
      empresa_id: EMPRESA,
      conversa_id: CONVERSA,
      campaign_id: CAMPAIGN,
      direcao: "OUT",
      status: "enviada",
      provider_message_id: PROVIDER,
      timestamp: SENT_AT,
    },
    campaign: {
      id: CAMPAIGN,
      empresa_id: EMPRESA,
      aprovacao_status: "aprovada",
      filtros_json: {
        batch_label: "viver_fernanda_audio_ramp_5_8_10_2026-09-09",
        controlled_reengagement: { source_form: "typebot", requires_day_close_review: true },
      },
    },
    prospect: { id: PROSPECT, empresa_id: EMPRESA, deleted_at: null, optout_whatsapp: false },
    conversa: { id: CONVERSA, empresa_id: EMPRESA, prospect_id: PROSPECT, human_talk: false },
    run: {
      id: RUN,
      empresa_id: EMPRESA,
      flow_id: FLOW,
      event_id: EVENT,
      entity_type: "prospect",
      entity_id: PROSPECT,
    },
    event: {
      id: EVENT,
      empresa_id: EMPRESA,
      event_type: "lead_recebido",
      entity_type: "prospect",
      entity_id: PROSPECT,
    },
    actions: [action(D1, 1), action(D3, 3), action(D7, 7)],
    inbound_after_send_count: 0,
    future_meeting_count: 0,
    external_human_message_count: 0,
    terminal_deal: false,
    existing_cadence_keys: [],
    existing_action_ids: [],
    accepted_template_ids: [],
    ...over,
  };
}

Deno.test("individual: agenda D1/D3/D7 ancorados no sent_at real", () => {
  const d = decideViverFollowupReconstitution(facts());
  assertEquals(d.allowed, true);
  assertEquals(d.plan.length, 3);
  assertEquals(d.plan.map((p) => p.scheduled_for), [
    "2026-09-11T13:00:00.000Z",
    "2026-09-13T13:00:00.000Z",
    "2026-09-17T13:00:00.000Z",
  ]);
  assertEquals(d.anchor_sent_at, SENT_AT);
  assertEquals(d.flow_id, FLOW);
  assertEquals(d.run_id, RUN);
});

Deno.test("grupo: apenas o D1 habilitado é agendado, sem reativar os demais", () => {
  const d = decideViverFollowupReconstitution(facts({
    actions: [
      action(D1, 1),
      action(D3, 3, { enabled: false }),
      action(D7, 7, { enabled: false }),
    ],
  }));
  assertEquals(d.allowed, true);
  assertEquals(d.plan.length, 1);
  assertEquals(d.plan[0].action_id, D1);
  assertEquals(d.skipped.map((s) => s.reason), ["action_not_approved", "action_not_approved"]);
});

Deno.test("delays nunca usam a criação antiga do lead", () => {
  const d = decideViverFollowupReconstitution(facts({
    actions: [action(D1, 1)],
  }));
  const scheduledMs = Date.parse(d.plan[0].scheduled_for);
  assertEquals(scheduledMs - Date.parse(SENT_AT), DAY * 1000);
});

Deno.test("outbox pending/failed/sem provider não reconstitui", () => {
  for (const [over, reason] of [
    [{ status: "pending" }, "outbox_not_sent"],
    [{ status: "failed" }, "outbox_not_sent"],
    [{ provider_message_id: null }, "outbox_without_provider_message_id"],
    [{ metadata: {} }, "outbox_without_controlled_marker"],
    [{ source_type: "flow_initial" }, "outbox_not_campaign"],
  ] as [Record<string, any>, string][]) {
    const f = facts();
    const d = decideViverFollowupReconstitution({
      ...f,
      outbox: { ...f.outbox, ...over },
    });
    assertEquals(d.allowed, false);
    assertEquals(d.reason, reason);
    assertEquals(d.plan.length, 0);
  }
});

Deno.test("correlação divergente de OUT bloqueia", () => {
  const f = facts();
  assertEquals(
    decideViverFollowupReconstitution({
      ...f,
      out_message: { ...f.out_message, provider_message_id: "outro" },
    }).reason,
    "out_provider_message_id_mismatch",
  );
  assertEquals(
    decideViverFollowupReconstitution({
      ...f,
      out_message: { ...f.out_message, campaign_id: CAMPAIGN.replace("3", "9") },
    }).reason,
    "campaign_mismatch",
  );
  assertEquals(
    decideViverFollowupReconstitution({ ...f, out_message: null }).reason,
    "out_message_missing",
  );
  assertEquals(
    decideViverFollowupReconstitution({
      ...f,
      out_message: { ...f.out_message, status: "queued" },
    }).reason,
    "out_not_sent",
  );
});

Deno.test("tenant divergente nunca reconstitui", () => {
  assertEquals(
    decideViverFollowupReconstitution(facts({ empresa_id: "4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18" })).reason,
    "not_viver_tenant",
  );
  const f = facts();
  assertEquals(
    decideViverFollowupReconstitution({
      ...f,
      prospect: { ...f.prospect, empresa_id: "outro-tenant" },
    }).reason,
    "cross_tenant",
  );
});

Deno.test("campanha não aprovada ou fora dos dois batches allowlisted bloqueia", () => {
  const f = facts();
  assertEquals(
    decideViverFollowupReconstitution({
      ...f,
      campaign: { ...f.campaign, aprovacao_status: "pendente" },
    }).reason,
    "campaign_not_authorized",
  );
  assertEquals(
    decideViverFollowupReconstitution({
      ...f,
      campaign: {
        ...f.campaign,
        filtros_json: { ...f.campaign.filtros_json, batch_label: "outro_batch" },
      },
    }).reason,
    "campaign_not_authorized",
  );
});

Deno.test("run/event lead_recebido são obrigatórios e do mesmo prospect", () => {
  const f = facts();
  assertEquals(decideViverFollowupReconstitution({ ...f, run: null }).reason, "lead_recebido_run_missing");
  assertEquals(
    decideViverFollowupReconstitution({
      ...f,
      event: { ...f.event, event_type: "lead_replied" },
    }).reason,
    "event_not_lead_recebido",
  );
  assertEquals(
    decideViverFollowupReconstitution({
      ...f,
      run: { ...f.run, entity_id: "99999999-9999-4999-8999-999999999999" },
    }).reason,
    "run_other_prospect",
  );
});

Deno.test("dedupe: segunda execução não replaneja nada", () => {
  const first = decideViverFollowupReconstitution(facts());
  const second = decideViverFollowupReconstitution(facts({
    existing_cadence_keys: first.plan.map((p) => p.cadence_key),
  }));
  assertEquals(second.allowed, false);
  assertEquals(second.reason, "nothing_to_schedule");
  assertEquals(second.skipped.every((s) => s.reason === "already_scheduled"), true);
});

Deno.test("toque já enviado do mesmo template não repete", () => {
  const d = decideViverFollowupReconstitution(facts({ accepted_template_ids: ["tpl-1"] }));
  assertEquals(d.allowed, true);
  assertEquals(d.plan.map((p) => p.action_id), [D3, D7]);
  assertEquals(d.skipped[0], { action_id: D1, reason: "touch_already_sent" });
});

Deno.test("cancelamentos: resposta, humano, opt-out, deletado e deal terminal param a rotina", () => {
  const f = facts();
  const cases: [Record<string, any>, string][] = [
    [{ inbound_after_send_count: 1 }, "lead_replied"],
    [{ external_human_message_count: 1 }, "external_human_attendance"],
    [{ conversa: { ...f.conversa, human_talk: true } }, "human_owner"],
    [{ conversa: { ...f.conversa, handoff_sent_at: SENT_AT } }, "human_handoff"],
    [{ conversa: { ...f.conversa, status: "fechada" } }, "conversa_closed"],
    [{ prospect: { ...f.prospect, optout_whatsapp: true } }, "opt_out"],
    [{ prospect: { ...f.prospect, deleted_at: SENT_AT } }, "prospect_deleted"],
    [{ terminal_deal: true }, "terminal_deal"],
  ];
  for (const [over, reason] of cases) {
    const d = decideViverFollowupReconstitution(facts(over));
    assertEquals(d.allowed, false);
    assertEquals(d.reason, reason);
    assertEquals(d.plan.length, 0);
  }
});

Deno.test("reunião agendada para a rotina e preserva lembretes", () => {
  const d = decideViverFollowupReconstitution(facts({ future_meeting_count: 1 }));
  assertEquals(d.allowed, false);
  assertEquals(d.reason, "meeting_scheduled");
  assertEquals(d.plan.length, 0);
  // Nenhum cancelamento/reagendamento: lembretes já aceitos ficam intactos.
  assertEquals(d.preserve_meeting_reminders, true);
});

Deno.test("cadence_key idêntica à do executor", () => {
  assertEquals(
    followupCadenceKey({ empresa_id: EMPRESA, prospect_id: PROSPECT, flow_id: FLOW, action_id: D1 }),
    `cad:swt:${EMPRESA}:${PROSPECT}:${FLOW}:${D1}`,
  );
  assertEquals(
    followupCadenceKey({ empresa_id: EMPRESA, prospect_id: null, flow_id: FLOW, action_id: D1 }),
    null,
  );
});

Deno.test("apenas ações aprovadas da cadência controlada são elegíveis", () => {
  assertEquals(isApprovedControlledFollowupAction(action(D1, 1)), true);
  assertEquals(isApprovedControlledFollowupAction(action(D1, 1, { cancel_on_reply: false })), false);
  assertEquals(isApprovedControlledFollowupAction(action(D1, 1, { viver_controlled_followup: false })), false);
  assertEquals(
    isApprovedControlledFollowupAction({ ...action(D1, 1), action_type: "create_task" }),
    false,
  );
});

Deno.test("D1 legado (individual) já enviado não repete com o template de áudio novo", () => {
  const d = decideViverFollowupReconstitution(facts({
    accepted_template_ids: ["5a9ecae4-5212-4e46-a612-f394a48d7f7e"],
  }));
  assertEquals(d.allowed, true);
  assertEquals(d.plan.map((p) => p.action_id), [D3, D7]);
  assertEquals(d.skipped[0], { action_id: D1, reason: "legacy_d1_already_sent" });
});

Deno.test("D1 legado (grupo) já enviado bloqueia o único toque do flow de grupo", () => {
  const d = decideViverFollowupReconstitution(facts({
    actions: [action(D1, 1)],
    legacy_d1_touch_sent: true,
  }));
  assertEquals(d.allowed, false);
  assertEquals(d.reason, "nothing_to_schedule");
  assertEquals(d.skipped[0], { action_id: D1, reason: "legacy_d1_already_sent" });
});

Deno.test("ordem já ocupada no mesmo run (UNIQUE parcial) não é reinserida", () => {
  const pending = decideViverFollowupReconstitution(facts({
    existing_run_ordens: [{ ordem: 3, status: "pending" }],
  }));
  assertEquals(pending.plan.map((p) => p.action_id), [D1, D7]);
  assertEquals(
    pending.skipped.find((s) => s.action_id === D3)?.reason,
    "run_ordem_occupied_pending",
  );

  // `success` pode ser skip (missing_prior_real_outbound): motivo exato, evidência preservada.
  const success = decideViverFollowupReconstitution(facts({
    existing_run_ordens: [{ ordem: 1, status: "success" }],
  }));
  assertEquals(success.plan.map((p) => p.action_id), [D3, D7]);
  assertEquals(
    success.skipped.find((s) => s.action_id === D1)?.reason,
    "run_ordem_success_without_real_send",
  );
});

Deno.test("ordem cancelada/erro não bloqueia reagendamento", () => {
  for (const status of ["canceled", "error", "skipped"]) {
    const d = decideViverFollowupReconstitution(facts({
      existing_run_ordens: [{ ordem: 1, status }],
    }));
    assertEquals(d.plan.length, 3);
  }
});
