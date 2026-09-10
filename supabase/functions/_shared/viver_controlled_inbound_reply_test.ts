// Exceção tenant-scoped: resposta da IA a inbound da rampa controlada (Viver Semijoias).
//
// Rodar: deno test --allow-net --allow-env supabase/functions/_shared/viver_controlled_inbound_reply_test.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  decideViverControlledInboundReply,
  VIVER_CONTROLLED_INBOUND_BATCH_LABELS,
  VIVER_CONTROLLED_INBOUND_EMPRESA_ID as VIVER,
} from "./viver-controlled-inbound-reply.ts";

const OTHER = "11111111-2222-3333-4444-555555555555";
const OUT_AT = "2026-09-09T18:30:00.000Z";
const IN_AT = "2026-09-09T18:45:00.000Z";

function facts(over: Record<string, unknown> = {}) {
  return {
    empresa_id: VIVER,
    cutoff_reason: "automation_cutoff",
    prospect: { id: "p1", empresa_id: VIVER, deleted_at: null, optout_whatsapp: false },
    conversa: {
      id: "c1", empresa_id: VIVER, human_user_id: null, handoff_sent_at: null,
      archived_at: null, quarantine_reason: null, status: "aberta",
    },
    inbound: { id: "in1", empresa_id: VIVER, conversa_id: "c1", direcao: "IN", timestamp: IN_AT },
    campaign_outbox: {
      empresa_id: VIVER, conversa_id: "c1", prospect_id: "p1", campaign_id: "camp1",
      source_type: "campaign", status: "sent", provider_message_id: "prov-1",
      sent_at: OUT_AT, metadata: { viver_controlled_reengagement: true },
    },
    campaign: {
      id: "camp1", empresa_id: VIVER, aprovacao_status: "aprovada",
      filtros_json: { batch_label: VIVER_CONTROLLED_INBOUND_BATCH_LABELS[0] },
    },
    later_out_count: 0,
    existing_ai_reply_count: 0,
    future_meeting_count: 0,
    external_human_message_count: 0,
    ...over,
  } as any;
}

Deno.test("Viver controlada aprovada permite (rampa 5/8/10)", () => {
  const d = decideViverControlledInboundReply(facts());
  assertEquals(d.allowed, true);
  assertEquals(d.reason, "viver_controlled_reengagement_reply");
  assertEquals(d.campaign_id, "camp1");
});

Deno.test("batch pontual D0 também é autorizado", () => {
  const d = decideViverControlledInboundReply(facts({
    campaign: {
      id: "camp1", empresa_id: VIVER, aprovacao_status: "aprovada",
      filtros_json: { batch_label: VIVER_CONTROLLED_INBOUND_BATCH_LABELS[1] },
    },
  }));
  assertEquals(d.allowed, true);
});

Deno.test("outro tenant bloqueia", () => {
  const d = decideViverControlledInboundReply(facts({ empresa_id: OTHER }));
  assertEquals(d.allowed, false);
  assertEquals(d.reason, "not_viver_tenant");
});

Deno.test("motivo de corte não temporal bloqueia", () => {
  for (const reason of ["human_talk", "prospect_deleted", "cross_tenant", null]) {
    const d = decideViverControlledInboundReply(facts({ cutoff_reason: reason }));
    assertEquals(d.allowed, false);
    assertEquals(d.reason, "cutoff_reason_not_temporal");
  }
});

Deno.test("campanha sem metadata controlada bloqueia", () => {
  const d = decideViverControlledInboundReply(facts({
    campaign_outbox: { ...facts().campaign_outbox, metadata: {} },
  }));
  assertEquals(d.allowed, false);
  assertEquals(d.reason, "out_without_controlled_marker");
});

Deno.test("batch não autorizado bloqueia", () => {
  const d = decideViverControlledInboundReply(facts({
    campaign: { ...facts().campaign, filtros_json: { batch_label: "outro_batch_2026" } },
  }));
  assertEquals(d.allowed, false);
  assertEquals(d.reason, "batch_not_authorized");
});

Deno.test("campanha não aprovada bloqueia", () => {
  const d = decideViverControlledInboundReply(facts({
    campaign: { ...facts().campaign, aprovacao_status: null },
  }));
  assertEquals(d.allowed, false);
  assertEquals(d.reason, "campaign_not_approved");
});

