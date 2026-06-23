import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";

export function useIsDemo() {
  const { empresaId } = useTenant();

  const query = useQuery({
    queryKey: ["is-demo", empresaId],
    queryFn: async () => {
      if (!empresaId) {
        return { isDemo: false, planCode: null, planName: null };
      }

      const { data: saasEmpresa } = await supabase
        .from("saas_empresa")
        .select("plan_id, plan:saas_plans(code, name)")
        .eq("empresa_id", empresaId)
        .maybeSingle();

      if (!saasEmpresa?.plan) {
        return { isDemo: false, planCode: null, planName: null };
      }

      const plan = saasEmpresa.plan as unknown as { code: string; name: string };

      return {
        isDemo: plan.code === "demo",
        planCode: plan.code,
        planName: plan.name,
      };
    },
    enabled: !!empresaId,
    staleTime: 5 * 60 * 1000,
  });

  return {
    isDemo: query.data?.isDemo ?? false,
    planCode: query.data?.planCode ?? null,
    planName: query.data?.planName ?? null,
    isLoading: query.isLoading,
  };
}
