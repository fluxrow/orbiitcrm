// Testes do guard genérico action_config.enabled=false.
// Cobre: (a) ação desabilitada é pulada sem side-effects,
// (b) irmã habilitada (mesmo flow) executa normalmente,
// (c) enabled ausente/true preserva comportamento antigo.

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isActionDisabled } from "./action-guards.ts";

Deno.test("isActionDisabled: enabled=false retorna true", () => {
  assertEquals(isActionDisabled({ enabled: false }), true);
  assertEquals(isActionDisabled({ enabled: false, foo: "bar" }), true);
});

Deno.test("isActionDisabled: ausente/true/truthy retorna false", () => {
  assertEquals(isActionDisabled({}), false);
  assertEquals(isActionDisabled({ enabled: true }), false);
  assertEquals(isActionDisabled({ enabled: 1 }), false);
  assertEquals(isActionDisabled({ enabled: "false" }), false); // strict === false apenas
  assertEquals(isActionDisabled(null), false);
  assertEquals(isActionDisabled(undefined), false);
});

// Simulação minimal do loop: replica a decisão do executor.
// Não toca Supabase nem enfileira outbox — o teste garante que a decisão
// pula runAction/enqueue e emite o output auditável esperado.
type FakeAction = {
  id: string;
  action_type: string;
  action_config: any;
  delay_seconds?: number;
};

async function simulateLoop(actions: FakeAction[]) {
  const runActionCalls: string[] = [];
  const enqueueCalls: string[] = [];
  const outboxCalls: string[] = [];
  const messages: string[] = [];
  const steps: Array<{ action_id: string; status: string; output: any }> = [];

  const INLINE_DELAY_MAX_SECONDS = 30;

  for (const action of actions) {
    const delay = Number(action.delay_seconds ?? 0);
    // Kill-switch: espelha o comportamento real do executor.
    if (isActionDisabled(action.action_config ?? {})) {
      steps.push({
        action_id: action.id,
        status: "success",
        output: { skipped: true, reason: "action_disabled", action_type: action.action_type },
      });
      continue;
    }
    if (delay > INLINE_DELAY_MAX_SECONDS) {
      enqueueCalls.push(action.id);
      steps.push({ action_id: action.id, status: "success", output: { scheduled: true } });
      continue;
    }
    runActionCalls.push(action.id);
    if (action.action_type === "send_whatsapp_template") {
      outboxCalls.push(action.id);
      messages.push(action.id);
    }
    steps.push({ action_id: action.id, status: "success", output: { executed: true } });
  }
  return { runActionCalls, enqueueCalls, outboxCalls, messages, steps };
}

Deno.test("Fábrica: send_whatsapp_template disabled → skipped; create_task irmã executa", async () => {
  // Reproduz o flow b0c43774: ação imediata a0a98318 (template) desabilitada
  // + create_task (ordem 1) preservada.
  const actions: FakeAction[] = [
    {
      id: "a0a98318-0b7f-41bc-8755-09dde228d2ba",
      action_type: "send_whatsapp_template",
      action_config: { enabled: false, template_id: "781dc7c1", dry_run: true },
      delay_seconds: 0,
    },
    {
      id: "task-sibling",
      action_type: "create_task",
      action_config: { titulo: "Monitorar reunião" },
      delay_seconds: 0,
    },
  ];
  const r = await simulateLoop(actions);
  // A ação de template desabilitada não deve produzir nenhum side-effect real:
  assertEquals(r.runActionCalls.includes("a0a98318-0b7f-41bc-8755-09dde228d2ba"), false);
  assertEquals(r.enqueueCalls.length, 0);
  assertEquals(r.outboxCalls.length, 0);
  assertEquals(r.messages.length, 0);
  // A create_task irmã deve executar normalmente:
  assertEquals(r.runActionCalls, ["task-sibling"]);
  // Step do template desabilitado é success + skipped + reason auditável:
  const templateStep = r.steps.find((s) => s.action_id.startsWith("a0a98318"))!;
  assertEquals(templateStep.status, "success");
  assertEquals(templateStep.output, {
    skipped: true,
    reason: "action_disabled",
    action_type: "send_whatsapp_template",
  });
});

Deno.test("Delay > 30s + enabled=false: NÃO enfileira scheduled action", async () => {
  const actions: FakeAction[] = [
    {
      id: "delayed-disabled",
      action_type: "send_whatsapp_template",
      action_config: { enabled: false, template_id: "x" },
      delay_seconds: 3600, // seria enfileirada normalmente
    },
  ];
  const r = await simulateLoop(actions);
  assertEquals(r.enqueueCalls.length, 0);
  assertEquals(r.runActionCalls.length, 0);
  assertEquals(r.steps[0].output.reason, "action_disabled");
});

Deno.test("enabled ausente/true preserva comportamento antigo (executa)", async () => {
  const actions: FakeAction[] = [
    { id: "a1", action_type: "create_task", action_config: {}, delay_seconds: 0 },
    { id: "a2", action_type: "notify_vendedor", action_config: { enabled: true }, delay_seconds: 0 },
  ];
  const r = await simulateLoop(actions);
  assertEquals(r.runActionCalls, ["a1", "a2"]);
  assertEquals(r.steps.every((s) => s.status === "success"), true);
});
