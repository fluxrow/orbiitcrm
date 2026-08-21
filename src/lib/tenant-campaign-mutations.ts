import { supabase } from "@/integrations/supabase/client";
import { isTenantFeatureEnabled } from "@/lib/tenant-explicit-mutations";

export const TENANT_CAMPAIGN_MUTATIONS_WAVE4_FLAG = "tenant_campaign_mutations_wave4_v1";

export type TenantCampaignAction =
  | "save_draft"
  | "populate_recipients"
  | "mark_in_review"
  | "approve_campaign"
  | "pause_campaign"
  | "cancel_campaign";

export async function runTenantCampaignAction(args: {
  empresaId: string;
  tenantSlug: string;
  action: TenantCampaignAction;
  campaignId?: string | null;
  payload?: Record<string, unknown>;
}) {
  const enabled = await isTenantFeatureEnabled(args.empresaId, TENANT_CAMPAIGN_MUTATIONS_WAVE4_FLAG);
  if (!enabled) return null;
  const { data, error } = await (supabase.rpc as any)("orbit_tenant_campaign_mutate_scoped", {
    p_tenant_slug: args.tenantSlug,
    p_action_type: args.action,
    p_campaign_id: args.campaignId ?? null,
    p_payload: args.payload ?? {},
  });
  if (error) throw error;
  return (data as any)?.data ?? null;
}

export async function runTenantCampaignCreateAtomic(args: {
  empresaId: string;
  tenantSlug: string;
  payload: Record<string, unknown>;
  expectedRecipientCount?: number | null;
}) {
  const enabled = await isTenantFeatureEnabled(args.empresaId, TENANT_CAMPAIGN_MUTATIONS_WAVE4_FLAG);
  if (!enabled) return null;
  const { data, error } = await (supabase.rpc as any)("orbit_tenant_campaign_create_atomic_scoped", {
    p_tenant_slug: args.tenantSlug,
    p_payload: args.payload,
    p_expected_recipient_count: args.expectedRecipientCount ?? null,
  });
  if (error) throw error;
  return (data as any)?.data ?? null;
}
