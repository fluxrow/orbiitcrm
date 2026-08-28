export function isFlowTriggerActiveForEvent(
  triggerConfig: Record<string, unknown> | null | undefined,
  eventCreatedAt: unknown,
): boolean {
  const activation = triggerConfig?.activation_not_before;
  if (activation == null || activation === "") return true;
  if (typeof activation !== "string" || typeof eventCreatedAt !== "string") return false;

  const activationMs = Date.parse(activation);
  const eventMs = Date.parse(eventCreatedAt);
  return Number.isFinite(activationMs) && Number.isFinite(eventMs) && eventMs >= activationMs;
}
