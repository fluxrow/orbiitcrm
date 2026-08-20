import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  TenantOperationsDataMap,
  TenantOperationsSection,
} from "@/lib/tenant-operations-types";
import { mapTenantOperationsPayload } from "@/lib/tenant-operations-mappers";
import { useTenant } from "@/contexts/TenantContext";
import {
  getTenantOperationsReadContract,
  TENANT_EXPLICIT_CONTEXT_FEATURE_FLAG,
} from "@/lib/tenant-operations-context";
import { TENANT_OPERATIONS_FEATURE_FLAG } from "@/lib/tenant-operations-types";

function useTenantOperationsRollout() {
  const { empresaId, slug } = useTenant();
  return useQuery({
    queryKey: ["tenant-operations-rollout", empresaId, slug],
    enabled: !!empresaId && !!slug,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orbit_feature_flags")
        .select("feature_key, enabled")
        .eq("empresa_id", empresaId!)
        .in("feature_key", [
          TENANT_OPERATIONS_FEATURE_FLAG,
          TENANT_EXPLICIT_CONTEXT_FEATURE_FLAG,
        ]);
      if (error) throw error;

      return {
        operationsEnabled: data?.some(
          flag => flag.feature_key === TENANT_OPERATIONS_FEATURE_FLAG && flag.enabled === true,
        ) === true,
        explicitContextEnabled: data?.some(
          flag => flag.feature_key === TENANT_EXPLICIT_CONTEXT_FEATURE_FLAG && flag.enabled === true,
        ) === true,
      };
    },
  });
}

export function useTenantOperations<S extends TenantOperationsSection>(
  section: S,
  options: { enabled?: boolean; refetchInterval?: number | false } = {},
) {
  const { empresaId, slug } = useTenant();
  const rollout = useTenantOperationsRollout();
  const queryEnabled = !!empresaId
    && !!slug
    && rollout.isSuccess
    && rollout.data.operationsEnabled
    && (options.enabled ?? true);

  return useQuery({
    queryKey: [
      "tenant-operations",
      empresaId,
      slug,
      rollout.data?.explicitContextEnabled === true ? "explicit" : "legacy",
      section,
    ],
    enabled: queryEnabled,
    refetchInterval: options.refetchInterval ?? false,
    staleTime: 30_000,
    retry: 1,
    queryFn: async (): Promise<TenantOperationsDataMap[S]> => {
      const contract = getTenantOperationsReadContract(
        section,
        slug!,
        rollout.data?.explicitContextEnabled === true,
      );
      const { data, error } = contract.rpc === "orbit_tenant_ops_read_scoped"
        ? await supabase.rpc(contract.rpc, contract.args)
        : await supabase.rpc(contract.rpc, contract.args);
      if (error) throw error;
      return mapTenantOperationsPayload(section, data);
    },
  });
}

export function useTenantOperationsFeature() {
  const rollout = useTenantOperationsRollout();
  const health = useTenantOperations("health", {
    enabled: rollout.data?.operationsEnabled === true,
    refetchInterval: 60_000,
  });

  return {
    ...health,
    isLoading: rollout.isLoading || (rollout.data?.operationsEnabled === true && health.isLoading),
    isError: rollout.isError || health.isError,
    enabled: rollout.data?.operationsEnabled === true,
  };
}
