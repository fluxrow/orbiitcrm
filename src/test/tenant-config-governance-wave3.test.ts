import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const hook = readFileSync(resolve(__dirname, "../hooks/useOrbitConfig.ts"), "utf8");
const migration = readFileSync(
  resolve(__dirname, "../../supabase/migrations/20260821060000_tenant_config_governance_wave3_part3a.sql"),
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
});
