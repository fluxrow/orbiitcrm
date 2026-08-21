import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const hook = readFileSync(resolve(__dirname, "../hooks/useOrbitConfig.ts"), "utf8");
const migration = readFileSync(
  resolve(__dirname, "../../supabase/migrations/20260821060000_tenant_config_governance_wave3_part3a.sql"),
  "utf8",
);
const rlsGuard = readFileSync(
  resolve(__dirname, "../../supabase/migrations/20260821061000_tenant_config_governance_wave3_part3a_rls_guard.sql"),
  "utf8",
);
const deliveryMigration = readFileSync(
  resolve(__dirname, "../../supabase/migrations/20260821070000_tenant_config_governance_wave3_part3b.sql"),
  "utf8",
);

describe("tenant config governance wave 3.3a", () => {
  it("routes canary AI and Resend writes through the scoped RPC", () => {
    expect(hook).toContain("tenant_config_governance_wave3_v1");
    expect(hook).toContain('p_config_type: "ai"');
    expect(hook).toContain('p_config_type: "resend"');
    expect(hook).toContain("TENANT_CONTEXT_MISMATCH");
  });

  it("does not overwrite stored secrets when the UI submits an empty field", () => {
    expect(hook).toContain('key === "tts_api_key" && value === ""');
    expect(hook).toContain('key === "api_key" && value === ""');
  });

  it("locks the database boundary and redacts audit details", () => {
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = public");
    expect(migration).toContain("orbit_tenant_context_authorize");
    expect(migration).toContain("TENANT_ADMIN_REQUIRED");
    expect(migration).toContain("PAYLOAD_FIELD_NOT_ALLOWED");
    expect(migration).toContain("to_jsonb(a)-'tts_api_key'");
    expect(migration).toContain("to_jsonb(r)-'api_key'");
    expect(migration).toContain("'secret_changed'");
    expect(migration).toContain("REVOKE ALL ON FUNCTION");
    expect(migration).toContain("REVOKE SELECT ON TABLE public.orbit_ai_config");
    expect(hook).toContain("AI_CONFIG_SAFE_COLS");
    expect(hook).not.toContain('from("orbit_ai_config").select("*")');
  });

  it("keeps the rollout exclusive to Fluxrow", () => {
    expect(migration).toContain("e.slug = 'fluxrow'");
    expect(migration).toContain("('bullink-negocios',false)");
    expect(migration).toContain("('fabrica-de-pesquisadores',false)");
    expect(migration).toContain("('viver-semijoias',false)");
  });

  it("blocks direct canary DML while leaving the RPC as the only write path", () => {
    expect(rlsGuard.match(/AS RESTRICTIVE/g)).toHaveLength(6);
    expect(rlsGuard).toContain("tenant_config_wave3_ai_update_guard");
    expect(rlsGuard).toContain("tenant_config_wave3_resend_update_guard");
    expect(rlsGuard).toContain("orbit_tenant_config_direct_dml_allowed");
  });
});

describe("tenant config governance wave 3.3b", () => {
  it("routes canary Z-API and WhatsApp sending config through slug-scoped RPCs", () => {
    expect(hook).toContain("orbit_tenant_delivery_config_read_scoped");
    expect(hook).toContain("orbit_tenant_delivery_config_mutate_scoped");
    expect(hook).toContain('p_config_type: "zapi"');
    expect(hook).toContain('p_config_type: "whatsapp_sending"');
  });

  it("authorizes the tenant and requires an administrator at the database boundary", () => {
    expect(deliveryMigration).toContain("orbit_tenant_context_authorize");
    expect(deliveryMigration).toContain("TENANT_ADMIN_REQUIRED");
    expect(deliveryMigration).toContain("PAYLOAD_FIELD_NOT_ALLOWED");
    expect(deliveryMigration).toContain("SET search_path = public");
    expect(deliveryMigration.match(/^SECURITY DEFINER$/gm)).toHaveLength(2);
  });

  it("never writes secrets into audit details and removes anonymous table access", () => {
    expect(deliveryMigration).toContain("ARRAY['token','client_token']");
    expect(deliveryMigration).toContain("'secret_changed'");
    expect(deliveryMigration).toContain(
      "REVOKE ALL ON TABLE public.orbit_whatsapp_sending_config FROM anon",
    );
  });

  it("makes the scoped RPC the only canary write path", () => {
    expect(deliveryMigration.match(/AS RESTRICTIVE/g)).toHaveLength(6);
    expect(deliveryMigration).toContain("tenant_config_wave3_zapi_update_guard");
    expect(deliveryMigration).toContain("tenant_config_wave3_sending_update_guard");
    expect(deliveryMigration).toContain("orbit_tenant_config_direct_dml_allowed");
  });

  it("keeps the rollout guard exclusive to Fluxrow", () => {
    expect(deliveryMigration).toContain("('fluxrow',true)");
    expect(deliveryMigration).toContain("('bullink-negocios',false)");
    expect(deliveryMigration).toContain("('fabrica-de-pesquisadores',false)");
    expect(deliveryMigration).toContain("('viver-semijoias',false)");
  });
});
