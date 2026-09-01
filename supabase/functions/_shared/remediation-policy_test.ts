import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  acceptDescriptor,
  APPROVAL_MATRIX,
  sanitizeIncidentDescriptor,
} from "./remediation-policy.ts";
import { TENANTS } from "./remediation-playbooks.ts";

const HASH = "a".repeat(64);
const d = (x: Record<string, unknown> = {}) => ({
  descriptorVersion: 1,
  tenantId: TENANTS.viver,
  entityId: "11111111-1111-4111-8111-111111111111",
  eventId: "22222222-2222-4222-8222-222222222222",
  idempotencyKey: "meeting-reminder|tenant|event",
  kind: "meeting_reminder_5m",
  preflightAt: "2026-09-01T23:45:00Z",
  releaseAt: "2026-09-01T23:55:00Z",
  releaseDeadline: "2026-09-01T23:57:00Z",
  deliveryDeadline: "2026-09-01T23:57:00Z",
  meetingStartsAt: "2026-09-02T00:00:00Z",
  eligible: true,
  consentCurrent: true,
  conversationId: "33333333-3333-4333-8333-333333333333",
  templateId: "44444444-4444-4444-8444-444444444444",
  meetingId: "55555555-5555-4555-8555-555555555555",
  recipientHash: HASH,
  contentHash: HASH,
  canonicalLinkHash: HASH,
  incidentClass: "meeting_reminder",
  source: "read_only_monitor",
  remediationPlaybook: "official_outbox_release",
  ...x,
} as any);

Deno.test("class activation permits only reversible known classes", () => {
  assert(APPROVAL_MATRIX.meeting_reminder.automatic);
  assert(APPROVAL_MATRIX.follow_up.automatic);
  assert(!APPROVAL_MATRIX.edge_deploy_drift.automatic);
});

Deno.test("descriptor is sanitized without destroying safe fingerprints", () => {
  const s = sanitizeIncidentDescriptor(
    d({ payload: { phone: "+55" }, rawUrl: "https://sensitive" }),
  );
  assertEquals((s as any).payload, "[redacted]");
  assertEquals((s as any).rawUrl, "[redacted]");
  assertEquals(s.canonicalLinkHash, HASH);
  assertEquals(acceptDescriptor(d(), new Date("2026-09-01T23:46:00Z")), []);
});

Deno.test("cross tenant and non-allowlisted source fail closed", () => {
  const r = acceptDescriptor(
    d({ tenantId: "bad", source: "writer" }),
    new Date("2026-09-01T23:46:00Z"),
  );
  assert(r.includes("tenant_not_allowlisted"));
  assert(r.includes("source_not_allowlisted"));
});

Deno.test("operational classes cannot request deploy playbook", () => {
  const r = acceptDescriptor(
    d({ remediationPlaybook: "edge_function_deploy_drift" }),
    new Date("2026-09-01T23:46:00Z"),
  );
  assert(r.includes("playbook_class_mismatch"));
});
