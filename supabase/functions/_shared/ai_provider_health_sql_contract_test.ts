import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const migration = await Deno.readTextFile(
  new URL(
    "../../migrations/20260828105741_ai_provider_health_super_admin.sql",
    import.meta.url,
  ),
);

Deno.test("monitor global revoga PUBLIC e anon e exige super admin", () => {
  assert(migration.includes("enable row level security"));
  assert(migration.includes("public.pe_is_super_admin((select auth.uid()))"));
  assert(
    migration.includes(
      "revoke all on public.orbit_ai_provider_health from public, anon",
    ),
  );
  assert(
    migration.includes(
      "revoke all on function public.orbit_get_ai_provider_health() from public, anon",
    ),
  );
});

Deno.test("job periódico usa service role e nunca uma credencial de tenant", () => {
  assert(migration.includes("orbit-ai-provider-health-hourly"));
  assert(
    migration.includes(
      "current_setting('app.settings.service_role_key', true)",
    ),
  );
  assertEquals(migration.includes("orbit_zapi_config"), false);
});

Deno.test("snapshot não possui campos para segredos ou conteúdo de tenant", () => {
  const healthColumns = migration
    .split("create table if not exists public.orbit_ai_provider_health (")[1]
    .split(");")[0]
    .toLowerCase();
  for (
    const forbidden of [
      "api_key",
      "secret",
      "prompt",
      "completion",
      "empresa_id",
      "access_token",
    ]
  ) {
    assertEquals(
      healthColumns.includes(forbidden),
      false,
      `coluna proibida: ${forbidden}`,
    );
  }
});
