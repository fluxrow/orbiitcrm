import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(__dirname, path), "utf8");
const page = read("../pages/orbit/CampanhasPage.tsx");
const analytics = read("../hooks/useOrbitEmailAnalytics.ts");
const keys = read("../lib/query-keys.ts");
const migration = read("../../supabase/migrations/20260821180706_tenant_campaign_analytics_context_wave4_part3a.sql");

describe("tenant campaign analytics wave 4.3a", () => {
  it("routes canary analytics through the explicit tenant contract", () => {
    expect(page).toContain('p_section: "recipient_counts"');
    expect(page).toContain("p_tenant_slug: tenantSlug");
    expect(analytics).toContain('"orbit_tenant_campaign_analytics_read"');
    expect(analytics).toContain('section: "email_summary"');
    expect(analytics).toContain('section: "whatsapp_summary"');
    expect(analytics).toContain('section: "timeline"');
    expect(keys).toContain("empresaId ?? null");
  });

  it("validates campaign ownership and filters every recipient aggregate", () => {
    expect(migration).toContain("orbit_tenant_context_authorize");
    expect(migration).toContain("CAMPAIGN_TENANT_MISMATCH");
    expect(migration.match(/empresa_id = v_empresa_id/g)?.length).toBeGreaterThanOrEqual(4);
    expect(migration).toContain("INVALID_TIMELINE_INTERVAL");
  });

  it("keeps rollout canary-only and denies anonymous execution", () => {
    expect(migration).toContain("tenant_campaign_analytics_context_wave4_v1");
    expect(migration).toContain("('fluxrow', true)");
    expect(migration).toContain("('bullink-negocios', false)");
    expect(migration).toContain("('fabrica-de-pesquisadores', false)");
    expect(migration).toContain("('viver-semijoias', false)");
    expect(migration).toContain("FROM PUBLIC, anon");
    expect(migration).toContain("TO authenticated");
  });
});
