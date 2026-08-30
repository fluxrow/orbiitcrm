import { assert, assertFalse } from "https://deno.land/std@0.224.0/assert/mod.ts";

const sql = await Deno.readTextFile(new URL(
  "../../migrations/20260830181500_fix_orbit_tasks_switched_tenant_rls.sql",
  import.meta.url,
));

Deno.test("tarefas usam contexto explícito do tenant e somente authenticated", () => {
  assert(/TO\s+authenticated/gi.test(sql));
  assert(/user_has_empresa_access\s*\(\s*empresa_id\s*\)/gi.test(sql));
  assert(/pe_is_super_admin/gi.test(sql));
  assert(/pe_user_is_orbit_member/gi.test(sql));
  assertFalse(/get_user_empresa_id/gi.test(sql));
});

Deno.test("INSERT e UPDATE validam a linha nova com WITH CHECK", () => {
  assert(/FOR\s+INSERT[\s\S]+?WITH\s+CHECK/gi.test(sql));
  assert(/FOR\s+UPDATE[\s\S]+?USING[\s\S]+?WITH\s+CHECK/gi.test(sql));
});

Deno.test("migration não altera dados operacionais", () => {
  assertFalse(/\b(?:INSERT\s+INTO|UPDATE\s+public\.|DELETE\s+FROM)\b/gi.test(sql));
});
