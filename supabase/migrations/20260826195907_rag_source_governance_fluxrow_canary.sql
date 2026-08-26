-- Governança de fontes RAG. Somente o canário Fluxrow recebe baseline em draft.
-- Não ativa RAG, não muda embeddings/chunks e não toca nos tenants clientes.

create table if not exists public.orbit_rag_sources (
  source_id uuid primary key,
  empresa_id uuid not null references public.orbit_empresas(id) on delete cascade,
  classification text not null default 'reference'
    check (classification in ('product','pricing','policy','faq','objection','social_proof','training','reference')),
  sensitivity text not null default 'internal'
    check (sensitivity in ('public','internal','restricted')),
  approval_status text not null default 'draft'
    check (approval_status in ('draft','pending_review','approved','rejected','retired')),
  current_version integer not null default 1 check (current_version > 0),
  valid_from timestamptz,
  valid_until timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, source_id),
  check (valid_until is null or valid_from is null or valid_until > valid_from),
  check (
    (approval_status = 'approved' and approved_by is not null and approved_at is not null)
    or approval_status <> 'approved'
  )
);

create index if not exists orbit_rag_sources_tenant_status_idx
  on public.orbit_rag_sources (empresa_id, approval_status, classification);

alter table public.orbit_rag_sources enable row level security;
revoke all on table public.orbit_rag_sources from public, anon, authenticated;
grant all on table public.orbit_rag_sources to service_role;

create table if not exists public.orbit_rag_source_versions (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.orbit_empresas(id) on delete cascade,
  source_id uuid not null references public.orbit_rag_sources(source_id) on delete restrict,
  version_number integer not null check (version_number > 0),
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  model_version text,
  chunk_count integer not null default 0 check (chunk_count >= 0),
  provenance jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (source_id, version_number),
  unique (source_id, content_hash),
  foreign key (empresa_id, source_id)
    references public.orbit_rag_sources(empresa_id, source_id) on delete restrict,
  check (jsonb_typeof(provenance) = 'object')
);

alter table public.orbit_rag_source_versions enable row level security;
revoke all on table public.orbit_rag_source_versions from public, anon, authenticated;
grant select, insert on table public.orbit_rag_source_versions to service_role;

create table if not exists public.orbit_rag_approval_events (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.orbit_empresas(id) on delete cascade,
  source_id uuid not null references public.orbit_rag_sources(source_id) on delete restrict,
  version_number integer not null,
  decision text not null check (decision in ('submitted','approved','rejected','retired')),
  actor_id uuid references auth.users(id) on delete set null,
  reason text,
  created_at timestamptz not null default now(),
  foreign key (source_id, version_number)
    references public.orbit_rag_source_versions(source_id, version_number) on delete restrict
);

create index if not exists orbit_rag_approval_events_tenant_created_idx
  on public.orbit_rag_approval_events (empresa_id, created_at desc);

alter table public.orbit_rag_approval_events enable row level security;
revoke all on table public.orbit_rag_approval_events from public, anon, authenticated;
grant select, insert on table public.orbit_rag_approval_events to service_role;

create table if not exists public.orbit_rag_conflicts (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.orbit_empresas(id) on delete cascade,
  left_source_id uuid not null,
  right_source_id uuid not null,
  conflict_type text not null
    check (conflict_type in ('price','date','policy','product','instruction','general')),
  evidence_hash text not null check (evidence_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'open' check (status in ('open','resolved','ignored')),
  resolution_note text,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (empresa_id, left_source_id)
    references public.orbit_rag_sources(empresa_id, source_id) on delete cascade,
  foreign key (empresa_id, right_source_id)
    references public.orbit_rag_sources(empresa_id, source_id) on delete cascade,
  check (left_source_id <> right_source_id),
  check ((status = 'open' and resolved_at is null) or status <> 'open')
);

create index if not exists orbit_rag_conflicts_tenant_status_idx
  on public.orbit_rag_conflicts (empresa_id, status, created_at desc);

alter table public.orbit_rag_conflicts enable row level security;
revoke all on table public.orbit_rag_conflicts from public, anon, authenticated;
grant all on table public.orbit_rag_conflicts to service_role;

-- Baseline somente da fonte já existente no Fluxrow. Ela permanece em draft e
-- não é autorizada a influenciar respostas.
with fluxrow_source as (
  select
    k.empresa_id,
    k.source_id,
    min(k.model_version) as model_version,
    count(*)::integer as chunk_count,
    encode(digest(string_agg(coalesce(k.conteudo_texto, ''), E'\n' order by k.chunk_index), 'sha256'), 'hex') as content_hash,
    min(k.tipo) as source_type
  from public.orbit_ai_knowledge as k
  join public.orbit_empresas as e on e.id = k.empresa_id
  where e.slug = 'fluxrow'
    and k.source_id = '308cdc8a-68f4-4654-b752-10dc591f4005'::uuid
  group by k.empresa_id, k.source_id
)
insert into public.orbit_rag_sources (
  source_id, empresa_id, classification, sensitivity, approval_status, current_version
)
select source_id, empresa_id, 'reference', 'internal', 'draft', 1
from fluxrow_source
on conflict (source_id) do nothing;

with fluxrow_source as (
  select
    k.empresa_id,
    k.source_id,
    min(k.model_version) as model_version,
    count(*)::integer as chunk_count,
    encode(digest(string_agg(coalesce(k.conteudo_texto, ''), E'\n' order by k.chunk_index), 'sha256'), 'hex') as content_hash,
    min(k.tipo) as source_type
  from public.orbit_ai_knowledge as k
  join public.orbit_empresas as e on e.id = k.empresa_id
  where e.slug = 'fluxrow'
    and k.source_id = '308cdc8a-68f4-4654-b752-10dc591f4005'::uuid
  group by k.empresa_id, k.source_id
)
insert into public.orbit_rag_source_versions (
  empresa_id, source_id, version_number, content_hash, model_version, chunk_count, provenance
)
select
  f.empresa_id,
  f.source_id,
  1,
  f.content_hash,
  f.model_version,
  f.chunk_count,
  jsonb_build_object('origin','legacy_baseline','source_type',f.source_type)
from fluxrow_source as f
where exists (select 1 from public.orbit_rag_sources s where s.source_id = f.source_id)
on conflict (source_id, version_number) do nothing;
