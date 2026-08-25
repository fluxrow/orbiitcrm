-- Onda 1: memória configurável, claims persistentes e reconciliação fail-closed.
-- Esta migration é somente código nesta entrega; não é aplicada automaticamente.

alter table public.orbit_ai_config
  add column if not exists canonical_field_aliases jsonb not null default '{}'::jsonb;

create table if not exists public.orbit_ai_execution_claims (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.orbit_empresas(id) on delete cascade,
  conversa_id uuid not null references public.orbit_conversas(id) on delete cascade,
  correlation_id text not null check (length(correlation_id) between 1 and 300),
  lease_token uuid not null default gen_random_uuid(),
  lease_expires_at timestamptz not null default (now() + interval '5 minutes'),
  heartbeat_at timestamptz not null default now(),
  attempts integer not null default 1,
  status text not null default 'running' check (status in ('running','finished','error','expired')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  result text,
  unique (empresa_id, conversa_id, correlation_id)
);

alter table public.orbit_ai_execution_claims enable row level security;
create unique index if not exists orbit_ai_execution_one_active_conversation
  on public.orbit_ai_execution_claims(empresa_id, conversa_id)
  where status = 'running';

drop function if exists public.claim_orbit_ai_execution(uuid,uuid,text);
create or replace function public.claim_orbit_ai_execution(
  _empresa_id uuid, _conversa_id uuid, _event_id text, _lease_seconds integer default 300
) returns table(claim_id uuid, lease_token uuid, acquired boolean, reason text, lease_expires_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  _existing public.orbit_ai_execution_claims%rowtype;
  _token uuid := gen_random_uuid();
  _expires timestamptz := now() + make_interval(secs => least(greatest(_lease_seconds, 60), 900));
begin
  perform pg_advisory_xact_lock(hashtextextended(_empresa_id::text || ':' || _conversa_id::text, 0));
  if not exists (
    select 1 from public.orbit_conversas
    where id = _conversa_id and empresa_id = _empresa_id
  ) then return query select null::uuid, null::uuid, false, 'tenant_mismatch', null::timestamptz; return; end if;

  select * into _existing from public.orbit_ai_execution_claims
   where empresa_id = _empresa_id and conversa_id = _conversa_id and correlation_id = left(_event_id, 300);
  if found and _existing.status = 'finished' then
    return query select _existing.id, _existing.lease_token, false, 'event_already_finished', _existing.lease_expires_at; return;
  end if;
  if found and _existing.status = 'running' and _existing.lease_expires_at > now() then
    return query select _existing.id, _existing.lease_token, false, 'event_already_active', _existing.lease_expires_at; return;
  end if;
  if exists (select 1 from public.orbit_ai_execution_claims
    where empresa_id = _empresa_id and conversa_id = _conversa_id
      and status = 'running' and lease_expires_at > now()) then
    return query select null::uuid, null::uuid, false, 'conversation_busy', null::timestamptz; return;
  end if;

  update public.orbit_ai_execution_claims set status = 'expired', finished_at = coalesce(finished_at, now()), result = 'lease_expired'
   where empresa_id = _empresa_id and conversa_id = _conversa_id and status = 'running' and lease_expires_at <= now();

  if _existing.id is not null then
    update public.orbit_ai_execution_claims set status = 'running', lease_token = _token,
      lease_expires_at = _expires, heartbeat_at = now(), started_at = now(), finished_at = null,
      result = null, attempts = attempts + 1
     where id = _existing.id
     returning id into claim_id;
  else
    insert into public.orbit_ai_execution_claims(empresa_id, conversa_id, correlation_id, lease_token, lease_expires_at)
    values (_empresa_id, _conversa_id, left(_event_id, 300), _token, _expires)
    returning id into claim_id;
  end if;
  return query select claim_id, _token, true, case when _existing.id is null then 'acquired' else 'recovered_expired' end, _expires;
end $$;
revoke all on function public.claim_orbit_ai_execution(uuid,uuid,text,integer) from public, anon, authenticated;
grant execute on function public.claim_orbit_ai_execution(uuid,uuid,text,integer) to service_role;

create or replace function public.renew_orbit_ai_execution_lease(_claim_id uuid, _lease_token uuid, _lease_seconds integer default 300)
returns boolean language sql security definer set search_path = public as $$
  with renewed as (
    update public.orbit_ai_execution_claims set heartbeat_at = now(),
      lease_expires_at = now() + make_interval(secs => least(greatest(_lease_seconds, 60), 900))
     where id = _claim_id and lease_token = _lease_token and status = 'running' and lease_expires_at > now()
    returning 1
  ) select exists(select 1 from renewed)
$$;
revoke all on function public.renew_orbit_ai_execution_lease(uuid,uuid,integer) from public, anon, authenticated;
grant execute on function public.renew_orbit_ai_execution_lease(uuid,uuid,integer) to service_role;

create or replace function public.finish_orbit_ai_execution(_claim_id uuid, _lease_token uuid, _status text, _result text)
returns boolean language sql security definer set search_path = public as $$
  with finished as (
    update public.orbit_ai_execution_claims set status = case when _status = 'error' then 'error' else 'finished' end,
      finished_at = now(), heartbeat_at = now(), result = left(coalesce(_result, ''), 100)
     where id = _claim_id and lease_token = _lease_token and status = 'running'
    returning 1
  ) select exists(select 1 from finished)
$$;
revoke all on function public.finish_orbit_ai_execution(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.finish_orbit_ai_execution(uuid,uuid,text,text) to service_role;

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

create or replace function public.cleanup_orbit_execution_history(_empresa_id uuid, _claim_days integer default 30, _review_days integer default 90)
returns table(deleted_claims bigint, deleted_reviews bigint)
language plpgsql security definer set search_path = public as $$
begin
  with d as (delete from public.orbit_ai_execution_claims where empresa_id = _empresa_id
    and status in ('finished','error','expired') and finished_at < now() - make_interval(days => greatest(_claim_days, 7)) returning 1)
  select count(*) into deleted_claims from d;
  with d as (delete from public.orbit_flow_run_review_queue where empresa_id = _empresa_id
    and status in ('resolved','dismissed') and last_seen_at < now() - make_interval(days => greatest(_review_days, 30)) returning 1)
  select count(*) into deleted_reviews from d;
  return next;
end $$;
revoke all on function public.cleanup_orbit_execution_history(uuid,integer,integer) from public, anon, authenticated;
grant execute on function public.cleanup_orbit_execution_history(uuid,integer,integer) to service_role;
