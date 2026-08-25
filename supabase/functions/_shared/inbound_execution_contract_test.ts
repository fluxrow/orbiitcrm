import { assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

const agent = await Deno.readTextFile(new URL("../orbit-ai-agent/index.ts", import.meta.url));
const webhook = await Deno.readTextFile(new URL("../orbit-webhook/index.ts", import.meta.url));
const recoveryTick = await Deno.readTextFile(new URL("../orbit-ai-reply-debounce-tick/index.ts", import.meta.url));
const retroReply = await Deno.readTextFile(new URL("../orbit-inbound-retro-reply/index.ts", import.meta.url));

Deno.test("agente usa mensagem inbound persistida e ignora correlation id como chave", () => {
  assertStringIncludes(agent, "_inbound_message_id: normativeInbound.id");
  assertStringIncludes(agent, '.eq("direcao", "IN")');
  if (/executionCorrelation|_event_id:\s*correlation|claim_orbit_ai_execution[\s\S]{0,300}correlation_id/.test(agent)) {
    throw new Error("correlation_id ainda influencia o claim normativo");
  }
});

Deno.test("webhook encaminha o ID persistido do inbound", () => {
  assertStringIncludes(webhook, "inbound_message_id: savedMessage.id");
});

Deno.test("finalização drena B e recuperação periódica preserva retry", () => {
  assertStringIncludes(agent, "finishResult.next_inbound_message_id");
  assertStringIncludes(agent, "inbound_message_id: finishResult.next_inbound_message_id");
  assertStringIncludes(recoveryTick, '"list_ready_orbit_ai_execution_events"');
  assertStringIncludes(recoveryTick, "inbound_message_id: event.inbound_message_id");
});

Deno.test("drenagem imediata não bloqueia a resposta de A", () => {
  assertStringIncludes(agent, "const drainPromise = fetch");
  assertStringIncludes(agent, "EdgeRuntime.waitUntil(drainPromise)");
  const drainBlock = agent.slice(agent.indexOf("const drainPromise = fetch"), agent.indexOf("const drainPromise = fetch") + 1_500);
  if (/await\s+fetch/.test(drainBlock)) throw new Error("drenagem não pode aguardar B sincronicamente");
});

Deno.test("retro-reply aponta explicitamente para o inbound histórico selecionado", () => {
  assertStringIncludes(retroReply, "inbound_message_id: cand.last_in_id");
});
