import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(__dirname, path), "utf8");
const page = read("../pages/orbit/CampanhasPage.tsx");
const analytics = read("../hooks/useOrbitEmailAnalytics.ts");
const dialog = read("../components/orbit/CampaignAnalyticsDialog.tsx");
const keys = read("../lib/query-keys.ts");
const migration = read("../../supabase/migrations/20260821180706_tenant_campaign_analytics_context_wave4_part3a.sql");
const whatsappMigration = read("../../supabase/migrations/20260821182517_tenant_campaign_whatsapp_summary_alignment_wave4_part3a.sql");

describe("tenant campaign analytics wave 4.3a", () => {
  it("routes canary analytics through the explicit tenant contract", () => {
    expect(page).toContain('p_section: "recipient_counts"');
    expect(page).toContain("p_tenant_slug: tenantSlug");
    expect(analytics).toContain('"orbit_tenant_campaign_analytics_read"');
    expect(analytics).toContain('section: "email_summary"');
    expect(analytics).toContain('section: "whatsapp_summary"');
    expect(analytics).toContain('"orbit_tenant_campaign_whatsapp_summary_read"');
    expect(analytics).toContain('section: "timeline"');
    expect(analytics).toContain('.eq("empresa_id", empresaId!)');
    expect(analytics).not.toContain('"get_whatsapp_campaign_summary"');
    expect(keys).toContain("empresaId ?? null");
  });

  it("aligns WhatsApp totals to the tenant recipient ledger", () => {
    expect(whatsappMigration).toContain("orbit_tenant_context_authorize");
    expect(whatsappMigration).toContain("r.empresa_id = v_empresa_id");
    expect(whatsappMigration).toContain("r.campaign_id = p_campaign_id");
    expect(whatsappMigration).toContain("FROM PUBLIC, anon");
  });

  it("renders channel-specific analytics without inventing WhatsApp telemetry", () => {
    expect(page).toContain("canal: c.canal");
    expect(page).toContain("campaignCanal={analyticsCampaign?.canal}");
    expect(dialog).toContain('campaignCanal?: string');
    expect(dialog).toContain('campaignCanal === "whatsapp"');
    expect(dialog).toContain('label="Pendentes"');
    expect(dialog).toContain("Leituras e respostas ainda não possuem telemetria persistida por campanha");
    expect(dialog).not.toContain('label="Lidos"');
    expect(dialog).not.toContain('label="Respostas"');
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
