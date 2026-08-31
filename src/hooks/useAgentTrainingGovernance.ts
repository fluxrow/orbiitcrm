import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { EMPTY_AGENT_TRAINING_STATE, type AgentTrainingGovernanceState } from "@/lib/agent-training-governance";
import type { AgentSandboxScenarioKey } from "@/lib/agent-sandbox-review";

type TrainingAction =
  | { action: "save_draft"; content: string }
  | {
      action: "review";
      draftFingerprint: string;
      scenarioKey: AgentSandboxScenarioKey;
      status: "approved" | "rejected";
      comment?: string;
    }
  | { action: "publish"; draftFingerprint: string; changelog: string }
  | { action: "rollback"; versionId: string };

export function useAgentTrainingGovernance(tenantSlug?: string | null) {
  return useQuery({
    queryKey: ["agent-training-governance", tenantSlug],
    enabled: Boolean(tenantSlug),
    queryFn: async () => {
      const { data, error } = await supabase.rpc("orbit_agent_training_read", {
        p_tenant_slug: tenantSlug,
      });
      // Code-first deployment remains fail-closed until the additive migration exists.
      if (error && ["42883", "PGRST202"].includes(error.code ?? "")) {
        return EMPTY_AGENT_TRAINING_STATE;
      }
      if (error) throw error;
      const state = (data ?? {}) as unknown as Partial<AgentTrainingGovernanceState>;
      return { ...EMPTY_AGENT_TRAINING_STATE, ...state } as AgentTrainingGovernanceState;
    },
  });
}

export function useAgentTrainingAction(tenantSlug?: string | null) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: TrainingAction) => {
      if (!tenantSlug) throw new Error("Tenant não identificado.");
      let payload: Record<string, unknown>;
      switch (input.action) {
        case "save_draft":
          payload = { content: input.content };
          break;
        case "review":
          payload = {
            draft_fingerprint: input.draftFingerprint,
            scenario_key: input.scenarioKey,
            status: input.status,
            comment: input.comment?.trim() || null,
          };
          break;
        case "publish":
          payload = {
            draft_fingerprint: input.draftFingerprint,
            changelog: input.changelog.trim(),
          };
          break;
        case "rollback":
          payload = { version_id: input.versionId };
          break;
      }
      const { data, error } = await supabase.rpc("orbit_agent_training_action", {
        p_tenant_slug: tenantSlug,
        p_action: input.action,
        p_payload: payload as unknown as Json,
      });
      if (error) throw error;
      const result = data as unknown as {
        ok?: boolean;
        action?: TrainingAction["action"];
        changes_runtime?: boolean;
      };
      if (!result?.ok) throw new Error("A operação não foi confirmada pelo servidor.");
      return result as { ok: true; action: TrainingAction["action"]; changes_runtime: boolean };
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["agent-training-governance", tenantSlug] }),
        queryClient.invalidateQueries({ queryKey: ["orbit_ai_config"] }),
      ]);
    },
  });
}
