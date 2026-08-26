import { assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

const sql = await Deno.readTextFile(
  new URL(
    "../../migrations/20260826193000_fix_claim_orbit_ai_execution_ambiguity.sql",
    import.meta.url,
  ),
);

Deno.test("claim qualifica lease_expires_at e demais colunas que colidem com o retorno", () => {
  assertStringIncludes(sql, "c.lease_expires_at <= now()");
  assertStringIncludes(sql, "c.lease_expires_at > now()");
  assertStringIncludes(sql, "coalesce(c.finished_at, now())");
  assertStringIncludes(sql, "attempts = c.attempts + 1");

  const unsafeWhere = /where[\s\S]{0,180}(?<!\.)lease_expires_at\s*(?:<=|>)/i;
  if (unsafeWhere.test(sql)) {
    throw new Error("lease_expires_at sem alias pode colidir com a coluna de retorno da RPC");
  }
});

Deno.test("claim preserva isolamento, grants e contrato de retorno", () => {
  assertStringIncludes(sql, "c.empresa_id = _empresa_id");
  assertStringIncludes(sql, "m.empresa_id = _empresa_id");
  assertStringIncludes(sql, "security definer");
  assertStringIncludes(sql, "set search_path = public");
  assertStringIncludes(sql, "from public, anon, authenticated");
  assertStringIncludes(sql, "to service_role");
  assertStringIncludes(sql, "'event_queued'");
  assertStringIncludes(sql, "'recovered_expired'");
});
