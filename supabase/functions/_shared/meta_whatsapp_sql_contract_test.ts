import {
  assert,
  assertEquals,
  assertMatch,
  assertNotMatch,
} from "https://deno.land/std@0.224.0/assert/mod.ts";

const migration = await Deno.readTextFile(
  new URL(
    "../../migrations/20260906113500_meta_whatsapp_cloud_provider.sql",
    import.meta.url,
  ),
);

Deno.test("Meta WhatsApp credentials stay in Vault and runtime RPC is service-only", () => {
  assertMatch(migration, /access_token_secret_id uuid/i);
  assertMatch(migration, /app_secret_secret_id uuid/i);
  assertMatch(migration, /vault[.]create_secret/i);
  assertMatch(
    migration,
    /grant execute on function public[.]get_orbit_meta_whatsapp_runtime_config\(uuid\)\s+to service_role/i,
  );
  assertNotMatch(
    migration,
    /grant execute on function public[.]get_orbit_meta_whatsapp_runtime_config\(uuid\)[\s\S]{0,60}authenticated/i,
  );
});

Deno.test("Meta provider activation defaults fail closed", () => {
  assertMatch(migration, /ativo boolean not null default false/i);
  assertMatch(migration, /envio_real_liberado boolean not null default false/i);
  assertMatch(migration, /canary_mode_enabled boolean not null default true/i);
  assertMatch(
    migration,
    /allow_proactive_messages boolean not null default false/i,
  );
});

Deno.test("Meta phone number routing is tenant-unique", () => {
  assertMatch(
    migration,
    /create unique index if not exists orbit_meta_whatsapp_phone_number_unique/i,
  );
  assert(
    migration.includes(
      "where c.phone_number_id = nullif(btrim(p_phone_number_id), '')",
    ),
  );
  assertEquals(migration.includes("first tenant"), false);
});
