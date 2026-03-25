import { useTenant } from "@/contexts/TenantContext";
import { useSaasEmpresa } from "@/hooks/useSaasPlans";

export type StatusLevel = "full" | "degraded" | "readonly" | "blocked";

const STATUS_LEVEL_MAP: Record<string, StatusLevel> = {
  active: "full",
  trial: "full",
  past_due: "degraded",
  unpaid: "readonly",
  canceled: "blocked",
  suspended: "blocked",
  expired: "blocked",
  pending: "blocked",
};

export function usePlanGuard() {
  const { empresaId, saasStatus, isDemo } = useTenant();
  const { data: saasEmpresa } = useSaasEmpresa(empresaId || undefined);

  const plan = saasEmpresa?.saas_plans;
  const features = (plan?.features || {}) as Record<string, boolean>;
  const limits = (plan?.limits || {}) as Record<string, number>;
  const stripeStatus = saasEmpresa?.stripe_status || null;

  const statusLevel: StatusLevel = isDemo
    ? "full"
    : STATUS_LEVEL_MAP[saasStatus || ""] || "blocked";

  const showPaymentWarning = saasStatus === "past_due" || saasStatus === "unpaid";

  function canUseFeature(key: string): boolean {
    if (isDemo) return true;
    if (statusLevel === "blocked") return false;
    return !!features[key];
  }

  function isWithinLimit(key: string, current: number): boolean {
    if (isDemo) return true;
    const limit = limits[key];
    if (limit === undefined || limit === null) return true;
    if (limit === -1) return true;
    return current < limit;
  }

  return {
    canUseFeature,
    isWithinLimit,
    statusLevel,
    showPaymentWarning,
    stripeStatus,
    features,
    limits,
    plan,
  };
}
