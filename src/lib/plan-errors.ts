import type { PlanLimitReason } from "@/components/orbit/PlanLimitDialog";
import { isPlanLimitError } from "@/lib/api-envelope";

const PLAN_ERROR_CODES: PlanLimitReason[] = [
  "PLAN_LIMIT_REACHED",
  "PLAN_FEATURE_DISABLED",
  "PLAN_STATUS_BLOCKED",
  "TRIAL_EXPIRED",
  "NO_PLAN",
  "DEMO_RATE_LIMIT",
  "DEMO_ACTION_BLOCKED",
  // Legacy codes for backward compatibility
  "PLAN_LIMIT",
  "FEATURE_DISABLED",
  "SUSPENDED",
];

/**
 * Checks if an error from an edge function response is a plan enforcement error.
 * Returns the reason code if it is, or null otherwise.
 *
 * Works with both new ApiError/envelope format and legacy formats.
 */
export function extractPlanLimitReason(error: any): PlanLimitReason | null {
  // New envelope-based detection
  const envelopeCode = isPlanLimitError(error);
  if (envelopeCode) return envelopeCode as PlanLimitReason;

  // Legacy: edge function response with { error, code }
  const code = error?.code || error?.reason;
  if (code && PLAN_ERROR_CODES.includes(code as PlanLimitReason)) {
    return code as PlanLimitReason;
  }

  // Legacy: error message that matches a reason
  const message = typeof error === "string" ? error : error?.message || error?.error;
  if (message && PLAN_ERROR_CODES.includes(message as PlanLimitReason)) {
    return message as PlanLimitReason;
  }

  return null;
}
