/**
 * Motor de remediação segura.
 *
 * Este módulo é deliberadamente agnóstico de Supabase: não executa SQL, não
 * escolhe funções arbitrárias e só chama adaptadores depois de validar uma
 * definição allowlisted. O endpoint/adaptador de produção deve persistir os
 * snapshots e auditoria em orbit_remediation_runs.
 */

export type RemediationPlaybook =
  | "edge_function_deploy_drift"
  | "meeting_reminder_source_guard";

export type RemediationRisk = "low" | "medium" | "high";

export type RemediationStatus =
  | "preview"
  | "blocked"
  | "applied"
  | "rolled_back"
  | "failed"
  | "idempotent_noop";

export const TENANTS = {
  bullink: "4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18",
  viver: "36f26579-66ad-4ef1-9788-141e4c727232",
} as const;

const PLAYBOOKS: Record<RemediationPlaybook, {
  risk: RemediationRisk;
  tenants: readonly string[];
  functions: readonly string[];
  reversibleBeforeSend: boolean;
}> = {
  edge_function_deploy_drift: {
    risk: "high",
    tenants: [TENANTS.bullink, TENANTS.viver],
    functions: [
      "orbit-ai-agent",
      "orbit-flow-executor",
      "send-orbit-campaign",
      "send-vendedor-notification",
    ],
    reversibleBeforeSend: true,
  },
  meeting_reminder_source_guard: {
    risk: "medium",
    tenants: [TENANTS.viver],
    functions: ["orbit-flow-executor"],
    reversibleBeforeSend: true,
  },
};

export type RemediationRequest = {
  playbook: RemediationPlaybook;
  tenantId: string;
  functionName: string;
  expectedSha: string;
  expectedRuntimeVersion: string;
  idempotencyKey: string;
  dryRun: boolean;
  approvedBy?: string | null;
  windowEndsAt?: string | null;
  occurrenceKey?: string | null;
};

export type DeploymentSnapshot = {
  functionName: string;
  deployedSha: string | null;
  runtimeVersion: string | null;
  replayCount: number;
  outboxCount: number;
};

export type RemediationAudit = {
  runId: string;
  status: RemediationStatus;
  playbook: RemediationPlaybook;
  tenantId: string;
  functionName: string;
  idempotencyKey: string;
  dryRun: boolean;
  risk: RemediationRisk;
  reasons: string[];
  snapshotBefore?: SanitizedSnapshot;
  snapshotAfter?: SanitizedSnapshot;
  rollbackAttempted?: boolean;
};

export type SanitizedSnapshot = Record<string, unknown>;

export type RemediationAdapter = {
  findIdempotency: (key: string) => Promise<RemediationStatus | null>;
  inspect: (
    functionName: string,
    tenantId: string,
  ) => Promise<DeploymentSnapshot>;
  deployIsolated: (functionName: string, expectedSha: string) => Promise<void>;
  rollback: (before: DeploymentSnapshot) => Promise<void>;
  recordAudit: (audit: RemediationAudit) => Promise<void>;
};

export function getPlaybookDefinition(playbook: RemediationPlaybook) {
  return PLAYBOOKS[playbook];
}

function isSha(value: string): boolean {
  return /^[a-f0-9]{7,64}$/i.test(value);
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    .test(value);
}

function addReason(reasons: string[], reason: string) {
  if (!reasons.includes(reason)) reasons.push(reason);
}

export function validateRemediationRequest(
  request: RemediationRequest,
  now = new Date(),
): string[] {
  const reasons: string[] = [];
  const definition = PLAYBOOKS[request.playbook];
  if (!definition) addReason(reasons, "playbook_not_allowlisted");
  if (!isUuid(request.tenantId)) addReason(reasons, "tenant_invalid");
  if (definition && !definition.tenants.includes(request.tenantId)) {
    addReason(reasons, "tenant_not_allowlisted");
  }
  if (!definition || !definition.functions.includes(request.functionName)) {
    addReason(reasons, "function_not_allowlisted");
  }
  if (!isSha(request.expectedSha)) addReason(reasons, "expected_sha_invalid");
  if (
    !request.expectedRuntimeVersion ||
    request.expectedRuntimeVersion.length > 120
  ) {
    addReason(reasons, "expected_runtime_invalid");
  }
  if (!request.idempotencyKey || request.idempotencyKey.length > 200) {
    addReason(reasons, "idempotency_key_invalid");
  }
  if (
    request.playbook === "meeting_reminder_source_guard" &&
    request.tenantId !== TENANTS.viver
  ) {
    addReason(reasons, "meeting_guard_requires_viver");
  }
  if (
    request.playbook === "meeting_reminder_source_guard" &&
    !request.occurrenceKey
  ) {
    addReason(reasons, "occurrence_required");
  }
  if (!request.dryRun && !request.windowEndsAt) {
    addReason(reasons, "window_required");
  }
  if (request.windowEndsAt) {
    const end = new Date(request.windowEndsAt);
    if (Number.isNaN(end.getTime())) addReason(reasons, "window_invalid");
    else if (now.getTime() > end.getTime()) {
      addReason(reasons, "window_expired");
    }
  }
  if (request.occurrenceKey) {
    const occurrence = new Date(request.occurrenceKey);
    if (Number.isNaN(occurrence.getTime())) {
      addReason(reasons, "occurrence_invalid");
    } else if (now.getTime() > occurrence.getTime() + 2 * 60 * 60 * 1000) {
      addReason(reasons, "occurrence_expired_no_reopen");
    }
  }
  return reasons;
}

