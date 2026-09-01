import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildFollowUpDescriptor,
  buildMeetingReminderDescriptor,
  sha256,
} from "./remediation-preflight.ts";
import { validateDescriptor } from "./remediation-release.ts";
import { TENANTS } from "./remediation-playbooks.ts";

const now = new Date("2026-09-02T00:00:00Z");

Deno.test("preflight fingerprints authority without persisting raw values", async () => {
  const d = await buildFollowUpDescriptor({
    tenantId: TENANTS.bullink,
    scheduledActionId: "11111111-1111-4111-8111-111111111111",
    flowRunId: "22222222-2222-4222-8222-222222222222",
    prospectId: "33333333-3333-4333-8333-333333333333",
    conversationId: "44444444-4444-4444-8444-444444444444",
    templateId: "55555555-5555-4555-8555-555555555555",
    scheduledFor: "2026-09-02T00:10:00Z",
    recipientAuthority: "sensitive-recipient",
    contentAuthority: { body: "sensitive-body", enabled: true },
  }, now);
  assert(d);
  assertEquals(d.recipientHash.length, 64);
  assertEquals(d.contentHash.length, 64);
  assert(!JSON.stringify(d).includes("sensitive"));
  assertEquals(validateDescriptor(d, now), []);
});

Deno.test("same structured content produces a stable fingerprint", async () => {
  assertEquals(
    await sha256(JSON.stringify({ a: 1, b: 2 })),
    await sha256(JSON.stringify({ a: 1, b: 2 })),
  );
});

Deno.test("5m reminder is prepared ten minutes before its official release", async () => {
  const d = await buildMeetingReminderDescriptor({
    tenantId: TENANTS.viver,
    meetingId: "11111111-1111-4111-8111-111111111111",
    prospectId: "22222222-2222-4222-8222-222222222222",
    conversationId: "33333333-3333-4333-8333-333333333333",
    templateId: "44444444-4444-4444-8444-444444444444",
    scheduledAt: "2026-09-02T00:15:00Z",
    kind: "meeting_reminder_5m",
    recipientAuthority: "recipient",
    contentAuthority: { template: "body" },
    canonicalLinkAuthority: "canonical-authority",
  }, now);
  assert(d);
  assertEquals(d.releaseAt, "2026-09-02T00:10:00.000Z");
  assertEquals(d.deliveryDeadline, "2026-09-02T00:12:00.000Z");
  assertEquals(validateDescriptor(d, now), []);
});

Deno.test("candidates outside the preflight horizon are ignored", async () => {
  const d = await buildFollowUpDescriptor({
    tenantId: TENANTS.bullink,
    scheduledActionId: "11111111-1111-4111-8111-111111111111",
    flowRunId: "22222222-2222-4222-8222-222222222222",
    prospectId: "33333333-3333-4333-8333-333333333333",
    conversationId: "44444444-4444-4444-8444-444444444444",
    templateId: "55555555-5555-4555-8555-555555555555",
    scheduledFor: "2026-09-02T00:30:00Z",
    recipientAuthority: "recipient",
    contentAuthority: {},
  }, now);
  assertEquals(d, null);
});
