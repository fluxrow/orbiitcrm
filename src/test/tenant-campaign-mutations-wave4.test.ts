import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(__dirname, path), "utf8");
const migration = read("../../supabase/migrations/20260821183043_tenant_campaign_mutations_wave4_part3b.sql");
const atomicMigration = read("../../supabase/migrations/20260821184552_tenant_campaign_atomic_draft_wave4_part3b.sql");
const dispatchPreflight = read("../../supabase/migrations/20260821185359_tenant_campaign_dispatch_preflight_wave4_part3c.sql");
const dispatchEnforcement = read("../../supabase/migrations/20260821190307_tenant_campaign_dispatch_shadow_enforcement_wave4_part3c.sql");
const sendCampaign = read("../../supabase/functions/send-orbit-campaign/index.ts");
const campaignScheduler = read("../../supabase/functions/orbit-campaign-scheduler-tick/index.ts");
const dispatchHelper = read("../../supabase/functions/_shared/campaign-dispatch-authorization.ts");
const conversationPolicyFix = read("../../supabase/migrations/20260821190925_fix_conversas_update_policy_membership_check.sql");
const directWriteGate = read("../../supabase/migrations/20260821191858_tenant_campaign_direct_write_gate_wave4_part3d.sql");
const granularPermissions = read("../../supabase/migrations/20260821192811_tenant_campaign_granular_permissions_wave4_part3e.sql");
const helper = read("../lib/tenant-campaign-mutations.ts");
const campaigns = read("../hooks/useOrbitCampaigns.ts");
const campaignsPage = read("../pages/orbit/CampanhasPage.tsx");
const wizard = read("../components/orbit/CampaignWizardContent.tsx");
const review = read("../components/orbit/CampaignReviewDialog.tsx");
const permissionsHook = read("../hooks/useTenantCampaignPermissions.ts");
const permissionsDialog = read("../components/orbit/CampaignPermissionsDialog.tsx");
const configUsers = read("../components/orbit/ConfigUsersTab.tsx");
const configPage = read("../pages/orbit/ConfigPage.tsx");

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

  it("keeps the dispatch authorization foundation inactive and private", () => {
    expect(dispatchPreflight).toContain("tenant_campaign_dispatch_gate_wave4_v1");
    expect(dispatchPreflight).toContain("'fluxrow','bullink-negocios','fabrica-de-pesquisadores','viver-semijoias'");
    expect(dispatchPreflight).toContain("AND f.enabled");
    expect(dispatchPreflight).toContain("CAMPAIGN_DISPATCH_GATE_MUST_START_DISABLED");
    expect(dispatchPreflight).toContain("orbit_campaign_dispatch_authorizations");
    expect(dispatchPreflight).toContain("ENABLE ROW LEVEL SECURITY");
    expect(dispatchPreflight).toContain("FROM PUBLIC,anon,authenticated");
    expect(dispatchPreflight).toContain("orbit_tenant_campaign_dispatch_preflight_scoped");
    expect(dispatchPreflight).toContain("'dispatch_gate_active',false");
    expect(dispatchPreflight).not.toContain("send-orbit-campaign");
  });

  it("enforces authorization server-side while the rollout remains inert", () => {
    expect(dispatchEnforcement).toContain("CAMPAIGN_DISPATCH_GATE_MUST_REMAIN_DISABLED");
    expect(dispatchEnforcement).toContain("IF NOT v_gate_enabled THEN");
    expect(dispatchEnforcement).toContain("'mode','shadow_legacy'");
    expect(dispatchEnforcement).toContain("FOR UPDATE SKIP LOCKED");
    expect(dispatchEnforcement).toContain("SET status='consumed'");
    expect(dispatchEnforcement).toContain("FROM PUBLIC,anon,authenticated");
    expect(dispatchEnforcement).toContain("TO service_role");
    expect(dispatchHelper).toContain('"orbit_campaign_dispatch_claim"');
    expect(sendCampaign).toContain("claimCampaignDispatchAuthorization");
    expect(sendCampaign.indexOf("claimCampaignDispatchAuthorization(supabase, campaign_id)"))
      .toBeLessThan(sendCampaign.indexOf('update({ status: "enviando" })'));
    expect(campaignScheduler).toContain('update({ status: "agendada" })');
  });

  it("does not authorize conversation reassignment from a JWT tenant claim", () => {
    expect(conversationPolicyFix).toContain('DROP POLICY IF EXISTS "Users can update own empresa conversas"');
    expect(conversationPolicyFix).toContain("USING (public.user_has_empresa_access(empresa_id))");
    expect(conversationPolicyFix).toContain("WITH CHECK (public.user_has_empresa_access(empresa_id))");
    expect(conversationPolicyFix).not.toContain("auth.jwt()");
    expect(conversationPolicyFix).not.toContain("app_metadata");
  });

  it("closes direct campaign DML only after the tenant enters the scoped RPC rollout", () => {
    expect(directWriteGate).toContain("orbit_campaign_direct_write_allowed");
    expect(directWriteGate).toContain("tenant_campaign_mutations_wave4_v1");
    expect(directWriteGate).toContain("AND f.enabled = true");
    expect(directWriteGate).toContain('DROP POLICY IF EXISTS "PE members can insert own empresa campaigns"');
    expect(directWriteGate).toContain('DROP POLICY IF EXISTS "Users can manage own empresa recipients"');
    expect(directWriteGate).toContain('DROP POLICY IF EXISTS "Users can insert own empresa approvals"');
    expect(directWriteGate).toContain("FOR INSERT TO authenticated");
    expect(directWriteGate).toContain("WITH CHECK (");
    expect(directWriteGate).toContain("FROM PUBLIC, anon");
    expect(directWriteGate).toContain("TO authenticated");
  });

  it("authorizes each campaign lifecycle action with a distinct tenant permission", () => {
    expect(granularPermissions).toContain("orbit_tenant_user_permissions");
    expect(granularPermissions).toContain("'campaign_create'");
    expect(granularPermissions).toContain("'campaign_edit'");
    expect(granularPermissions).toContain("'campaign_submit_review'");
    expect(granularPermissions).toContain("'campaign_approve'");
    expect(granularPermissions).toContain("'campaign_dispatch'");
    expect(granularPermissions).toContain("orbit_tenant_campaign_authorize");
    expect(granularPermissions).toContain("p_tenant_slug, p_action_type, p_campaign_id");
    expect(granularPermissions).toContain("CAMPAIGN_PERMISSION_DENIED:");
    expect(granularPermissions).toContain("orbit_get_tenant_campaign_capabilities");
    expect(granularPermissions).toContain("orbit_set_tenant_campaign_permission");
    expect(granularPermissions).toContain("TARGET_USER_NOT_IN_TENANT");
    expect(granularPermissions).toContain("campaign_permission_granted");
    expect(granularPermissions).toContain("campaign_permission_revoked");
    expect(granularPermissions).toContain("ENABLE ROW LEVEL SECURITY");
    expect(granularPermissions).toContain("FROM PUBLIC, anon");
    expect(granularPermissions).toContain("TO authenticated");
  });

  it("renders and enforces the granular permissions in the canary UI", () => {
    expect(permissionsHook).toContain("orbit_get_tenant_campaign_capabilities");
    expect(permissionsHook).toContain("orbit_set_tenant_campaign_permission");
    expect(permissionsDialog).toContain("Não libera envio real sozinho");
    expect(configUsers).toContain('slug === "fluxrow"');
    expect(configUsers).toContain("CampaignPermissionsDialog");
    expect(configPage).toContain("isOrgAdmin || isSuperAdmin");
    expect(campaignsPage).toContain("useTenantCampaignCapabilities");
    expect(campaignsPage).toContain("canDispatch={canDispatchCampaign}");
    expect(review).toContain("canApprove &&");
    expect(review).toContain("canEditRecipients &&");
  });
});
