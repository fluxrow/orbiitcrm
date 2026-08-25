import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { isOrphanRun, sanitizedOrphanAlert, ORPHAN_RUN_REASON } from "./orphan-flow-run.ts";

Deno.test("run pending sem started_at acima do SLA vai para revisão", () => {
  assert(isOrphanRun({ status: "pending", started_at: null, created_at: "2026-08-25T10:00:00Z" }, Date.parse("2026-08-25T10:10:00Z"), 300_000));
  assertEquals(isOrphanRun({ status: "running", started_at: null, created_at: "2026-08-25T10:00:00Z" }, Date.parse("2026-08-25T10:10:00Z"), 300_000), false);
});

Deno.test("alerta de run órfão não contém payload ou PII", () => {
  assertEquals(sanitizedOrphanAlert({ run_id: "r1", empresa_id: "e1" }), {
    scope: "orphan_flow_run_review", run_id: "r1", empresa_id: "e1", reason: ORPHAN_RUN_REASON,
  });
});
