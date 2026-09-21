import { assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

const migration = await Deno.readTextFile(
  new URL("../../migrations/20260921161000_enable_viver_group_followup_ladder.sql", import.meta.url),
);

Deno.test("Viver group ladder enables only D+3 and D+7 with controlled follow-up guards", () => {
  assertStringIncludes(migration, "ordem IN (3, 4)");
  assertStringIncludes(migration, "'viver_controlled_followup', true");
  assertStringIncludes(migration, "'cancel_on_reply', true");
  assertStringIncludes(migration, "'enabled', true");
  assert(!migration.includes("ordem IN (3, 4, 5)"));
});

Deno.test("Viver group ladder advances instead of asking the known challenge again", () => {
  assertStringIncludes(migration, "Quer que eu reserve seu acesso?");
  assertStringIncludes(migration, "material de entrada");
  assert(!migration.toLowerCase().includes("hoje seu maior desafio"));
});

Deno.test("existing group follow-ups are future-only and require provider delivery with no reply or human collision", () => {
  assertStringIncludes(migration, "nullif(o.provider_message_id, '') IS NOT NULL");
  assertStringIncludes(migration, "m.timestamp > io.sent_at");
  assertStringIncludes(migration, "e.anchor_sent_at + make_interval(secs => a.delay_seconds) > now()");
  assertStringIncludes(migration, "no_compensatory_backlog");
});
