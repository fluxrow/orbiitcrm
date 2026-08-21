export const TENANT_GOOGLE_CONTEXT_FLAG = "tenant_google_context_wave3_v1";

export class TenantContextError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

type TenantInput = {
  tenant_slug?: unknown;
  empresa_id?: unknown;
};

export async function resolveAuthorizedTenant(
  svc: any,
  userId: string,
  input: TenantInput,
): Promise<{ empresaId: string; tenantSlug: string; explicitContext: boolean }> {
  const tenantSlug = String(input.tenant_slug ?? "").trim();
  const legacyEmpresaId = String(input.empresa_id ?? "").trim();
  if (!tenantSlug && !legacyEmpresaId) {
    throw new TenantContextError(400, "tenant_slug obrigatório");
  }

  let tenantQuery = svc.from("orbit_empresas").select("id,slug");
  tenantQuery = tenantSlug
    ? tenantQuery.eq("slug", tenantSlug)
    : tenantQuery.eq("id", legacyEmpresaId);
  const { data: tenant, error: tenantError } = await tenantQuery.maybeSingle();
  if (tenantError || !tenant) throw new TenantContextError(404, "tenant não encontrado");

  if (tenantSlug && legacyEmpresaId && legacyEmpresaId !== tenant.id) {
    throw new TenantContextError(403, "TENANT_CONTEXT_MISMATCH");
  }

  const [{ data: roles }, { data: peSuper }, { data: profile }, { data: membership }, { data: flag }] =
    await Promise.all([
      svc.from("user_roles").select("role").eq("user_id", userId),
      svc.rpc("pe_is_super_admin", { p_user_id: userId }),
      svc.from("profiles").select("empresa_id").eq("id", userId).maybeSingle(),
      svc.from("user_empresa_memberships").select("empresa_id").eq("user_id", userId)
        .eq("empresa_id", tenant.id).maybeSingle(),
      svc.from("orbit_feature_flags").select("enabled").eq("empresa_id", tenant.id)
        .eq("feature_key", TENANT_GOOGLE_CONTEXT_FLAG).maybeSingle(),
    ]);
  const isSuper = !!peSuper || (roles ?? []).some((r: any) => r.role === "super_admin");
  if (!isSuper && profile?.empresa_id !== tenant.id && !membership) {
    throw new TenantContextError(403, "usuário não pertence à empresa");
  }

  const explicitContext = flag?.enabled === true;
  if (explicitContext && !tenantSlug) {
    throw new TenantContextError(400, "TENANT_SLUG_REQUIRED");
  }

  return { empresaId: tenant.id, tenantSlug: tenant.slug, explicitContext };
}
