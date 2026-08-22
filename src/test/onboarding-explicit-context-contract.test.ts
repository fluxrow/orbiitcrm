import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const hookSource = readFileSync(
  resolve(process.cwd(), "src/hooks/useOrbitOnboarding.ts"),
  "utf8",
);
const migrationSource = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260822144916_tenant_onboarding_context_wave4_part4.sql",
  ),
  "utf8",
);

describe("tenant-scoped onboarding contract", () => {
  it("uses a canary flag and resolves internal reads by tenant slug", () => {
    expect(hookSource).toContain("tenant_onboarding_context_wave4_v1");
    expect(hookSource).toContain("orbit_tenant_onboarding_context_mode");
    expect(hookSource).toContain("orbit_tenant_onboarding_read_scoped");
    expect(hookSource).toContain("p_tenant_slug: tenantSlug");
    expect(migrationSource).toContain("orbit_tenant_context_authorize");
    expect(hookSource).not.toContain("isTenantFeatureEnabled");
    expect(hookSource).toContain('["42883", "PGRST202"]');
  });

  it("routes internal writes through the scoped mutation contract", () => {
    for (const action of [
      "archive_onboarding",
      "update_checklist",
      "update_responses",
      "review_insight",
      "reconcile_asset_reference",
    ]) {
      expect(hookSource).toContain(`"${action}"`);
      expect(migrationSource).toContain(`'${action}'`);
    }
  });

  it("keeps protected tenants disabled and the public-token RPCs untouched", () => {
    for (const slug of [
      "bullink-negocios",
      "fabrica-de-pesquisadores",
      "viver-semijoias",
    ]) {
      expect(migrationSource).toContain(`('${slug}'::text, false)`);
    }
    expect(migrationSource).not.toContain("CREATE OR REPLACE FUNCTION public.get_onboarding_by_token");
    expect(migrationSource).not.toContain("CREATE OR REPLACE FUNCTION public.save_onboarding_responses");
    expect(migrationSource).not.toContain("CREATE OR REPLACE FUNCTION public.submit_onboarding");
  });

  it("does not write PII or onboarding answers into the audit payload", () => {
    expect(migrationSource).toContain("'changed_fields', to_jsonb(v_changed_fields)");
    expect(migrationSource).not.toContain("'payload', p_payload");
    expect(migrationSource).not.toContain("'responses', p_payload->'responses'");
  });
});
