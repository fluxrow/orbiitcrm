import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  computeViverFollowupDeliveryAnchor,
  VIVER_FOLLOWUP_DELIVERY_ANCHOR_EMPRESA_ID,
} from "./viver-followup-delivery-anchor.ts";

Deno.test("Viver ancora D+1 no envio aceito pelo provedor", () => {
  assertEquals(computeViverFollowupDeliveryAnchor({
    empresaId: VIVER_FOLLOWUP_DELIVERY_ANCHOR_EMPRESA_ID,
    sourceType: "flow_initial",
    controlledFollowup: true,
    providerSentAt: "2026-09-21T13:28:02.841Z",
    delaySeconds: 86_400,
    currentScheduledFor: "2026-09-21T15:10:23.089Z",
  }), "2026-09-22T13:28:02.841Z");
});

Deno.test("âncora nunca antecipa cadência já mais distante", () => {
  assertEquals(computeViverFollowupDeliveryAnchor({
    empresaId: VIVER_FOLLOWUP_DELIVERY_ANCHOR_EMPRESA_ID,
    sourceType: "flow_initial",
    controlledFollowup: true,
    providerSentAt: "2026-09-21T13:28:02.841Z",
    delaySeconds: 86_400,
    currentScheduledFor: "2026-09-23T15:10:23.089Z",
  }), null);
});

Deno.test("âncora é restrita à Viver, flow_initial e follow-up controlado", () => {
  const base = {
    empresaId: VIVER_FOLLOWUP_DELIVERY_ANCHOR_EMPRESA_ID,
    sourceType: "flow_initial",
    controlledFollowup: true,
    providerSentAt: "2026-09-21T13:28:02.841Z",
    delaySeconds: 86_400,
    currentScheduledFor: "2026-09-21T15:10:23.089Z",
  };
  assertEquals(computeViverFollowupDeliveryAnchor({
    ...base,
    empresaId: "other",
  }), null);
  assertEquals(computeViverFollowupDeliveryAnchor({
    ...base,
    sourceType: "campaign",
  }), null);
  assertEquals(computeViverFollowupDeliveryAnchor({
    ...base,
    controlledFollowup: false,
  }), null);
});

Deno.test("datas e atrasos inválidos falham fechado", () => {
  assertEquals(computeViverFollowupDeliveryAnchor({
    empresaId: VIVER_FOLLOWUP_DELIVERY_ANCHOR_EMPRESA_ID,
    sourceType: "flow_initial",
    controlledFollowup: true,
    providerSentAt: "invalid",
    delaySeconds: 86_400,
    currentScheduledFor: "2026-09-21T15:10:23.089Z",
  }), null);
});
