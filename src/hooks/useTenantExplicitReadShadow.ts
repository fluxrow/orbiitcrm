import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTenant } from "@/contexts/TenantContext";
import { supabase } from "@/integrations/supabase/client";
import { compareFunnelShadow, compareProspectShadow } from "@/lib/tenant-shadow-comparison";

export const TENANT_EXPLICIT_READS_WAVE1_FLAG = "tenant_explicit_reads_wave1_v1" as const;

function useWave1Enabled() {
  const { empresaId, slug } = useTenant();
  return useQuery({
    queryKey: ["tenant-explicit-reads-wave1", empresaId, slug],
    enabled: !!empresaId && !!slug,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orbit_feature_flags")
        .select("enabled")
        .eq("empresa_id", empresaId!)
        .eq("feature_key", TENANT_EXPLICIT_READS_WAVE1_FLAG)
        .maybeSingle();
      if (error) throw error;
      return data?.enabled === true;
    },
  });
}

export function useProspectReadShadow(
  prospectId: string | undefined,
  legacyProspect: any,
  legacyReady: boolean,
) {
  const { empresaId, slug } = useTenant();
  const rollout = useWave1Enabled();
  const shadow = useQuery({
    queryKey: ["tenant-shadow", "prospect", empresaId, slug, prospectId],
    enabled: !!empresaId && !!slug && !!prospectId && legacyReady && rollout.data === true,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("orbit_tenant_prospect_read_scoped", {
        p_tenant_slug: slug!,
        p_prospect_id: prospectId!,
      });
      if (error) throw error;
      return (data as any)?.data?.prospect ?? null;
    },
  });

  useEffect(() => {
    if (!shadow.isSuccess || !empresaId) return;
    const result = compareProspectShadow(legacyProspect ?? null, shadow.data ?? null, empresaId);
    if (!result.matches) {
      console.warn("[tenant-shadow-mismatch]", {
        resource: "prospect_detail",
        legacy_count: result.legacyCount,
        scoped_count: result.scopedCount,
      });
    }
  }, [empresaId, legacyProspect, shadow.data, shadow.isSuccess]);
}

export function useFunnelReadShadow(legacyStages: any[] | undefined, legacyReady: boolean) {
  const { empresaId, slug } = useTenant();
  const rollout = useWave1Enabled();
  const shadow = useQuery({
    queryKey: ["tenant-shadow", "funnel", empresaId, slug],
    enabled: !!empresaId && !!slug && legacyReady && rollout.data === true,
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("orbit_tenant_funnel_read_scoped", {
        p_tenant_slug: slug!,
      });
      if (error) throw error;
      return ((data as any)?.data?.stages ?? []) as any[];
    },
  });

  useEffect(() => {
    if (!shadow.isSuccess) return;
    const result = compareFunnelShadow(legacyStages, shadow.data);
    if (!result.matches) {
      console.warn("[tenant-shadow-mismatch]", {
        resource: "funnel_snapshot",
        legacy_count: result.legacyCount,
        scoped_count: result.scopedCount,
      });
    }
  }, [legacyStages, shadow.data, shadow.isSuccess]);
}
