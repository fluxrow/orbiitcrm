import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(__dirname, path), "utf8");
const activities = read("../hooks/useOrbitActivities.ts");
const migration = read("../../supabase/migrations/20260821014514_tenant_explicit_core_reads_wave4_part1.sql");

describe("tenant explicit core reads wave 4.1", () => {
  it("filters activities by the tenant from the route", () => {
    expect(activities).toContain('.eq("empresa_id", empresaId!)');
    expect(activities).toContain('["orbit_activities", empresaId, filters]');
  });

  it("limits the additive read policy to authorized canary tenants", () => {
    expect(migration).toContain("tenant_explicit_core_reads_wave4_v1");
    expect(migration).toContain("public.user_has_empresa_access(p_empresa_id)");
    expect(migration).toContain("f.enabled = true");
    expect(migration).toContain("FROM PUBLIC, anon");
    expect(migration.match(/CREATE POLICY tenant_explicit_core_read_wave4/g)).toHaveLength(8);
  });

  it("keeps protected tenants disabled", () => {
    expect(migration).toContain("('bullink-negocios', false)");
    expect(migration).toContain("('fabrica-de-pesquisadores', false)");
    expect(migration).toContain("('viver-semijoias', false)");
  });
});
