/**
 * RLS Cross-Tenant Smoke Test
 *
 * Validates that a non-admin user in tenant B CANNOT read data from tenant A
 * across the tables that were hardened in the security pass:
 *   - orbit_prospects
 *   - orbit_pipeline_stages
 *   - orbit_google_oauth_states
 *
 * REQUIRES env:
 *   VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY
 *   RLS_TEST_USERS = JSON:
 *     {
 *       "tenant_a": { "email": "...", "password": "...", "empresa_id": "..." },
 *       "tenant_b": { "email": "...", "password": "...", "empresa_id": "..." }
 *     }
 *
 * Skipped locally when RLS_TEST_USERS is not set.
 */
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const RAW = process.env.RLS_TEST_USERS;
const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const enabled = Boolean(RAW && URL && KEY);

type TenantCreds = { email: string; password: string; empresa_id: string };
type Payload = { tenant_a: TenantCreds; tenant_b: TenantCreds };

const parsed: Payload | null = enabled ? JSON.parse(RAW as string) : null;

function mkClient(storageKey: string): SupabaseClient {
  return createClient(URL as string, KEY as string, {
    auth: {
      storageKey,
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

describe.skipIf(!enabled)("RLS cross-tenant isolation", () => {
  let clientA: SupabaseClient;
  let clientB: SupabaseClient;
  let userAId: string;

  beforeAll(async () => {
    clientA = mkClient("rls-a");
    clientB = mkClient("rls-b");

    const a = await clientA.auth.signInWithPassword({
      email: parsed!.tenant_a.email,
      password: parsed!.tenant_a.password,
    });
    expect(a.error, "sign-in tenant A").toBeNull();
    userAId = a.data.user!.id;

    const b = await clientB.auth.signInWithPassword({
      email: parsed!.tenant_b.email,
      password: parsed!.tenant_b.password,
    });
    expect(b.error, "sign-in tenant B").toBeNull();
  });

  afterAll(async () => {
    await clientA?.auth.signOut();
    await clientB?.auth.signOut();
  });

  const TABLES = [
    "orbit_prospects",
    "orbit_pipeline_stages",
    "orbit_google_oauth_states",
    "orbit_conversas",
    "orbit_mensagens",
    "orbit_distribuicao_config",
  ] as const;

  for (const table of TABLES) {
    describe(table, () => {
      it("tenant B cannot read tenant A rows via explicit filter", async () => {
        const { data, error } = await clientB
          .from(table)
          .select("id, empresa_id")
          .eq("empresa_id", parsed!.tenant_a.empresa_id);
        // RLS filters silently — expect no error, zero rows
        expect(error, `error querying ${table}`).toBeNull();
        expect(data ?? []).toEqual([]);
      });

      it("tenant B's unfiltered read leaks no other-tenant rows", async () => {
        const { data, error } = await clientB
          .from(table)
          .select("empresa_id")
          .limit(100);
        expect(error, `error listing ${table}`).toBeNull();
        for (const row of data ?? []) {
          expect(row.empresa_id).toBe(parsed!.tenant_b.empresa_id);
        }
      });
    });
  }

  it("tenant B cannot forge an orbit_google_oauth_states row for tenant A user", async () => {
    const { error } = await clientB.from("orbit_google_oauth_states").insert({
      state: `rls-forge-${crypto.randomUUID()}`,
      user_id: userAId,
      empresa_id: parsed!.tenant_a.empresa_id,
    });
    // Either RLS violation OR permission denied — both count as blocked
    expect(error, "insert with foreign user_id must fail").not.toBeNull();
  });

  it("tenant B cannot upload into orbit-media folder of tenant A", async () => {
    const path = `${parsed!.tenant_a.empresa_id}/rls-probe/${crypto.randomUUID()}.txt`;
    const { error } = await clientB.storage
      .from("orbit-media")
      .upload(path, new Blob(["probe"], { type: "text/plain" }));
    expect(error, "upload into foreign empresa_id folder must fail").not.toBeNull();
  });

  it("tenant B cannot manage orbit_distribuicao_config of tenant A", async () => {
    const { error } = await clientB.from("orbit_distribuicao_config").insert({
      empresa_id: parsed!.tenant_a.empresa_id,
      modo: "round_robin",
    } as any);
    expect(error, "insert distribuicao for foreign tenant must fail").not.toBeNull();
  });
});
