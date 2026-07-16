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

  async function tokenB(): Promise<string> {
    const { data } = await clientB.auth.getSession();
    const t = data.session?.access_token;
    expect(t, "tenant B must have a session access_token").toBeTruthy();
    return t as string;
  }

  it("orbit-google-status cross-tenant returns 403", async () => {
    const token = await tokenB();
    const res = await fetch(
      `${URL}/functions/v1/orbit-google-status?empresa_id=${encodeURIComponent(parsed!.tenant_a.empresa_id)}`,
      { headers: { Authorization: `Bearer ${token}`, apikey: KEY as string } },
    );
    expect(res.status, "cross-tenant google-status must be 403").toBe(403);
  });

  it("orbit-google-disconnect cross-tenant returns 403", async () => {
    const token = await tokenB();
    const res = await fetch(`${URL}/functions/v1/orbit-google-disconnect`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: KEY as string,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ empresa_id: parsed!.tenant_a.empresa_id }),
    });
    expect(res.status, "cross-tenant google-disconnect must be 403").toBe(403);
  });

  it("direct upload to campaign-images bucket is blocked (RLS)", async () => {
    const path = `${parsed!.tenant_b.empresa_id}/direct-probe/${crypto.randomUUID()}.txt`;
    const { error } = await clientB.storage
      .from("campaign-images")
      .upload(path, new Blob(["probe"], { type: "text/plain" }));
    expect(error, "direct write to campaign-images must fail").not.toBeNull();
  });

  it("orbit-campaign-image-upload succeeds for own tenant (200)", async () => {
    const token = await tokenB();
    const png = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
      0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
      0x42, 0x60, 0x82,
    ]);
    const fd = new FormData();
    fd.append("file", new Blob([png], { type: "image/png" }), "probe.png");
    fd.append("empresa_id", parsed!.tenant_b.empresa_id);
    fd.append("context", "rls-smoke");
    const res = await fetch(`${URL}/functions/v1/orbit-campaign-image-upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, apikey: KEY as string },
      body: fd,
    });
    expect(res.status, "own-tenant campaign upload must be 200").toBe(200);
    const json = await res.json();
    expect(json?.ok, "envelope ok").toBe(true);
    expect(json?.data?.storage_path, "returns storage_path").toBeTruthy();
    expect(json?.data?.public_url, "returns signed url").toBeTruthy();
  });

  it("orbit-campaign-image-upload cross-tenant returns 403", async () => {
    const token = await tokenB();
    const fd = new FormData();
    fd.append("file", new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" }), "probe.png");
    fd.append("empresa_id", parsed!.tenant_a.empresa_id);
    fd.append("context", "rls-smoke");
    const res = await fetch(`${URL}/functions/v1/orbit-campaign-image-upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, apikey: KEY as string },
      body: fd,
    });
    expect(res.status, "cross-tenant campaign upload must be 403").toBe(403);
  });
});
