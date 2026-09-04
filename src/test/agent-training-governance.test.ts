import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  countCurrentTrainingApprovals,
  isTrainingDraftPublished,
  type AgentTrainingGovernanceState,
} from "@/lib/agent-training-governance";

const migration = fs.readFileSync(
  path.resolve(process.cwd(), "supabase/migrations/20260831122112_agent_training_governance.sql"),
  "utf8",
);
const bullinkSeed = fs.readFileSync(
  path.resolve(process.cwd(), "supabase/migrations/20260831133326_seed_bullink_training_draft.sql"),
  "utf8",
);
const selfServicePermission = fs.readFileSync(
  path.resolve(process.cwd(), "supabase/migrations/20260904210545_bullink_agent_training_self_service_permission.sql"),
  "utf8",
);
const sandbox = fs.readFileSync(
  path.resolve(process.cwd(), "supabase/functions/orbit-ai-sandbox/index.ts"),
  "utf8",
);
const runtime = fs.readFileSync(
  path.resolve(process.cwd(), "supabase/functions/orbit-ai-agent/index.ts"),
  "utf8",
);
const configHook = fs.readFileSync(
  path.resolve(process.cwd(), "src/hooks/useOrbitConfig.ts"),
  "utf8",
);
const configPage = fs.readFileSync(
  path.resolve(process.cwd(), "src/pages/orbit/ConfigPage.tsx"),
  "utf8",
);

describe("agent training governance", () => {
  it("counts only current approvals and detects unpublished drafts", () => {
    const state = {
      ok: true,
      enabled: true,
      can_edit: true,
      can_publish: true,
      required_scenarios: ["initial_approach", "qualification"],
      draft: { content: "novo", revision: 2, fingerprint: "b".repeat(32) },
      active: { version_id: "v1", version_number: 1, content: "antigo", fingerprint: "a".repeat(32) },
      reviews: [
        { id: "r1", scenario_key: "initial_approach", status: "approved", comment: null, reviewer_id: null, reviewed_at: "2026-08-31T00:00:00Z" },
      ],
      versions: [],
    } as AgentTrainingGovernanceState;
    expect(countCurrentTrainingApprovals(state)).toBe(1);
    expect(isTrainingDraftPublished(state)).toBe(false);
  });

  it("rolls out only to Bullink initially", () => {
    expect(migration).toContain("tenant_agent_training_governance_v1");
    expect(migration).toContain("('bullink-negocios', true)");
    expect(migration).toContain("('comunica', false)");
    expect(migration).toContain("('viver-semijoias', false)");
  });

  it("keeps drafts, reviews and immutable published versions private", () => {
    for (const table of [
      "orbit_agent_training_drafts",
      "orbit_agent_training_reviews",
      "orbit_agent_training_versions",
    ]) {
      expect(migration).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
      expect(migration).toContain(`REVOKE ALL ON TABLE public.${table} FROM PUBLIC, anon, authenticated`);
    }
    expect(migration).toContain("orbit_agent_training_version_immutable");
    expect(migration).toContain("IMMUTABLE_TRAINING_VERSION");
  });

  it("derives authorization and tenant on the server", () => {
    expect(migration).toContain("public.user_has_empresa_access(v_empresa_id)");
    expect(migration).toContain("public.pe_user_is_orbit_admin(p_user_id)");
    expect(migration).toContain("TENANT_ADMIN_REQUIRED");
    expect(migration).toContain("SET search_path = public, pg_temp");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.orbit_agent_training_action");
  });

  it("requires all five reviews for the exact current fingerprint", () => {
    for (const scenario of [
      "initial_approach",
      "qualification",
      "objection_handling",
      "human_handoff",
      "safety_boundaries",
    ]) expect(migration).toContain(scenario);
    expect(migration).toContain("TRAINING_APPROVALS_INCOMPLETE");
    expect(migration).toContain("draft_fingerprint = v_fingerprint");
    expect(migration).toContain("count(DISTINCT scenario_key) = 5");
  });

  it("publishes and rolls back runtime content atomically with an audit record", () => {
    expect(migration).toContain("a.conversion_guidance IS DISTINCT FROM v.content");
    expect(migration).toContain("WHEN 'publish'");
    expect(migration).toContain("WHEN 'rollback'");
    expect(migration).toContain("conversion_guidance = v_content");
    expect(migration).toContain("orbit_agent_training_published");
    expect(migration).toContain("orbit_agent_training_rolled_back");
  });

  it("does not let the ordinary configuration save mutate protected prompts", () => {
    expect(configHook).toContain("PROTECTED_AI_TRAINING_FIELDS");
    expect(configHook).toContain("conversion_guidance");
    expect(configPage).toContain("Prompts-base protegidos pelo Orbit");
    expect(configPage).toContain("AgentTrainingGovernanceCard");
  });

  it("tests the server-loaded draft and injects only published guidance in runtime", () => {
    expect(sandbox).toContain("trainingDraftFingerprint");
    expect(sandbox).toContain("orbit_agent_training_drafts");
    expect(sandbox).toContain("TRAINING_DRAFT_CHANGED");
    expect(runtime).toContain("conversion_guidance");
    expect(runtime).toContain("ORIENTAÇÕES DE CONVERSÃO DO TENANT");
    expect(runtime.indexOf("ORIENTAÇÕES DE CONVERSÃO DO TENANT"))
      .toBeLessThan(runtime.indexOf("REGRAS CRÍTICAS:"));
  });

  it("seeds Bullink only while the governed draft is still the empty baseline", () => {
    expect(bullinkSeed).toContain("slug = 'bullink-negocios'");
    expect(bullinkSeed).toContain("d.content = ''");
    expect(bullinkSeed).toContain("d.fingerprint = md5('')");
    expect(bullinkSeed).toContain("'changes_runtime', false");
  });

  it("supports a narrow tenant-scoped self-service training permission", () => {
    expect(selfServicePermission).toContain("'agent_training_manage'");
    expect(selfServicePermission).toContain("public.user_has_empresa_access(p_empresa_id)");
    expect(selfServicePermission).toContain("p.empresa_id = p_empresa_id");
    expect(selfServicePermission).toContain("p.user_id = p_user_id");
    expect(selfServicePermission).toContain("p.revoked_at IS NULL");
    expect(selfServicePermission).toContain("REVOKE ALL ON FUNCTION public.orbit_agent_training_is_admin");
    expect(selfServicePermission).not.toContain("campaign_dispatch' OR");
    expect(selfServicePermission).not.toContain("UPDATE public.orbit_ai_config");
  });
});