Deno.test("provider_message_id ausente ou status != sent bloqueia", () => {
  const a = decideViverControlledInboundReply(facts({
    campaign_outbox: { ...facts().campaign_outbox, provider_message_id: null },
  }));
  assertEquals(a.reason, "out_without_provider_message_id");
  const b = decideViverControlledInboundReply(facts({
    campaign_outbox: { ...facts().campaign_outbox, status: "queued" },
  }));
  assertEquals(b.reason, "out_not_sent");
  const c = decideViverControlledInboundReply(facts({ campaign_outbox: null }));
  assertEquals(c.reason, "controlled_campaign_out_missing");
});

Deno.test("origem não-campanha bloqueia", () => {
  const d = decideViverControlledInboundReply(facts({
    campaign_outbox: { ...facts().campaign_outbox, source_type: "flow_followup" },
  }));
  assertEquals(d.reason, "out_not_campaign");
});

Deno.test("inbound anterior à OUT de campanha bloqueia", () => {
  const d = decideViverControlledInboundReply(facts({
    inbound: { ...facts().inbound, timestamp: "2026-09-09T18:00:00.000Z" },
  }));
  assertEquals(d.reason, "inbound_before_campaign_out");
});

Deno.test("humano, handoff, opt-out, reunião e arquivamento bloqueiam", () => {
  const cases: Array<[Record<string, unknown>, string]> = [
    [{ conversa: { ...facts().conversa, human_user_id: "u1" } }, "human_owner"],
    [{ conversa: { ...facts().conversa, handoff_sent_at: OUT_AT } }, "human_handoff"],
    [{ conversa: { ...facts().conversa, archived_at: OUT_AT } }, "conversa_archived"],
    [{ conversa: { ...facts().conversa, quarantine_reason: "quarantine" } }, "conversa_quarantined"],
    [{ conversa: { ...facts().conversa, status: "fechada" } }, "conversa_closed"],
    [{ prospect: { ...facts().prospect, optout_whatsapp: true } }, "opt_out"],
    [{ prospect: { ...facts().prospect, deleted_at: OUT_AT } }, "prospect_deleted"],
    [{ prospect: { ...facts().prospect, empresa_id: OTHER } }, "cross_tenant"],
    [{ external_human_message_count: 1 }, "external_human_attendance"],
    [{ future_meeting_count: 1 }, "future_meeting"],
  ];
  for (const [over, reason] of cases) {
    const d = decideViverControlledInboundReply(facts(over));
    assertEquals(d.allowed, false);
    assertEquals(d.reason, reason);
  }
});

Deno.test("OUT já existente após o inbound bloqueia (sem segunda resposta)", () => {
  const d = decideViverControlledInboundReply(facts({ later_out_count: 1 }));
  assertEquals(d.allowed, false);
  assertEquals(d.reason, "reply_already_sent");
});

Deno.test("duplicidade: ai_reply já existente para o mesmo inbound bloqueia", () => {
  const d = decideViverControlledInboundReply(facts({ existing_ai_reply_count: 1 }));
  assertEquals(d.allowed, false);
  assertEquals(d.reason, "ai_reply_already_exists");
});

Deno.test("inbound inválido bloqueia (direção OUT ou outra conversa)", () => {
  const a = decideViverControlledInboundReply(facts({
    inbound: { ...facts().inbound, direcao: "OUT" },
  }));
  assertEquals(a.reason, "inbound_not_inbound");
  const b = decideViverControlledInboundReply(facts({
    inbound: { ...facts().inbound, conversa_id: "c9" },
  }));
  assertEquals(b.reason, "inbound_other_conversation");
});

// ── Integração com o gate de elegibilidade do outbox (ai_reply) ──
import { isViverControlledInboundReply } from "./viver-controlled-inbound-reply.ts";

Deno.test("ai_reply Viver com marcador tipado dispensa só o corte temporal", () => {
  assertEquals(isViverControlledInboundReply({
    empresa_id: VIVER, source_type: "ai_reply", controlled_reengagement: true,
  }), true);
  // metadata sozinha nunca abre exceção para ai_reply
  assertEquals(isViverControlledInboundReply({
    empresa_id: VIVER, source_type: "ai_reply",
    metadata: { viver_controlled_reengagement: true },
  }), false);
  // outro tenant permanece bloqueado
  assertEquals(isViverControlledInboundReply({
    empresa_id: OTHER, source_type: "ai_reply", controlled_reengagement: true,
  }), false);
});
