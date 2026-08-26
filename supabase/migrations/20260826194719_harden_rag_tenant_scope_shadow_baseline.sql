-- RAG governado: corrige o contrato legado e cria a baseline de observabilidade.
-- Esta migration NÃO ativa shadow/active para tenant algum e não altera chunks.

create or replace function public.match_orbit_knowledge(
  p_empresa_id uuid,
  query_embedding vector(3072),
  match_count integer default 3,
  min_similarity double precision default 0.7
)
returns table (
  id uuid,
  source_id uuid,
  titulo text,
  conteudo_texto text,
  tipo text,
  similarity double precision
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    k.id,
    k.source_id,
    k.titulo,
    k.conteudo_texto,
    k.tipo,
    1 - (k.embedding <=> query_embedding) as similarity
  from public.orbit_ai_knowledge as k
  where k.empresa_id = p_empresa_id
    and k.ativo = true
    and k.status = 'ready'
    and k.embedding is not null
    and (1 - (k.embedding <=> query_embedding)) >= min_similarity
  order by k.embedding <=> query_embedding asc
  limit least(greatest(match_count, 1), 10);
$$;

revoke all on function public.match_orbit_knowledge(uuid, vector, integer, double precision)
  from public, anon, authenticated;
grant execute on function public.match_orbit_knowledge(uuid, vector, integer, double precision)
  to service_role;

comment on function public.match_orbit_knowledge(uuid, vector, integer, double precision) is
  'Busca vetorial interna tenant-scoped. Somente runtimes service_role; nunca exposta ao cliente.';

create table if not exists public.orbit_rag_runtime_config (
  empresa_id uuid primary key references public.orbit_empresas(id) on delete cascade,
  mode text not null default 'disabled'
    check (mode in ('disabled', 'shadow', 'active')),
  match_count integer not null default 3
    check (match_count between 1 and 10),
  min_similarity double precision not null default 0.70
    check (min_similarity between 0 and 1),
  require_approved_sources boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.orbit_rag_runtime_config enable row level security;
revoke all on table public.orbit_rag_runtime_config from public, anon, authenticated;
grant all on table public.orbit_rag_runtime_config to service_role;

create table if not exists public.orbit_rag_retrieval_logs (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.orbit_empresas(id) on delete cascade,
  conversa_id uuid references public.orbit_conversas(id) on delete set null,
  inbound_message_id uuid references public.orbit_mensagens(id) on delete set null,
  mode text not null check (mode in ('shadow', 'active')),
  query_hash text not null,
  source_ids uuid[] not null default '{}',
  similarities double precision[] not null default '{}',
  top_similarity double precision,
  retrieved_count integer not null default 0 check (retrieved_count >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  outcome text not null default 'ok'
    check (outcome in ('ok', 'no_match', 'embedding_error', 'retrieval_error', 'blocked')),
  used_in_response boolean not null default false,
  created_at timestamptz not null default now(),
  check (cardinality(source_ids) = cardinality(similarities)),
  check (mode <> 'shadow' or used_in_response = false)
);

create index if not exists orbit_rag_retrieval_logs_tenant_created_idx
  on public.orbit_rag_retrieval_logs (empresa_id, created_at desc);

alter table public.orbit_rag_retrieval_logs enable row level security;
revoke all on table public.orbit_rag_retrieval_logs from public, anon, authenticated;
grant all on table public.orbit_rag_retrieval_logs to service_role;

comment on table public.orbit_rag_retrieval_logs is
  'Telemetria sanitizada: nunca armazena consulta, chunk, prompt, resposta ou PII em texto.';
