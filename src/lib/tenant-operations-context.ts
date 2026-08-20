export const TENANT_EXPLICIT_CONTEXT_FEATURE_FLAG = "tenant_explicit_context_v1" as const;

export type TenantOperationsReadContract =
  | { rpc: "orbit_tenant_ops_read"; args: { p_section: string } }
  | {
      rpc: "orbit_tenant_ops_read_scoped";
      args: { p_tenant_slug: string; p_section: string };
    };

export function getTenantOperationsReadContract(
  section: string,
  tenantSlug: string,
  explicitContextEnabled: boolean,
): TenantOperationsReadContract {
  if (explicitContextEnabled) {
    return {
      rpc: "orbit_tenant_ops_read_scoped",
      args: { p_tenant_slug: tenantSlug, p_section: section },
    };
  }

  return { rpc: "orbit_tenant_ops_read", args: { p_section: section } };
}
