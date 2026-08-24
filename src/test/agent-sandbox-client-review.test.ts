import { describe, expect, it } from "vitest";
import {
  AGENT_SANDBOX_SCENARIOS,
  countApprovedAgentSandboxScenarios,
  type AgentSandboxReview,
} from "@/lib/agent-sandbox-review";
import fs from "node:fs";
import path from "node:path";

const migrationPath = path.resolve(
  process.cwd(),
  "supabase/migrations/20260824222409_agent_sandbox_client_review.sql",
);
const migration = fs.readFileSync(migrationPath, "utf8");

describe("client-owned Agent Sandbox review", () => {
  it("has five focused scenarios and counts only approvals", () => {
    expect(AGENT_SANDBOX_SCENARIOS).toHaveLength(5);
    const reviews = [
      { scenario_key: "initial_approach", status: "approved" },
      { scenario_key: "qualification", status: "rejected" },
    ] as AgentSandboxReview[];
    expect(countApprovedAgentSandboxScenarios(reviews)).toBe(1);
  });

  it("enables the new feature only for Comunica", () => {
    expect(migration).toContain("e.slug = 'comunica'");
    expect(migration).toContain("('comunica'::text, true)");
    for (const slug of ["fluxrow", "bullink-negocios", "fabrica-de-pesquisadores", "viver-semijoias"]) {
      expect(migration).toContain(`('${slug}'::text, false)`);
    }
  });

  it("prevents the Super Admin from approving for the client", () => {
    expect(migration).toContain("CLIENT_REVIEWER_REQUIRED");
    expect(migration).toContain("tenant_admin_not_super_admin");
  });

  it("stores no transcript and never activates runtime", () => {
    expect(migration).not.toMatch(/\btranscript\s+(text|jsonb)/i);
    expect(migration).toContain("'activates_runtime', false");
    expect(migration).not.toMatch(/UPDATE\s+public\.orbit_ai_config/i);
    expect(migration).not.toMatch(/UPDATE\s+public\.orbit_flows/i);
    expect(migration).not.toMatch(/UPDATE\s+public\.orbit_zapi_config/i);
  });

  it("keeps the table private and exposes only authenticated RPCs", () => {
    expect(migration).toContain(
      "REVOKE ALL ON TABLE public.orbit_agent_sandbox_reviews FROM PUBLIC, anon, authenticated",
    );
    expect(migration).toContain("REJECTION_COMMENT_REQUIRED");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.orbit_save_agent_sandbox_review");
  });
});
