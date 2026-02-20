import type { PlanLimitReason } from "@/components/orbit/PlanLimitDialog";

const PLAN_ERROR_CODES: PlanLimitReason[] = [
  "PLAN_LIMIT",
  "FEATURE_DISABLED",
  "TRIAL_EXPIRED",
  "SUSPENDED",
  "NO_PLAN",
];

/**
 * Checks if an error from an edge function response is a plan enforcement error.
 * Returns the reason code if it is, or null otherwise.
 */
export function extractPlanLimitReason(error: any): PlanLimitReason | null {
  // Edge function response with { error, code }
  const code = error?.code || error?.reason;
  if (code && PLAN_ERROR_CODES.includes(code as PlanLimitReason)) {
    return code as PlanLimitReason;
  }

  // Error message that matches a reason
  const message = typeof error === "string" ? error : error?.message || error?.error;
  if (message && PLAN_ERROR_CODES.includes(message as PlanLimitReason)) {
    return message as PlanLimitReason;
  }

  return null;
}
