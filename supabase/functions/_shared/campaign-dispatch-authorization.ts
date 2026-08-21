export interface CampaignDispatchClaim {
  allowed: boolean;
  gate_enabled: boolean;
  mode?: string;
  reason?: string;
  authorization_id?: string;
}

export async function claimCampaignDispatchAuthorization(
  supabase: any,
  campaignId: string,
): Promise<CampaignDispatchClaim> {
  const { data, error } = await supabase.rpc("orbit_campaign_dispatch_claim", {
    p_campaign_id: campaignId,
  });
  if (error) throw error;
  const claim = (data ?? {}) as CampaignDispatchClaim;
  if (claim.allowed !== true) {
    return {
      ...claim,
      allowed: false,
      gate_enabled: claim.gate_enabled === true,
      reason: claim.reason || "CAMPAIGN_DISPATCH_AUTHORIZATION_REQUIRED",
    };
  }
  return claim;
}
