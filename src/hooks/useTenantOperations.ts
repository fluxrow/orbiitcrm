import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  TenantOperationsDataMap,
  TenantOperationsSection,
} from "@/lib/tenant-operations-types";
import { mapTenantOperationsPayload } from "@/lib/tenant-operations-mappers";
import { useTenant } from "@/contexts/TenantContext";

export function useTenantOperations<S extends TenantOperationsSection>(
  section: S,
  options: { enabled?: boolean; refetchInterval?: number | false } = {},
) {
  const { empresaId } = useTenant();
  return useQuery({
    queryKey: ["tenant-operations", empresaId, section],
    enabled: !!empresaId && (options.enabled ?? true),
    refetchInterval: options.refetchInterval ?? false,
    staleTime: 30_000,
    retry: 1,
    queryFn: async (): Promise<TenantOperationsDataMap[S]> => {
      const { data, error } = await supabase.rpc("orbit_tenant_ops_read", {
        p_section: section,
      });
      if (error) throw error;
      return mapTenantOperationsPayload(section, data);
    },
  });
}

export function useTenantOperationsFeature() {
  const { empresaId } = useTenant();
  const health = useTenantOperations("health", { refetchInterval: 60_000 });
  const flag = useQuery({
    queryKey: ["tenant-operations-feature", empresaId],
    enabled: !!empresaId,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orbit_feature_flags")
        .select("enabled")
        .eq("empresa_id", empresaId!)
        .eq("feature_key", "tenant_operations_center_v1")
        .maybeSingle();
      if (error) throw error;
      return data?.enabled === true;
    },
  });

  return {
    ...health,
    isLoading: health.isLoading || flag.isLoading,
    isError: health.isError || flag.isError,
    enabled: flag.data === true,
  };
}
