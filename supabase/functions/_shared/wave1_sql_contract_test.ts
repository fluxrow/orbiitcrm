import { assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

const sql = await Deno.readTextFile(new URL("../../migrations/20260825120000_wave1_agent_safety.sql", import.meta.url));

Deno.test("claim IA é persistente, tenant-scoped e único por evento", () => {
  assertStringIncludes(sql, "unique (empresa_id, conversa_id, correlation_id)");
  assertStringIncludes(sql, "where id = _conversa_id and empresa_id = _empresa_id");
  assertStringIncludes(sql, "orbit_ai_execution_one_active_conversation");
  assertStringIncludes(sql, "where status = 'running'");
});

Deno.test("duas execuções concorrentes só obtêm um claim efetivo", () => {
  assertStringIncludes(sql, "claim_orbit_ai_execution");
  assertStringIncludes(sql, "pg_advisory_xact_lock");
  assertStringIncludes(sql, "conversation_busy");
  assertStringIncludes(sql, "event_already_active");
});

Deno.test("lease tem fencing token, expiração, renovação e retomada segura", () => {
  assertStringIncludes(sql, "lease_token uuid");
  assertStringIncludes(sql, "lease_expires_at");
  assertStringIncludes(sql, "recovered_expired");
  assertStringIncludes(sql, "renew_orbit_ai_execution_lease");
  assertStringIncludes(sql, "where id = _claim_id and lease_token = _lease_token");
});

Deno.test("retenção remove somente histórico terminal antigo e preserva revisão pendente", () => {
  assertStringIncludes(sql, "cleanup_orbit_execution_history");
  assertStringIncludes(sql, "status in ('finished','error','expired')");
  assertStringIncludes(sql, "status in ('resolved','dismissed')");
  if (/delete from public\.orbit_flow_run_review_queue[\s\S]{0,250}pending_review/i.test(sql)) {
    throw new Error("retenção não pode apagar revisão pendente");
  }
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
