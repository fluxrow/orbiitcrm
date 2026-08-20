import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  TenantOperationsDataMap,
  TenantOperationsSection,
  TenantOpsError,
} from "@/lib/tenant-operations-types";

type RpcEnvelope<T> = { ok: true; data: T } | TenantOpsError | T;

function unwrapTenantOps<T>(payload: RpcEnvelope<T>): T {
  if (payload && typeof payload === "object" && "ok" in payload) {
    if (payload.ok === false) {
      const failure = payload as TenantOpsError;
      throw new Error(failure.error?.message || failure.error?.code || "Falha ao consultar o Centro de Operações.");
    }
    if ("data" in payload) return payload.data as T;
  }
  return payload as T;
}

export function useTenantOperations<S extends TenantOperationsSection>(
  section: S,
  options: { enabled?: boolean; refetchInterval?: number | false } = {},
) {
  return useQuery({
    queryKey: ["tenant-operations", section],
    enabled: options.enabled ?? true,
    refetchInterval: options.refetchInterval ?? false,
    staleTime: 30_000,
    retry: 1,
    queryFn: async (): Promise<TenantOperationsDataMap[S]> => {
      const { data, error } = await supabase.rpc("orbit_tenant_ops_read", {
        p_section: section,
      });
      if (error) throw error;
      return unwrapTenantOps<TenantOperationsDataMap[S]>(data as RpcEnvelope<TenantOperationsDataMap[S]>);
    },
  });
}

export function useTenantOperationsFeature() {
  const health = useTenantOperations("health", { refetchInterval: 60_000 });
  return {
    ...health,
    enabled: health.data?.feature_enabled === true,
  };
}
