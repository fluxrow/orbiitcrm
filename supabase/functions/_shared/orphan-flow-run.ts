export const ORPHAN_RUN_REASON = "pending_without_started_at_over_sla";

export function isOrphanRun(run: { status?: string | null; started_at?: string | null; created_at?: string | null }, nowMs: number, slaMs: number) {
  const created = run.created_at ? Date.parse(run.created_at) : NaN;
  return run.status === "pending" && !run.started_at && Number.isFinite(created) && created <= nowMs - slaMs;
}

export function sanitizedOrphanAlert(row: { run_id?: string; empresa_id?: string; reason?: string }) {
  return { scope: "orphan_flow_run_review", run_id: row.run_id ?? null, empresa_id: row.empresa_id ?? null, reason: row.reason ?? ORPHAN_RUN_REASON };
}
