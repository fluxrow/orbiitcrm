import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(__dirname, path), "utf8");
const migration = read("../../supabase/migrations/20260821183043_tenant_campaign_mutations_wave4_part3b.sql");
const atomicMigration = read("../../supabase/migrations/20260821184552_tenant_campaign_atomic_draft_wave4_part3b.sql");
const helper = read("../lib/tenant-campaign-mutations.ts");
const campaigns = read("../hooks/useOrbitCampaigns.ts");
const wizard = read("../components/orbit/CampaignWizardContent.tsx");
const review = read("../components/orbit/CampaignReviewDialog.tsx");

describe("tenant campaign mutations wave 4.3b", () => {
  it("keeps the rollout canary-only and dispatch outside the contract", () => {
    expect(migration).toContain("tenant_campaign_mutations_wave4_v1");
    expect(migration).toContain("('fluxrow',true)");
    expect(migration).toContain("('bullink-negocios',false)");
    expect(migration).toContain("('fabrica-de-pesquisadores',false)");
    expect(migration).toContain("('viver-semijoias',false)");
    expect(migration).toContain("REAL_DISPATCH_NOT_ALLOWED");
  });

  it("authorizes by slug, validates ownership and restricts execution grants", () => {
    expect(migration).toContain("orbit_tenant_mutation_authorize");
    expect(migration).toContain("c.empresa_id=v_empresa_id");
    expect(migration).toContain("FROM PUBLIC,anon");
    expect(migration).toContain("TO authenticated");
  });

  it("routes canary writes and recipient population through the scoped RPC", () => {
    expect(helper).toContain('"orbit_tenant_campaign_mutate_scoped"');
    expect(helper).toContain('"orbit_tenant_campaign_create_atomic_scoped"');
    expect(campaigns).toContain("runTenantCampaignAction");
    expect(wizard).toContain("runTenantCampaignCreateAtomic");
    expect(review).toContain('action: "populate_recipients"');
    expect(migration).not.toContain("public.pe_populate_campaign_recipients(p_campaign_id)");
    expect(migration).toContain("public.preview_campaign_recipients(v_empresa_id");
  });

  it("rolls draft creation and recipient population into one database transaction", () => {
    expect(atomicMigration).toContain("orbit_tenant_campaign_create_atomic_scoped");
    expect(atomicMigration).toContain("'save_draft'");
    expect(atomicMigration).toContain("'populate_recipients'");
    expect(atomicMigration).toContain("'campaign', v_populated #> '{data,campaign}'");
    expect(atomicMigration).not.toContain("CAMPAIGN_RECIPIENT_COUNT_MISMATCH");
    expect(atomicMigration).toContain("FROM PUBLIC, anon");
    expect(atomicMigration).toContain("TO authenticated");
    expect(atomicMigration).not.toContain("dispatch_campaign");
  });

  it("records sanitized audit metadata for every accepted action", () => {
    expect(migration).toContain("INSERT INTO public.orbit_audit_log");
    expect(migration).toContain("'payload_keys'");
    expect(migration).not.toContain("'payload',p_payload");
  });
});
