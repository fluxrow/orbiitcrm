import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const sql = await Deno.readTextFile(new URL(
  "../../migrations/20260826195907_rag_source_governance_fluxrow_canary.sql",
  import.meta.url,
));

Deno.test("governança é fechada ao cliente e tenant-scoped", () => {
  for (const table of ["orbit_rag_sources", "orbit_rag_source_versions", "orbit_rag_approval_events", "orbit_rag_conflicts"]) {
    assert(sql.includes(`alter table public.${table} enable row level security`));
    assert(sql.includes(`revoke all on table public.${table} from public, anon, authenticated`));
  }
  assert(sql.includes("foreign key (empresa_id, source_id)"));
});

Deno.test("versões carregam hash, número e proveniência sem conteúdo bruto", () => {
  const block = sql.split("create table if not exists public.orbit_rag_source_versions")[1]
    ?.split("create table if not exists public.orbit_rag_approval_events")[0] ?? "";
  assert(block.includes("content_hash text not null"));
  assert(block.includes("version_number integer not null"));
  assert(block.includes("provenance jsonb"));
  assertEquals(/content\s+text|conteudo_texto\s+text|embedding\s+vector/i.test(block), false);
});

Deno.test("baseline é exclusivamente Fluxrow e permanece draft", () => {
  assert(sql.includes("where e.slug = 'fluxrow'"));
  assert(sql.includes("'308cdc8a-68f4-4654-b752-10dc591f4005'::uuid"));
  assert(sql.includes("'reference', 'internal', 'draft', 1"));
  for (const protectedSlug of ["bullink-negocios", "fabrica-de-pesquisadores", "viver-semijoias"]) {
    assertEquals(sql.includes(`e.slug = '${protectedSlug}'`), false);
  }
  assertEquals(/update\s+public\.orbit_ai_config/i.test(sql), false);
});
