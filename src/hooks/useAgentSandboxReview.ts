import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  AgentSandboxReviewState,
  AgentSandboxReviewStatus,
  AgentSandboxScenarioKey,
} from "@/lib/agent-sandbox-review";

const EMPTY_STATE: AgentSandboxReviewState = {
  enabled: false,
  can_review: false,
  reviewer_requirement: "tenant_admin_not_super_admin",
  reviews: [],
};

export function useAgentSandboxReview(tenantSlug?: string | null) {
  return useQuery({
    queryKey: ["agent-sandbox-review", tenantSlug],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("orbit_get_agent_sandbox_review", {
        p_tenant_slug: tenantSlug,
      });
      // Code-first rollout: the panel remains hidden until the additive RPC is deployed.
      if (error && ["42883", "PGRST202"].includes(error.code ?? "")) return EMPTY_STATE;
      if (error) throw error;
      return { ...EMPTY_STATE, ...(data ?? {}) } as AgentSandboxReviewState;
    },
  });
}

export function useSaveAgentSandboxReview(tenantSlug?: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      scenarioKey: AgentSandboxScenarioKey;
      status: AgentSandboxReviewStatus;
      comment?: string;
    }) => {
      if (!tenantSlug) throw new Error("Tenant não identificado.");
      const { data, error } = await (supabase.rpc as any)("orbit_save_agent_sandbox_review", {
        p_tenant_slug: tenantSlug,
        p_scenario_key: input.scenarioKey,
        p_status: input.status,
        p_comment: input.comment?.trim() || null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["agent-sandbox-review", tenantSlug] }),
  });
}
