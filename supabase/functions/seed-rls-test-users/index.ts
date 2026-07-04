/**
 * seed-rls-test-users
 *
 * Super-admin only. Provisions (idempotently) two deterministic non-admin
 * users bound to two distinct tenants, used by the RLS cross-tenant smoke
 * test. On first creation (or when ?rotate=true) returns the freshly
 * generated passwords ONCE — never logged, never stored in plaintext.
 *
 * POST body (all optional):
 *   {
 *     "empresa_id_a": "uuid",   // default: Viver Semijoias
 *     "empresa_id_b": "uuid",   // default: Promotrip Corporate
 *     "rotate": boolean         // force new passwords
 *   }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ok, fail, optionsResponse, ErrorCodes } from "../_shared/responses.ts";

const DEFAULT_A = "36f26579-66ad-4ef1-9788-141e4c727232"; // Viver Semijoias
const DEFAULT_B = "c4ea82e5-ec19-4d1a-b752-cfadec363fca"; // Promotrip Corporate
const ORG_SALES_ROLE_ID = "90387d63-37ac-4d4a-92d6-2a909fa1de80";

const EMAILS = {
  a: "rls-tenant-a@orbit.test",
  b: "rls-tenant-b@orbit.test",
} as const;

function genPassword(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/[+/=]/g, "")
    .slice(0, 28) + "A9!";
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return optionsResponse(req);

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return fail(ErrorCodes.UNAUTHORIZED, "Não autorizado", 401, undefined, req);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const asUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, serviceKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await asUser.auth.getClaims(token);
    if (claimsErr || !claims?.claims) {
      return fail(ErrorCodes.UNAUTHORIZED, "Token inválido", 401, undefined, req);
    }
    const requesterId = claims.claims.sub as string;

    const { data: legacy } = await admin.from("user_roles").select("role").eq("user_id", requesterId);
    const { data: peUser } = await admin.from("pe_users").select("is_super_admin").eq("id", requesterId).maybeSingle();
    const isSuper =
      legacy?.some((r: any) => r.role === "super_admin") || peUser?.is_super_admin === true;
    if (!isSuper) {
      return fail(ErrorCodes.FORBIDDEN, "Apenas super admins", 403, undefined, req);
    }

    const body = await req.json().catch(() => ({}));
    const empresaA = body.empresa_id_a || DEFAULT_A;
    const empresaB = body.empresa_id_b || DEFAULT_B;
    const rotate = body.rotate === true;

    if (empresaA === empresaB) {
      return fail(ErrorCodes.VALIDATION_ERROR, "empresa_id_a e empresa_id_b devem ser diferentes", 400, undefined, req);
    }

    async function ensureTenantMap(empresaId: string): Promise<string> {
      const { data: existing } = await admin
        .from("pe_tenant_map")
        .select("organization_id")
        .eq("empresa_id", empresaId)
        .maybeSingle();
      if (existing?.organization_id) return existing.organization_id;

      const { data: emp } = await admin
        .from("orbit_empresas")
        .select("nome")
        .eq("id", empresaId)
        .single();
      const { data: org, error: orgErr } = await admin
        .from("organizations")
        .insert({ name: emp?.nome || `Org ${empresaId}` })
        .select("id")
        .single();
      if (orgErr) throw new Error(`org insert: ${orgErr.message}`);

      const { error: mapErr } = await admin
        .from("pe_tenant_map")
        .insert({ empresa_id: empresaId, organization_id: org.id });
      if (mapErr) throw new Error(`map insert: ${mapErr.message}`);
      return org.id;
    }

    async function provision(email: string, empresaId: string, label: string) {
      const orgId = await ensureTenantMap(empresaId);

      // Find or create auth user
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      let user = list?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());
      let password: string | null = null;
      let created = false;

      if (!user) {
        password = genPassword();
        const { data: created_, error: cErr } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { seeded: true, purpose: "rls-smoke-test", tenant: label },
        });
        if (cErr || !created_.user) throw new Error(`createUser: ${cErr?.message}`);
        user = created_.user;
        created = true;
      } else if (rotate) {
        password = genPassword();
        const { error: uErr } = await admin.auth.admin.updateUser(user.id, {
          password,
          email_confirm: true,
        });
        if (uErr) throw new Error(`updateUser: ${uErr.message}`);
      }

      // profiles (drives get_user_empresa_id)
      await admin.from("profiles").upsert(
        {
          id: user.id,
          email,
          nome: `RLS Test ${label.toUpperCase()}`,
          empresa_id: empresaId,
          ativo: true,
        },
        { onConflict: "id" },
      );

      // pe_users (drives pe_user_is_orbit_member via ORG_SALES role)
      await admin.from("pe_users").upsert(
        {
          id: user.id,
          email,
          full_name: `RLS Test ${label.toUpperCase()}`,
          organization_id: orgId,
          role_id: ORG_SALES_ROLE_ID,
          is_active: true,
          is_super_admin: false,
        },
        { onConflict: "id" },
      );

      // user_empresa_memberships
      const { data: mem } = await admin
        .from("user_empresa_memberships")
        .select("id")
        .eq("user_id", user.id)
        .eq("empresa_id", empresaId)
        .maybeSingle();
      if (!mem) {
        await admin
          .from("user_empresa_memberships")
          .insert({ user_id: user.id, empresa_id: empresaId, role: "member" });
      }

      return {
        email,
        empresa_id: empresaId,
        user_id: user.id,
        password, // null on repeat runs without rotate
        created,
      };
    }

    const tenantA = await provision(EMAILS.a, empresaA, "a");
    const tenantB = await provision(EMAILS.b, empresaB, "b");

    // Audit — hash-only, never the password
    await admin.from("orbit_audit_log").insert({
      user_id: requesterId,
      action: "seed_rls_test_users",
      resource_type: "auth.users",
      resource_id: null,
      metadata: {
        rotate,
        tenant_a: {
          email_hash: await sha256Hex(tenantA.email),
          empresa_id: tenantA.empresa_id,
          created: tenantA.created,
        },
        tenant_b: {
          email_hash: await sha256Hex(tenantB.email),
          empresa_id: tenantB.empresa_id,
          created: tenantB.created,
        },
      },
    });

    return ok(
      {
        tenant_a: tenantA,
        tenant_b: tenantB,
        rls_test_users_json:
          tenantA.password && tenantB.password
            ? JSON.stringify({
                tenant_a: { email: tenantA.email, password: tenantA.password, empresa_id: tenantA.empresa_id },
                tenant_b: { email: tenantB.email, password: tenantB.password, empresa_id: tenantB.empresa_id },
              })
            : null,
        note:
          "Copie rls_test_users_json UMA vez para o GitHub Secret RLS_TEST_USERS. Passwords só aparecem em criação ou com rotate=true.",
      },
      undefined,
      req,
    );
  } catch (e: any) {
    return fail(ErrorCodes.INTERNAL_ERROR, e?.message || "erro", 500, undefined, req);
  }
});
