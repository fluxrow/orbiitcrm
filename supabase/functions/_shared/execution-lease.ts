export interface LeaseSnapshot {
  eventId: string;
  status: "running" | "finished" | "error" | "expired";
  expiresAt: number;
}

export type LeaseDecision = "acquire" | "recover_expired" | "event_already_active" | "event_already_finished" | "conversation_busy";

export function decideConversationLease(eventId: string, rows: LeaseSnapshot[], now: number): LeaseDecision {
  const same = rows.find((row) => row.eventId === eventId);
  if (same?.status === "finished") return "event_already_finished";
  if (same?.status === "running" && same.expiresAt > now) return "event_already_active";
  if (rows.some((row) => row.status === "running" && row.expiresAt > now)) return "conversation_busy";
  if (same && (same.status === "expired" || same.status === "error" || same.expiresAt <= now)) return "recover_expired";
  return "acquire";
}
