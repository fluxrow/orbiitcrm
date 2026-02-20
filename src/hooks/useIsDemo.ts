import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useIsDemo() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["is-demo", user?.id],
    queryFn: async () => {
      // 1. Get empresa_id from profiles
      const { data: profile } = await supabase
        .from("profiles")
        .select("empresa_id")
        .eq("id", user!.id)
        .maybeSingle();

      if (!profile?.empresa_id) {
        return { isDemo: false, planCode: null, planName: null };
      }

      // 2. Query saas_empresa joined with saas_plans
      const { data: saasEmpresa } = await supabase
        .from("saas_empresa")
        .select("plan_id, plan:saas_plans(code, name)")
        .eq("empresa_id", profile.empresa_id)
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
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // cache 5 min
  });

  return {
    isDemo: query.data?.isDemo ?? false,
    planCode: query.data?.planCode ?? null,
    planName: query.data?.planName ?? null,
    isLoading: query.isLoading,
  };
}
