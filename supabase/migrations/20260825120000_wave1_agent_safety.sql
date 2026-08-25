-- Onda 1: memória configurável, claims persistentes e reconciliação fail-closed.
-- Esta migration é somente código nesta entrega; não é aplicada automaticamente.

alter table public.orbit_ai_config
  add column if not exists canonical_field_aliases jsonb not null default '{}'::jsonb;

create table if not exists public.orbit_ai_execution_claims (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.orbit_empresas(id) on delete cascade,
  conversa_id uuid not null references public.orbit_conversas(id) on delete cascade,
  correlation_id text not null check (length(correlation_id) between 1 and 300),
  status text not null default 'running' check (status in ('running','finished','error')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  result text,
  unique (empresa_id, conversa_id, correlation_id)
);

alter table public.orbit_ai_execution_claims enable row level security;

create or replace function public.claim_orbit_ai_execution(
  _empresa_id uuid, _conversa_id uuid, _correlation_id text
) returns uuid language plpgsql security definer set search_path = public as $$
declare _id uuid;
begin
  if not exists (
    select 1 from public.orbit_conversas
    where id = _conversa_id and empresa_id = _empresa_id
  ) then return null; end if;
  insert into public.orbit_ai_execution_claims(empresa_id, conversa_id, correlation_id)
  values (_empresa_id, _conversa_id, left(_correlation_id, 300))
  on conflict (empresa_id, conversa_id, correlation_id) do nothing
  returning id into _id;
  return _id;
end $$;
revoke all on function public.claim_orbit_ai_execution(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.claim_orbit_ai_execution(uuid,uuid,text) to service_role;

create table if not exists public.orbit_flow_run_review_queue (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null unique references public.orbit_flow_runs(id) on delete cascade,
  empresa_id uuid not null references public.orbit_empresas(id) on delete cascade,
  reason text not null,
  status text not null default 'pending_review' check (status in ('pending_review','resolved','dismissed')),
  attempts integer not null default 1,
  detected_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  result text
);
alter table public.orbit_flow_run_review_queue enable row level security;

create or replace function public.claim_orbit_flow_run_start(_run_id uuid)
returns uuid language sql security definer set search_path = public as $$
  update public.orbit_flow_runs
     set status = 'running', started_at = now()
   where id = _run_id and status = 'pending' and started_at is null
  returning id
$$;
revoke all on function public.claim_orbit_flow_run_start(uuid) from public, anon, authenticated;
grant execute on function public.claim_orbit_flow_run_start(uuid) to service_role;

create or replace function public.queue_orphan_flow_runs_for_review(_empresa_id uuid, _sla_seconds integer default 300, _limit integer default 100)
returns table(run_id uuid, empresa_id uuid, reason text)
language plpgsql security definer set search_path = public as $$
begin
  return query
  with candidates as (
    select r.id, r.empresa_id
      from public.orbit_flow_runs r
     where r.empresa_id = _empresa_id and r.status = 'pending' and r.started_at is null
       and r.created_at < now() - make_interval(secs => greatest(_sla_seconds, 60))
     order by r.created_at asc limit least(greatest(_limit, 1), 100)
  ), queued as (
    insert into public.orbit_flow_run_review_queue(run_id, empresa_id, reason)
    select c.id, c.empresa_id, 'pending_without_started_at_over_sla' from candidates c
    on conflict (run_id) do update set last_seen_at = now(), attempts = orbit_flow_run_review_queue.attempts + 1
    returning orbit_flow_run_review_queue.run_id, orbit_flow_run_review_queue.empresa_id, orbit_flow_run_review_queue.reason
  ) select * from queued;
end $$;
revoke all on function public.queue_orphan_flow_runs_for_review(uuid,integer,integer) from public, anon, authenticated;
grant execute on function public.queue_orphan_flow_runs_for_review(uuid,integer,integer) to service_role;
