import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const manager = readFileSync(
  resolve(__dirname, "../components/orbit/FlowTemplatesManager.tsx"),
  "utf8",
);

const migration = readFileSync(
  resolve(
    __dirname,
    "../../supabase/migrations/20260831155440_fix_ai_config_safe_read_grants.sql",
  ),
  "utf8",
);

describe("flow template agent references", () => {
  it("never queries nonexistent agent registry columns from orbit_ai_config", () => {
    expect(manager).not.toContain('.select("agent_slug, nome_agente")');
    expect(manager).toContain("inspectFlowDefinition(template.definicao).usedAgentSlugs");
  });

  it("keeps AI config browser reads column-scoped and secrets unavailable", () => {
    expect(migration).toContain("REVOKE SELECT ON TABLE public.orbit_ai_config");
    expect(migration).toContain("conversion_guidance");
    expect(migration).toContain("canonical_field_aliases");
    expect(migration).not.toMatch(/GRANT SELECT[\s\S]*tts_api_key/i);
  });
});
