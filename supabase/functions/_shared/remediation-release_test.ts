import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type DeliveryEvidence,
  type IncidentDescriptor,
  preflight,
  release,
  type ReleaseAdapter,
  type ReleaseState,
  validateDescriptor,
  verifyDelivery,
} from "./remediation-release.ts";
import { TENANTS } from "./remediation-playbooks.ts";

const HASH = "b".repeat(64);
const at = (minute: number) =>
  `2026-09-02T00:${String(minute).padStart(2, "0")}:00Z`;

function descriptor(
  overrides: Partial<IncidentDescriptor> = {},
): IncidentDescriptor {
  return {
    descriptorVersion: 1,
    tenantId: TENANTS.viver,
    entityId: "11111111-1111-4111-8111-111111111111",
    eventId: "22222222-2222-4222-8222-222222222222",
    idempotencyKey: "remediation|viver|event",
    kind: "meeting_reminder_5m",
    preflightAt: at(0),
    releaseAt: at(10),
    releaseDeadline: at(12),
    deliveryDeadline: at(12),
    meetingStartsAt: at(15),
    eligible: true,
    consentCurrent: true,
    conversationId: "33333333-3333-4333-8333-333333333333",
    templateId: "44444444-4444-4444-8444-444444444444",
    prospectId: "55555555-5555-4555-8555-555555555555",
    meetingId: "66666666-6666-4666-8666-666666666666",
    scheduledActionId: "77777777-7777-4777-8777-777777777777",
    recipientHash: HASH,
    contentHash: HASH,
    canonicalLinkHash: HASH,
    ...overrides,
  };
}

const valid = {
  eligible: true,
  consentCurrent: true,
  meetingFuture: true,
  tenantMatch: true,
  sameRecipient: true,
  sameTemplate: true,
  sameContent: true,
  sameLink: true,
  adapterReady: true,
  withinQuotaCadence: true,
  providerNotAccepted: true,
  noDuplicate: true,
};

function adapter(evidence: DeliveryEvidence): ReleaseAdapter & {
  states: ReleaseState[];
  enqueueCalls: number;
} {
  const states: ReleaseState[] = [];
  let current: ReleaseState | null = null;
  let enqueueCalls = 0;
  return {
    states,
    get enqueueCalls() {
      return enqueueCalls;
    },
    find: async () => current,
    save: async (_key, state) => {
      current = state;
      states.push(state);
    },
    revalidate: async () => valid,
    enqueueOfficialOnce: async () => {
      enqueueCalls++;
      return evidence;
    },
    inspectOfficialDelivery: async () => evidence,
  };
}

Deno.test("preflight validates the recovery lead, not the meeting offset", async () => {
  const d = descriptor();
  assertEquals(validateDescriptor(d, new Date(at(1))), []);
  const a = adapter({ status: "pending", attempts: 0 });
  assertEquals(await preflight(d, a, new Date(at(1))), "prepared");
});

Deno.test("release never marks asynchronous outbox as sent", async () => {
  const d = descriptor();
  const a = adapter({
    outboxId: "outbox-1",
    status: "pending",
    attempts: 0,
    providerMessageId: null,
  });
  assertEquals(await release(d, a, new Date(at(11))), "verifying");
  assertEquals(a.enqueueCalls, 1);
  assert(!a.states.includes("released"));
});

Deno.test("official kick without an immediate outbox is verified asynchronously", async () => {
  const d = descriptor();
  const a = adapter({
    status: "pending",
    attempts: 0,
    providerMessageId: null,
  });
  assertEquals(await release(d, a, new Date(at(11))), "enqueued");
  assertEquals(a.enqueueCalls, 1);
  assert(!a.states.includes("released"));
});

Deno.test("provider confirmation with one attempt closes the incident", async () => {
  const d = descriptor();
  const a = adapter({
    outboxId: "outbox-1",
    status: "sent",
    attempts: 1,
    providerMessageId: "provider-1",
  });
  assertEquals(
    await verifyDelivery(d, "outbox-1", a, new Date(at(11))),
    "released",
  );
});

Deno.test("provider ambiguity and second attempt require approval", async () => {
  const d = descriptor();
  const a = adapter({
    outboxId: "outbox-1",
    status: "processing",
    attempts: 2,
    providerMessageId: "provider-uncertain",
  });
  assertEquals(
    await verifyDelivery(d, "outbox-1", a, new Date(at(11))),
    "needs_approval",
  );
});

Deno.test("expired delivery fails closed without retry", async () => {
  const d = descriptor();
  const a = adapter({
    outboxId: "outbox-1",
    status: "pending",
    attempts: 0,
    providerMessageId: null,
  });
  assertEquals(
    await verifyDelivery(d, "outbox-1", a, new Date(at(13))),
    "failed",
  );
  assertEquals(a.enqueueCalls, 0);
});

Deno.test("changed recipient or duplicate uncertainty never enqueues", async () => {
  const d = descriptor();
  const a = adapter({ status: "pending", attempts: 0 });
  a.revalidate = async () => ({
    ...valid,
    sameRecipient: false,
    noDuplicate: false,
  });
  assertEquals(await release(d, a, new Date(at(11))), "needs_approval");
  assertEquals(a.enqueueCalls, 0);
});

Deno.test("meeting started and unsafe preflight window are rejected", () => {
  const unsafe = descriptor({
    preflightAt: "2026-09-01T23:00:00Z",
    meetingStartsAt: at(10),
  });
  const reasons = validateDescriptor(unsafe, new Date(at(1)));
  assert(reasons.includes("preflight_window_outside_safe_limits"));
  assert(reasons.includes("delivery_must_precede_meeting"));
});
