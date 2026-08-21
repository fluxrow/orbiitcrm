import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(__dirname, path), "utf8");
const campaigns = read("../hooks/useOrbitCampaigns.ts");
const config = read("../hooks/useOrbitConfig.ts");
const recipients = read("../components/orbit/RecipientSelector.tsx");
const analytics = read("../hooks/useOrbitEmailAnalytics.ts");
const exportDialog = read("../components/orbit/CampaignAnalyticsDialog.tsx");
const migration = read("../../supabase/migrations/20260821173909_tenant_explicit_config_campaign_reads_wave4_part2.sql");

describe("tenant config and campaign reads wave 4.2", () => {
  it("scopes campaign realtime and recipient reads", () => {
    expect(campaigns).toContain("orbit_campaigns_realtime:${empresaId}");
    expect(campaigns.match(/filter: `empresa_id=eq\.\$\{empresaId\}`/g)).toHaveLength(2);
    expect(recipients).toContain('["company-profiles-for-filter", tenantEmpresaId]');
    expect(recipients).toContain('.eq("empresa_id", tenantEmpresaId!)');
    expect(analytics).toContain('["orbit_campaign_recipients_page", empresaId');
    expect(exportDialog).toContain('.eq("empresa_id", empresaId)');
  });

  it("scopes distribution config by route tenant", () => {
    expect(config).toContain('["orbit_distribuicao_config", empresaId]');
    expect(config).toContain('.eq("empresa_id", empresaId!)');
  });

  it("adds eight canary-only read policies with restricted helper grants", () => {
    expect(migration.match(/CREATE POLICY tenant_explicit_config_campaign_read_wave4/g)).toHaveLength(8);
    expect(migration).toContain("tenant_explicit_config_campaign_reads_wave4_v1");
    expect(migration).toContain("public.user_has_empresa_access(p_empresa_id)");
    expect(migration).toContain("FROM PUBLIC, anon");
    expect(migration).toContain("('bullink-negocios', false)");
    expect(migration).toContain("('fabrica-de-pesquisadores', false)");
    expect(migration).toContain("('viver-semijoias', false)");
  });
});
