import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("tenant operational invitations", () => {
  const createInvite = read("supabase/functions/create-empresa-invite/index.ts");
  const acceptInvite = read("supabase/functions/accept-empresa-invite/index.ts");
  const validateInvite = read("supabase/functions/validate-invite/index.ts");
  const manageDialog = read("src/components/pe-admin/SaasManageDialog.tsx");

  it("keeps operational invitations restricted to the Fluxrow canary and feature flag", () => {
    expect(createInvite).toContain('empresa.slug !== "fluxrow"');
    expect(createInvite).toContain('"tenant_operations_center_v1"');
    expect(acceptInvite).toContain('empresaScope?.slug !== "fluxrow"');
  });

  it("never grants a global admin role to an operational invite", () => {
    expect(acceptInvite).toContain("if (!isOperatorInvite)");
    expect(acceptInvite).toContain('role: isOperatorInvite ? membershipRole : "admin"');
    expect(acceptInvite).toContain('const membershipRole = isOperatorInvite ? "member" : "admin"');
  });

  it("persists selected permissions in the invite and applies them only on acceptance", () => {
    expect(createInvite).toContain("campaign_permissions: inviteKind === \"tenant_operator\" ? campaignPermissions : []");
    expect(acceptInvite).toContain('from("orbit_tenant_user_permissions")');
    expect(acceptInvite).toContain('action: "TENANT_OPERATOR_INVITE_ACCEPTED"');
    expect(validateInvite).toContain("invite_kind:");
  });

  it("shows permission controls only for Fluxrow in the Super Admin dialog", () => {
    expect(manageDialog).toContain('empresa.empresa_slug === "fluxrow"');
    expect(manageDialog).toContain("campaignPermissionKeys.map");
    expect(manageDialog).toContain("As permissões só entram em vigor após a aceitação");
  });
});
