import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  evaluateIncidentRecovery,
  type IncidentRecoveryInput,
} from "./ai-incident-recovery.ts";

function eligible(overrides: Partial<IncidentRecoveryInput> = {}): IncidentRecoveryInput {
  const now = new Date("2026-08-28T17:00:00.000Z"); // 14h em São Paulo
  return {
    incidentType: "execution_failed",
    incidentStatus: "open",
    inboundAt: new Date(now.getTime() - 8 * 60 * 1000).toISOString(),
    now,
    automaticMode: true,
    sendingEnabled: true,
    outboxAdapterEnabled: true,
    zapiActive: true,
    zapiOffline: false,
    realSendEnabled: true,
    canaryModeEnabled: false,
    canaryPhoneNumbers: [],
    phone: "5511999999999",
    responderForaHorario: false,
    horarioInicio: "08:00:00",
    horarioFim: "18:00:00",
    humanTalk: false,
    humanUserId: null,
    archivedAt: null,
    quarantineReason: null,
    conversationStatus: "aberta",
    prospectDeletedAt: null,
    prospectOptoutWhatsapp: false,
    latestInboundMessageId: "in-1",
    incidentInboundMessageId: "in-1",
    hasRealOutboundAfterInbound: false,
    hasActiveOutboxAfterInbound: false,
    claimStatus: "error",
    claimAttempts: 1,
    claimFinishedAt: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

Deno.test("recupera somente incidente recente, atual e ainda sem resposta", () => {
  assertEquals(evaluateIncidentRecovery(eligible()), { eligible: true, reason: "eligible" });
});

Deno.test("não recupera mensagem antiga, substituída ou já respondida", () => {
  const now = eligible().now;
  assertEquals(evaluateIncidentRecovery(eligible({ inboundAt: new Date(now.getTime() - 21 * 60 * 1000).toISOString() })).reason, "stale");
  assertEquals(evaluateIncidentRecovery(eligible({ latestInboundMessageId: "in-2" })).reason, "superseded_inbound");
  assertEquals(evaluateIncidentRecovery(eligible({ hasRealOutboundAfterInbound: true })).reason, "already_answered");
  assertEquals(evaluateIncidentRecovery(eligible({ hasActiveOutboxAfterInbound: true })).reason, "delivery_already_queued");
});

Deno.test("nunca recupera handoff humano, tenant pausado, opt-out ou fora do horário", () => {
  assertEquals(evaluateIncidentRecovery(eligible({ humanTalk: true })).reason, "human_takeover");
  assertEquals(evaluateIncidentRecovery(eligible({ automaticMode: false })).reason, "automatic_mode_disabled");
  assertEquals(evaluateIncidentRecovery(eligible({ sendingEnabled: false })).reason, "queue_disabled");
  assertEquals(evaluateIncidentRecovery(eligible({ prospectOptoutWhatsapp: true })).reason, "prospect_ineligible");
  assertEquals(evaluateIncidentRecovery(eligible({ horarioInicio: "15:00:00" })).reason, "outside_service_window");
});

Deno.test("respeita envio real, canário, cooldown e máximo de tentativas", () => {
  assertEquals(evaluateIncidentRecovery(eligible({ realSendEnabled: false })).reason, "real_send_disabled");
  assertEquals(evaluateIncidentRecovery(eligible({
    realSendEnabled: false,
    canaryModeEnabled: true,
    canaryPhoneNumbers: ["+55 11 99999-9999"],
  })).eligible, true);
  assertEquals(evaluateIncidentRecovery(eligible({
    claimFinishedAt: new Date(eligible().now.getTime() - 60 * 1000).toISOString(),
  })).reason, "cooldown");
  assertEquals(evaluateIncidentRecovery(eligible({ claimAttempts: 2 })).reason, "max_attempts");
});

Deno.test("delivery_failed nunca é reenviado automaticamente", () => {
  assertEquals(evaluateIncidentRecovery(eligible({ incidentType: "delivery_failed" })).reason, "incident_type_not_recoverable");
});
