import { assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

const sql = await Deno.readTextFile(new URL("../../migrations/20260825120000_wave1_agent_safety.sql", import.meta.url));

Deno.test("claim IA é persistente, tenant-scoped e único por evento", () => {
  assertStringIncludes(sql, "unique (empresa_id, conversa_id, correlation_id)");
  assertStringIncludes(sql, "where id = _conversa_id and empresa_id = _empresa_id");
  assertStringIncludes(sql, "on conflict (empresa_id, conversa_id, correlation_id) do nothing");
});

Deno.test("duas execuções concorrentes só obtêm um claim efetivo", () => {
  assertStringIncludes(sql, "claim_orbit_ai_execution");
  assertStringIncludes(sql, "returning id into _id");
});

Deno.test("run inicia atomicamente uma única vez e órfão só vai para revisão", () => {
  assertStringIncludes(sql, "status = 'pending' and started_at is null");
  assertStringIncludes(sql, "unique references public.orbit_flow_runs");
  assertStringIncludes(sql, "pending_review");
  assertStringIncludes(sql, "where r.empresa_id = _empresa_id");
  if (/queue_orphan_flow_runs_for_review[\s\S]*status = 'running'/i.test(sql)) {
    throw new Error("reconciliação de órfão não pode iniciar run automaticamente");
  }
});
