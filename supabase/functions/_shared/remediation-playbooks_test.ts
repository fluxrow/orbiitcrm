import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type DeploymentSnapshot,
  executeRemediation,
  type RemediationAdapter,
  type RemediationRequest,
  sanitizeSnapshot,
  TENANTS,
} from "./remediation-playbooks.ts";

const SHA = "37efc1bb223901a059a18bbbdd424c31237eaa44";

function request(
  overrides: Partial<RemediationRequest> = {},
): RemediationRequest {
  return {
    playbook: "meeting_reminder_source_guard",
    tenantId: TENANTS.viver,
    functionName: "orbit-flow-executor",
    expectedSha: SHA,
    expectedRuntimeVersion: "runtime-v1",
    idempotencyKey: "test-remediation-1",
    dryRun: true,
    occurrenceKey: "2026-09-01T19:30:00-03:00",
    ...overrides,
  };
}

function adapter(
  before: DeploymentSnapshot,
  after = before,
): RemediationAdapter & { audits: any[]; deployed: boolean } {
  const state = { current: before, audits: [] as any[], deployed: false };
  return {
    audits: state.audits,
    get deployed() {
      return state.deployed;
    },
    findIdempotency: async () => null,
    inspect: async () => state.deployed ? after : before,
    deployIsolated: async () => {
      state.deployed = true;
    },
    rollback: async () => {
      state.deployed = false;
    },
    recordAudit: async (audit) => {
      state.audits.push(audit);
    },
  };
}

Deno.test("dry-run only previews an allowlisted reminder guard", async () => {
  const a = adapter({
    functionName: "orbit-flow-executor",
    deployedSha: "old",
    runtimeVersion: "old",
    replayCount: 0,
    outboxCount: 3,
  });
  const result = await executeRemediation(request(), a, "run-1");
  assertEquals(result.status, "preview");
  assertEquals(a.audits.length, 1);
  assert(!result.reasons.includes("human_approval_required"));
});

Deno.test("cross-tenant, arbitrary function and expired occurrence fail closed", async () => {
  const a = adapter({
    functionName: "x",
    deployedSha: null,
    runtimeVersion: null,
    replayCount: 0,
    outboxCount: 0,
  });
  const result = await executeRemediation(
    request({
      tenantId: TENANTS.bullink,
      functionName: "drop-everything",
      dryRun: false,
      occurrenceKey: "2026-09-01T19:30:00-03:00",
    }),
    a,
    "run-2",
    new Date("2026-09-02T01:00:00Z"),
  );
  assertEquals(result.status, "blocked");
  assert(result.reasons.includes("tenant_not_allowlisted"));
  assert(result.reasons.includes("function_not_allowlisted"));
  assert(result.reasons.includes("occurrence_expired_no_reopen"));
});

Deno.test("approved isolated deploy validates SHA and unchanged delivery evidence", async () => {
  const before = {
    functionName: "orbit-flow-executor",
    deployedSha: "old",
    runtimeVersion: "old",
    replayCount: 2,
    outboxCount: 7,
  };
  const after = { ...before, deployedSha: SHA, runtimeVersion: "new" };
  const a = adapter(before, after);
  const result = await executeRemediation(
    request({
      dryRun: false,
      approvedBy: "user-1",
      windowEndsAt: "2026-09-02T00:00:00Z",
      occurrenceKey: "2026-09-01T19:30:00-03:00",
      expectedRuntimeVersion: "new",
    }),
    a,
    "run-3",
  );
  assertEquals(result.status, "applied");
  assert(result.reasons.includes("delivery_evidence_unchanged"));
});

Deno.test("validation failure rolls back and records a sanitized snapshot", async () => {
  const before = {
    functionName: "orbit-flow-executor",
    deployedSha: "old",
    runtimeVersion: "old",
    replayCount: 0,
    outboxCount: 0,
  };
  const a = adapter(before, { ...before, deployedSha: "wrong" });
  const result = await executeRemediation(
    request({
      dryRun: false,
      approvedBy: "user-1",
      windowEndsAt: "2026-09-02T00:00:00Z",
      occurrenceKey: "2026-09-01T19:30:00-03:00",
    }),
    a,
    "run-4",
  );
  assertEquals(result.status, "rolled_back");
  const sanitized = sanitizeSnapshot({
    phone: "+55",
    message: "secret",
    nested: { meeting_url: "https://example" },
  });
  assertEquals(sanitized.phone, "[redacted]");
  assertEquals(sanitized.nested, { meeting_url: "[redacted]" });
});
