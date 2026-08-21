import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { isTenantFeatureEnabled } from "@/lib/tenant-explicit-mutations";
import { TENANT_CAMPAIGN_MUTATIONS_WAVE4_FLAG } from "@/lib/tenant-campaign-mutations";
import { toast } from "sonner";

export const campaignPermissionKeys = ["campaign_create", "campaign_edit", "campaign_submit_review", "campaign_approve", "campaign_dispatch"] as const;
export type CampaignPermissionKey = typeof campaignPermissionKeys[number];
export type CampaignCapabilities = Record<CampaignPermissionKey, boolean>;

export function useTenantCampaignCapabilities() {
  const { empresaId, slug } = useTenant();
  return useQuery({
    queryKey: ["tenant-campaign-capabilities", empresaId, slug], enabled: !!empresaId && !!slug,
    queryFn: async (): Promise<CampaignCapabilities | null> => {
      if (!await isTenantFeatureEnabled(empresaId!, TENANT_CAMPAIGN_MUTATIONS_WAVE4_FLAG)) return null;
      const { data, error } = await (supabase.rpc as any)("orbit_get_tenant_campaign_capabilities", { p_tenant_slug: slug });
      if (error) throw error;
      return data as CampaignCapabilities;
    },
  });
}

export function useTenantCampaignPermissionGrants() {
  const { empresaId } = useTenant();
  return useQuery({
    queryKey: ["tenant-campaign-permission-grants", empresaId], enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("orbit_tenant_user_permissions").select("user_id,permission_key,revoked_at").eq("empresa_id", empresaId!);
      if (error) throw error;
      return (data || []) as Array<{ user_id: string; permission_key: CampaignPermissionKey; revoked_at: string | null }>;
    },
  });
}

export function useSetTenantCampaignPermission() {
  const { empresaId, slug } = useTenant();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, permissionKey, granted }: { userId: string; permissionKey: CampaignPermissionKey; granted: boolean }) => {
      if (!empresaId || !slug) throw new Error("Contexto do tenant indisponível");
      const { data, error } = await (supabase.rpc as any)("orbit_set_tenant_campaign_permission", { p_tenant_slug: slug, p_user_id: userId, p_permission_key: permissionKey, p_granted: granted });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tenant-campaign-permission-grants", empresaId] });
      toast.success("Permissão de campanha atualizada");
    },
    onError: (error: any) => toast.error(error.message || "Não foi possível atualizar a permissão"),
  });
}
