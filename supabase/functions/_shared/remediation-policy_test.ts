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

const d = (x: Record<string, unknown> = {}) => ({
  tenantId: TENANTS.viver,
  entityId: "e",
  eventId: "v",
  idempotencyKey: "k",
  kind: "meeting_reminder_5m",
  originalAt: "2026-09-02T00:00:00Z",
  windowStart: "2026-09-01T23:45:00Z",
  deadline: "2026-09-02T00:15:00Z",
  eligible: true,
  consentCurrent: true,
  conversationId: "c",
  templateId: "t",
  incidentClass: "meeting_reminder",
  source: "read_only_monitor",
  remediationPlaybook: "meeting_reminder_source_guard",
  ...x,
} as any);
Deno.test("class activation permits only reversible known classes", () => {
  assert(APPROVAL_MATRIX.meeting_reminder.automatic);
  assert(!APPROVAL_MATRIX.edge_deploy_drift.automatic);
});
Deno.test("descriptor is sanitized and correlated", () => {
  const s = sanitizeIncidentDescriptor(d({ payload: { phone: "+55" } }));
  assertEquals((s as any).payload, "[redacted]");
  assertEquals(acceptDescriptor(d()), []);
});
Deno.test("cross tenant and non monitor source fail closed", () => {
  const r = acceptDescriptor(d({ tenantId: "bad", source: "writer" }));
  assert(r.includes("tenant_not_allowlisted"));
  assert(r.includes("source_not_read_only_monitor"));
});
