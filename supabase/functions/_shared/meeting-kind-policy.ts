export const VIVER_GROUP_CLASS_KIND = "viver_group_class";

function normalizedKind(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function meetingKindFromPayload(
  payload: Record<string, unknown> | null | undefined,
): string | null {
  const direct = normalizedKind(payload?.meeting_kind);
  if (direct) return direct;
  const metadata = payload?.metadata;
  return metadata && typeof metadata === "object"
    ? normalizedKind((metadata as Record<string, unknown>).meeting_kind)
    : null;
}

export function matchesMeetingKindPolicy(
  policy: Record<string, unknown> | null | undefined,
  payload: Record<string, unknown> | null | undefined,
): boolean {
  const actual = meetingKindFromPayload(payload);
  const required = normalizedKind(
    policy?.required_meeting_kind ?? policy?.meeting_kind,
  );
  if (required && actual !== required) return false;

  const excluded = normalizedKind(policy?.exclude_meeting_kind);
  if (excluded && actual === excluded) return false;
  return true;
}
