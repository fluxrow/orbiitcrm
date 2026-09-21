export const VIVER_FOLLOWUP_DELIVERY_ANCHOR_EMPRESA_ID =
  "36f26579-66ad-4ef1-9788-141e4c727232";

export function computeViverFollowupDeliveryAnchor(input: {
  empresaId: unknown;
  sourceType: unknown;
  controlledFollowup: unknown;
  providerSentAt: unknown;
  delaySeconds: unknown;
  currentScheduledFor: unknown;
}): string | null {
  if (
    String(input.empresaId ?? "") !==
      VIVER_FOLLOWUP_DELIVERY_ANCHOR_EMPRESA_ID ||
    String(input.sourceType ?? "") !== "flow_initial" ||
    input.controlledFollowup !== true
  ) return null;

  const sentAtMs = Date.parse(String(input.providerSentAt ?? ""));
  const currentMs = Date.parse(String(input.currentScheduledFor ?? ""));
  const delaySeconds = Number(input.delaySeconds);
  if (
    !Number.isFinite(sentAtMs) || !Number.isFinite(currentMs) ||
    !Number.isFinite(delaySeconds) || delaySeconds <= 0
  ) return null;

  const anchoredMs = sentAtMs + delaySeconds * 1000;
  // Never shorten a cadence that was intentionally scheduled later.
  return currentMs < anchoredMs ? new Date(anchoredMs).toISOString() : null;
}
