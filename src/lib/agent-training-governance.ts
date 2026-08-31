import { AGENT_SANDBOX_SCENARIOS, type AgentSandboxScenarioKey } from "@/lib/agent-sandbox-review";

export interface AgentTrainingReview {
  id: string;
  scenario_key: AgentSandboxScenarioKey;
  status: "approved" | "rejected";
  comment: string | null;
  reviewer_id: string | null;
  reviewed_at: string;
}

export interface AgentTrainingVersion {
  id: string;
  version_number: number;
  fingerprint: string;
  changelog: string;
  is_active: boolean;
  published_by: string | null;
  published_at: string;
}

export interface AgentTrainingGovernanceState {
  ok: true;
  enabled: boolean;
  can_edit: boolean;
  can_publish: boolean;
  required_scenarios: AgentSandboxScenarioKey[];
  draft?: {
    content: string;
    revision: number;
    fingerprint: string;
    updated_at?: string | null;
  };
  active?: {
    version_id: string | null;
    version_number: number | null;
    content: string;
    fingerprint: string | null;
    published_at?: string | null;
  };
  reviews: AgentTrainingReview[];
  versions: AgentTrainingVersion[];
}

export const EMPTY_AGENT_TRAINING_STATE: AgentTrainingGovernanceState = {
  ok: true,
  enabled: false,
  can_edit: false,
  can_publish: false,
  required_scenarios: AGENT_SANDBOX_SCENARIOS.map((scenario) => scenario.key),
  reviews: [],
  versions: [],
};

export function countCurrentTrainingApprovals(state?: AgentTrainingGovernanceState | null): number {
  if (!state?.enabled) return 0;
  return state.required_scenarios.filter((scenario) =>
    state.reviews.some((review) => review.scenario_key === scenario && review.status === "approved"),
  ).length;
}

export function isTrainingDraftPublished(state?: AgentTrainingGovernanceState | null): boolean {
  return Boolean(
    state?.draft?.fingerprint &&
      state.active?.fingerprint &&
      state.draft.fingerprint === state.active.fingerprint,
  );
}
