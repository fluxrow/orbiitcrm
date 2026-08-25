import { classifyMeeting, type MeetingRow } from "../orbit-ai-agent/viver-meeting-guard.ts";
export * from "../orbit-ai-agent/viver-meeting-guard.ts";

export function meetingIdFromFlowContext(context: Record<string, any> | null | undefined): string | null {
  const payload = context?.payload ?? context ?? {};
  const value = payload?.meeting_id ?? (payload?.entity_type === "meeting" ? payload?.entity_id : null);
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
}

export function evaluateViverMeetingReminder(input: {
  reminderKind?: unknown;
  meetingId: string | null;
  meeting: MeetingRow | null;
  queryFailed?: boolean;
}, now = new Date()): { allowed: boolean; reason?: string } {
  if (!String(input.reminderKind ?? "").startsWith("meeting_reminder_")) return { allowed: true };
  if (!input.meetingId) return { allowed: false, reason: "meeting_reminder_invalid_meeting_id" };
  if (input.queryFailed) return { allowed: false, reason: "meeting_reminder_revalidation_failed" };
  if (!input.meeting) return { allowed: false, reason: "meeting_reminder_not_owned_by_viver" };
  const phase = classifyMeeting(input.meeting, now);
  return phase === "upcoming" ? { allowed: true } : { allowed: false, reason: `meeting_reminder_${phase}` };
}
