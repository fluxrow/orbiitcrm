import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const sql = await Deno.readTextFile(new URL(
  "../../migrations/20260826194719_harden_rag_tenant_scope_shadow_baseline.sql",
  import.meta.url,
));

Deno.test("busca vetorial deixa de ser um endpoint authenticated privilegiado", () => {
  assert(sql.includes("security invoker"));
  assert(sql.includes("from public, anon, authenticated"));
  assert(sql.includes("to service_role"));
  assert(!/grant execute[\s\S]{0,180}to authenticated/i.test(sql));
});

Deno.test("baseline RAG nasce desabilitada e sem seed implícito", () => {
  assert(sql.includes("default 'disabled'"));
  assert(!/insert\s+into\s+public\.orbit_rag_runtime_config/i.test(sql));
  assert(!/update\s+public\.orbit_ai_config/i.test(sql));
});

Deno.test("shadow mode não pode marcar conteúdo como usado na resposta", () => {
  const logTable = sql.split("create table if not exists public.orbit_rag_retrieval_logs")[1]
    ?.split("create index if not exists")[0] ?? "";
  assert(sql.includes("mode <> 'shadow' or used_in_response = false"));
  assert(logTable.includes("query_hash text not null"));
  assertEquals(/query_text|prompt_text|response_text|conteudo_texto\s+text/i.test(logTable), false);
});