/** Recursively removes PII/secrets before snapshots are persisted. */
export function sanitizeSnapshot(value: unknown): SanitizedSnapshot {
  const blocked =
    /phone|telefone|mensagem|message|text|url|token|secret|email|nome|name|payload/i;
  const walk = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(walk);
    if (!input || typeof input !== "object") return input;
    const out: Record<string, unknown> = {};
    for (
      const [key, child] of Object.entries(input as Record<string, unknown>)
    ) {
      out[key] = blocked.test(key) ? "[redacted]" : walk(child);
    }
    return out;
  };
  return walk(value) as SanitizedSnapshot;
}

function unchangedDeliveryEvidence(
  before: DeploymentSnapshot,
  after: DeploymentSnapshot,
): boolean {
  return before.replayCount === after.replayCount &&
    before.outboxCount === after.outboxCount;
}

export async function executeRemediation(
  request: RemediationRequest,
  adapter: RemediationAdapter,
  runId: string,
  now = new Date(),
): Promise<RemediationAudit> {
  const definition = PLAYBOOKS[request.playbook];
  const base: RemediationAudit = {
    runId,
    status: "blocked",
    playbook: request.playbook,
    tenantId: request.tenantId,
    functionName: request.functionName,
    idempotencyKey: request.idempotencyKey,
    dryRun: request.dryRun,
    risk: definition?.risk ?? "high",
    reasons: validateRemediationRequest(request, now),
  };
  if (base.reasons.length) {
    await adapter.recordAudit(base);
    return base;
  }

  const previous = await adapter.findIdempotency(request.idempotencyKey);
  if (
    previous === "applied" || previous === "rolled_back" ||
    previous === "failed"
  ) {
    const result = {
      ...base,
      status: "idempotent_noop" as const,
      reasons: ["idempotency_already_terminal"],
    };
    await adapter.recordAudit(result);
    return result;
  }

  const before = await adapter.inspect(request.functionName, request.tenantId);
  const preview = {
    ...base,
    status: "preview" as const,
    reasons: [
      "preconditions_verified",
      before.deployedSha === request.expectedSha
        ? "sha_already_current"
        : "sha_drift_detected",
    ],
    snapshotBefore: sanitizeSnapshot(before),
  };
  if (request.dryRun) {
    await adapter.recordAudit(preview);
    return preview;
  }
  if (!request.approvedBy) {
    const result = {
      ...preview,
      status: "blocked" as const,
      reasons: ["human_approval_required"],
    };
    await adapter.recordAudit(result);
    return result;
  }

  try {
    await adapter.deployIsolated(request.functionName, request.expectedSha);
    const after = await adapter.inspect(request.functionName, request.tenantId);
    if (after.deployedSha !== request.expectedSha) {
      throw new Error("post_deploy_sha_mismatch");
    }
    if (after.runtimeVersion !== request.expectedRuntimeVersion) {
      throw new Error("post_deploy_runtime_mismatch");
    }
    if (!unchangedDeliveryEvidence(before, after)) {
      throw new Error("replay_or_outbox_mutation_detected");
    }
    const result = {
      ...preview,
      status: "applied" as const,
      reasons: [
        ...preview.reasons,
        "isolated_deploy_validated",
        "delivery_evidence_unchanged",
      ],
      snapshotAfter: sanitizeSnapshot(after),
    };
    await adapter.recordAudit(result);
    return result;
  } catch (error) {
    let rollbackAttempted = false;
    try {
      rollbackAttempted = true;
      await adapter.rollback(before);
    } catch {
      rollbackAttempted = true;
    }
    const result = {
      ...preview,
      status: rollbackAttempted ? "rolled_back" as const : "failed" as const,
      reasons: [
        "validation_failed",
        error instanceof Error ? error.message : "unknown_error",
      ],
      rollbackAttempted,
    };
    await adapter.recordAudit(result);
    return result;
  }
}
