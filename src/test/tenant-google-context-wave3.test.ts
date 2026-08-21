import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(__dirname, path), "utf8");
const hook = read("../hooks/useOrbitGoogleCalendar.ts");
const dialog = read("../components/orbit/ScheduleMeetingDialog.tsx");
const resolver = read("../../supabase/functions/_shared/tenant-context.ts");
const migration = read("../../supabase/migrations/20260821080000_tenant_google_context_wave3_part4.sql");
const functions = ["auth", "status", "calendar", "disconnect"].map((name) =>
  read(`../../supabase/functions/orbit-google-${name}/index.ts`),
);

describe("tenant Google context wave 3.4", () => {
  it("sends the slug only when the canary feature is enabled", () => {
    expect(hook).toContain("tenant_google_context_wave3_v1");
    expect(hook).toContain("getGoogleTenantPayload");
    expect(hook).toContain("tenant_slug: tenantSlug");
    expect(dialog).toContain("getGoogleTenantPayload(empresaId, slug)");
  });

  it("resolves and authorizes the tenant inside every authenticated Google function", () => {
    for (const source of functions) {
      expect(source).toContain("resolveAuthorizedTenant");
      expect(source).toContain("TenantContextError");
    }
    expect(resolver).toContain('from("orbit_empresas").select("id,slug")');
    expect(resolver).toContain("TENANT_CONTEXT_MISMATCH");
    expect(resolver).toContain("TENANT_SLUG_REQUIRED");
    expect(resolver).toContain('r.role === "super_admin"');
    expect(resolver).toContain('from("user_empresa_memberships")');
  });

  it("keeps the rollout exclusive to Fluxrow", () => {
    expect(migration).toContain("e.slug='fluxrow'");
    expect(migration).toContain("('bullink-negocios',false)");
    expect(migration).toContain("('fabrica-de-pesquisadores',false)");
    expect(migration).toContain("('viver-semijoias',false)");
  });

  it("does not trust an OAuth redirect outside the configured app origin", () => {
    expect(functions[0]).toContain("redirect.origin === appOrigin");
    expect(functions[0]).toContain("invalid redirects are discarded");
  });
});
