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
  source: "read_only_monitor";
  remediationPlaybook: RemediationPlaybook;
};
export function sanitizeIncidentDescriptor(
  input: SanitizedIncidentDescriptor,
): SanitizedIncidentDescriptor {
  return JSON.parse(
    JSON.stringify(
      input,
      (key, value) =>
        /phone|telefone|message|mensagem|text|url|token|secret|email|name|nome|payload/i
            .test(key)
          ? "[redacted]"
          : value,
    ),
  );
}
export function acceptDescriptor(
  d: SanitizedIncidentDescriptor,
  now = new Date(),
): string[] {
  const reasons = validateDescriptor(d, now);
  if (d.source !== "read_only_monitor") {
    reasons.push("source_not_read_only_monitor");
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
    ].includes(d.kind as ReleaseKind)
  ) reasons.push("kind_not_allowlisted");
  return [...new Set(reasons)];
}
