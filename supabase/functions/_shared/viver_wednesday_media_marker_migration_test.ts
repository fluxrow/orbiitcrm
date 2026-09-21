import { assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

const migration = await Deno.readTextFile(
  new URL(
    "../../migrations/20260921183500_viver_wednesday_invite_truthful_media_marker.sql",
    import.meta.url,
  ),
);

Deno.test("Wednesday group invite removes the obsolete audio marker from action and pending snapshots", () => {
  assertStringIncludes(migration, "action_config - 'viver_group_invite_audio'");
  assertStringIncludes(migration, "status = 'pending'");
  assertStringIncludes(migration, "ordem = 2");
  assertStringIncludes(migration, "64e7e049-293d-4f67-89fc-2d01a5d0471e");
});

Deno.test("Wednesday media-marker reconciliation cannot enqueue or send messages", () => {
  const normalized = migration.toLowerCase();
  assert(!normalized.includes("insert into public.orbit_whatsapp_outbox"));
  assert(!normalized.includes("update public.orbit_whatsapp_outbox"));
  assert(!normalized.includes("insert into public.orbit_mensagens"));
  assertStringIncludes(migration, "'message_content_changed', false");
  assertStringIncludes(migration, "'outbox_created', false");
  assertStringIncludes(migration, "'retry_or_backfill', false");
});
