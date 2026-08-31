import { assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

const worker = await Deno.readTextFile(
  new URL("../orbit-whatsapp-outbox-tick/index.ts", import.meta.url),
);

Deno.test("pilot block reconciles campaign and scheduled action before returning", () => {
  const gateStart = worker.indexOf("const pilotBlock = await pilotInboundBlockReason");
  const gateEnd = worker.indexOf("// Kill switch por tenant", gateStart);
  assert(gateStart >= 0 && gateEnd > gateStart);

  const gate = worker.slice(gateStart, gateEnd);
  assertStringIncludes(gate, "await reconcilePilotCancellation(item, pilotBlock)");
  assertStringIncludes(gate, 'status: "canceled"');
});

Deno.test("pilot reconciliation closes false-success lifecycle and audits sanitized ids", () => {
  const helperStart = worker.indexOf("async function reconcilePilotCancellation");
  const helperEnd = worker.indexOf("// Resolve ou cria conversa", helperStart);
  assert(helperStart >= 0 && helperEnd > helperStart);

  const helper = worker.slice(helperStart, helperEnd);
  assertStringIncludes(helper, "await updateCampaignRecipient");
  assertStringIncludes(helper, 'status: "ignorado"');
  assertStringIncludes(helper, 'from("orbit_flow_scheduled_actions")');
  assertStringIncludes(helper, 'acao: "viver_pilot_outbox_blocked"');
  assert(!helper.includes("payload:"));
  assert(!helper.includes("telefone"));
});
