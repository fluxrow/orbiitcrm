import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  matchesMeetingKindPolicy,
  meetingKindFromPayload,
  VIVER_GROUP_CLASS_KIND,
} from "./meeting-kind-policy.ts";

Deno.test("meeting kind is read from trusted scheduler payload", () => {
  assertEquals(
    meetingKindFromPayload({ meeting_kind: VIVER_GROUP_CLASS_KIND }),
    VIVER_GROUP_CLASS_KIND,
  );
  assertEquals(
    meetingKindFromPayload({ metadata: { meeting_kind: VIVER_GROUP_CLASS_KIND } }),
    VIVER_GROUP_CLASS_KIND,
  );
});

Deno.test("class-only and class-exclusion policies fail closed", () => {
  const group = { meeting_kind: VIVER_GROUP_CLASS_KIND };
  assertEquals(
    matchesMeetingKindPolicy({ required_meeting_kind: VIVER_GROUP_CLASS_KIND }, group),
    true,
  );
  assertEquals(
    matchesMeetingKindPolicy({ required_meeting_kind: VIVER_GROUP_CLASS_KIND }, {}),
    false,
  );
  assertEquals(
    matchesMeetingKindPolicy({ exclude_meeting_kind: VIVER_GROUP_CLASS_KIND }, group),
    false,
  );
  assertEquals(
    matchesMeetingKindPolicy({ exclude_meeting_kind: VIVER_GROUP_CLASS_KIND }, {}),
    true,
  );
});
