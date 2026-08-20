import { supabase } from "@/integrations/supabase/client";

export const TENANT_EXPLICIT_MUTATIONS_WAVE2_FLAG =
  "tenant_explicit_mutations_wave2_v1" as const;

type TenantMutationAction =
  | "update_prospect"
  | "soft_delete_prospect"
  | "update_deal"
  | "move_deal"
  | "soft_delete_deal";

type RunTenantMutationArgs<T> = {
  empresaId: string;
  tenantSlug: string;
  actionType: TenantMutationAction;
  entityId: string;
  payload?: Record<string, unknown>;
  legacy: () => Promise<T>;
};

export async function runTenantMutation<T>({
  empresaId,
  tenantSlug,
  actionType,
  entityId,
  payload = {},
  legacy,
}: RunTenantMutationArgs<T>): Promise<T> {
  const { data: rollout, error: rolloutError } = await supabase
    .from("orbit_feature_flags")
    .select("enabled")
    .eq("empresa_id", empresaId)
    .eq("feature_key", TENANT_EXPLICIT_MUTATIONS_WAVE2_FLAG)
    .maybeSingle();

  if (rolloutError) throw rolloutError;
  if (rollout?.enabled !== true) return legacy();

  const { data, error } = await supabase.rpc("orbit_tenant_entity_mutate_scoped", {
    p_tenant_slug: tenantSlug,
    p_action_type: actionType,
    p_entity_id: entityId,
    p_payload: payload,
  });
  if (error) throw error;
  return (data as any)?.data?.entity as T;
}
