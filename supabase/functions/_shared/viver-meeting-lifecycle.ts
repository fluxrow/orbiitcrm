export * from "../orbit-ai-agent/viver-meeting-guard.ts";

export function meetingIdFromFlowContext(context: Record<string, any> | null | undefined): string | null {
  const payload = context?.payload ?? context ?? {};
  const value = payload?.meeting_id ?? (payload?.entity_type === "meeting" ? payload?.entity_id : null);
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
}
