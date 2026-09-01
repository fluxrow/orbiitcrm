import { type RemediationPlaybook, TENANTS } from "./remediation-playbooks.ts";
import {
  type IncidentDescriptor,
  type ReleaseKind,
  validateDescriptor,
} from "./remediation-release.ts";

export type IncidentClass =
  | "follow_up"
  | "meeting_confirmation"
  | "meeting_reminder"
  | "edge_deploy_drift";
export type ApprovalMode = "class_activation" | "per_occurrence";
export const APPROVAL_MATRIX: Record<
  IncidentClass,
  { mode: ApprovalMode; automatic: boolean }
> = {
  follow_up: { mode: "class_activation", automatic: true },
  meeting_confirmation: { mode: "class_activation", automatic: true },
  meeting_reminder: { mode: "class_activation", automatic: true },
  edge_deploy_drift: { mode: "per_occurrence", automatic: false },
};

export type SanitizedIncidentDescriptor = IncidentDescriptor & {
  incidentClass: IncidentClass;
  source: "read_only_monitor" | "preflight_scanner";
  remediationPlaybook: RemediationPlaybook | "official_outbox_release";
};
export function sanitizeIncidentDescriptor(
  input: SanitizedIncidentDescriptor,
): SanitizedIncidentDescriptor {
  return JSON.parse(
    JSON.stringify(
      input,
      (key, value) => {
        if (/Hash$/.test(key)) return value;
        return /phone|telefone|message|mensagem|text|url|link|token|secret|email|name|nome|payload/i
            .test(key)
          ? "[redacted]"
          : value;
      },
    ),
  );
}
export function acceptDescriptor(
  d: SanitizedIncidentDescriptor,
  now = new Date(),
): string[] {
  const reasons = validateDescriptor(d, now);
  if (!["read_only_monitor", "preflight_scanner"].includes(d.source)) {
    reasons.push("source_not_allowlisted");
  }
  if (d.tenantId !== TENANTS.bullink && d.tenantId !== TENANTS.viver) {
    reasons.push("tenant_not_allowlisted");
  }
  if (
    ![
      "meeting_reminder_24h",
      "meeting_reminder_1h",
      "meeting_reminder_5m",
      "weekly_reminder",
      "follow_up",
      "meeting_confirmation",
    ].includes(d.kind as ReleaseKind)
  ) reasons.push("kind_not_allowlisted");
  const operational = [
    "follow_up",
    "meeting_confirmation",
    "meeting_reminder",
  ].includes(d.incidentClass);
  if (operational && d.remediationPlaybook !== "official_outbox_release") {
    reasons.push("playbook_class_mismatch");
  }
  if (
    d.incidentClass === "edge_deploy_drift" &&
    d.remediationPlaybook !== "edge_function_deploy_drift"
  ) reasons.push("playbook_class_mismatch");
  return [...new Set(reasons)];
}
