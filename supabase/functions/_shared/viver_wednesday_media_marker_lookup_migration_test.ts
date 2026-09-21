import { assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

const migration = await Deno.readTextFile(
  new URL(
    "../../migrations/20260921184500_viver_wednesday_invite_media_marker_lookup.sql",
    import.meta.url,
  ),
);

Deno.test("Wednesday invite reconciliation resolves the generated template ID tenant-safely", () => {
  assertStringIncludes(migration, "empresa_id = v_empresa_id");
  assertStringIncludes(migration, "Viver - Convite aula em grupo quarta 19h30 (texto)");
  assertStringIncludes(migration, "v_template_count <> 1");
  assert(!migration.includes("min(id)"));
  assertStringIncludes(migration, "SELECT id\n    INTO v_template_id");
  assertStringIncludes(migration, "action_config->>'template_id' = v_template_id::text");
  assertStringIncludes(migration, "action_config - 'viver_group_invite_audio'");
});

Deno.test("lookup reconciliation remains side-effect free for messaging", () => {
  const normalized = migration.toLowerCase();
  assert(!normalized.includes("insert into public.orbit_whatsapp_outbox"));
  assert(!normalized.includes("update public.orbit_whatsapp_outbox"));
  assert(!normalized.includes("insert into public.orbit_mensagens"));
  assertStringIncludes(migration, "'outbox_created', false");
  assertStringIncludes(migration, "'retry_or_backfill', false");
});
