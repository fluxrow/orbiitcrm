-- Persistent, tenant-scoped handoff for the separate remediation worker.
-- This migration creates no cron, sends no message and grants no client write.

create table if not exists public.orbit_remediation_incidents (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.orbit_empresas(id) on delete cascade,
  source text not null
    check (source in ('read_only_monitor','preflight_scanner')),
  descriptor_version smallint not null default 1 check (descriptor_version = 1),
  entity_id text not null check (length(entity_id) between 1 and 160),
  event_id text not null check (length(event_id) between 1 and 160),
  incident_class text not null
    check (incident_class in ('follow_up','meeting_confirmation','meeting_reminder','edge_deploy_drift')),
  release_kind text not null
    check (release_kind in ('meeting_confirmation','meeting_reminder_24h','meeting_reminder_1h','meeting_reminder_5m','weekly_reminder','follow_up','edge_deploy_drift')),
  descriptor jsonb not null check (
    jsonb_typeof(descriptor) = 'object'
    and octet_length(descriptor::text) <= 16384
  ),
  idempotency_key text not null check (length(idempotency_key) between 1 and 240),
  recipient_hash text check (recipient_hash is null or recipient_hash ~ '^[a-fA-F0-9]{64}$'),
  content_hash text check (content_hash is null or content_hash ~ '^[a-fA-F0-9]{64}$'),
  canonical_link_hash text check (canonical_link_hash is null or canonical_link_hash ~ '^[a-fA-F0-9]{64}$'),
  scheduled_action_id uuid references public.orbit_flow_scheduled_actions(id) on delete set null,
  flow_run_id uuid references public.orbit_flow_runs(id) on delete set null,
  outbox_id uuid references public.orbit_whatsapp_outbox(id) on delete set null,
  preflight_at timestamptz not null,
  release_at timestamptz not null,
  release_deadline timestamptz not null,
  delivery_deadline timestamptz not null,
  state text not null default 'queued'
    check (state in (
      'queued','leased','prepared','remediating','ready','enqueued',
      'verifying','released','expired','canceled','needs_approval','failed'
    )),
  lease_owner text check (lease_owner is null or length(lease_owner) <= 120),
  lease_until timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  last_error_code text check (last_error_code is null or length(last_error_code) <= 160),
  snapshot_before jsonb not null default '{}'::jsonb check (jsonb_typeof(snapshot_before) = 'object'),
  snapshot_after jsonb not null default '{}'::jsonb check (jsonb_typeof(snapshot_after) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (preflight_at <= release_at),
  check (release_at <= release_deadline),
  check (release_deadline <= delivery_deadline),
  unique (empresa_id, idempotency_key)
);

create index if not exists orbit_remediation_incidents_ready_idx
  on public.orbit_remediation_incidents (state, release_at, lease_until);
create index if not exists orbit_remediation_incidents_tenant_state_idx
  on public.orbit_remediation_incidents (empresa_id, state, created_at desc);

alter table public.orbit_remediation_incidents enable row level security;
revoke all on table public.orbit_remediation_incidents from public, anon, authenticated;
grant all on table public.orbit_remediation_incidents to service_role;

drop trigger if exists trg_orbit_remediation_incidents_touch
  on public.orbit_remediation_incidents;
create trigger trg_orbit_remediation_incidents_touch
  before update on public.orbit_remediation_incidents
  for each row execute function public.update_updated_at_column();

create table if not exists public.orbit_remediation_class_approvals (
  empresa_id uuid not null references public.orbit_empresas(id) on delete cascade,
  incident_class text not null
    check (incident_class in ('follow_up','meeting_confirmation','meeting_reminder','edge_deploy_drift')),
  mode text not null default 'shadow' check (mode in ('shadow','auto_release')),
  approved boolean not null default false,
  approved_by uuid,
  approved_at timestamptz,
  canary_run_id text check (canary_run_id is null or length(canary_run_id) <= 160),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (empresa_id, incident_class),
  check (incident_class <> 'edge_deploy_drift' or mode = 'shadow'),
  check (
    mode = 'shadow'
    or (
      approved = true
      and approved_at is not null
      and canary_run_id is not null
      and (expires_at is null or expires_at > approved_at)
    )
  )
);

alter table public.orbit_remediation_class_approvals enable row level security;
revoke all on table public.orbit_remediation_class_approvals
  from public, anon, authenticated;
grant all on table public.orbit_remediation_class_approvals to service_role;

drop trigger if exists trg_orbit_remediation_class_approvals_touch
  on public.orbit_remediation_class_approvals;
create trigger trg_orbit_remediation_class_approvals_touch
  before update on public.orbit_remediation_class_approvals
  for each row execute function public.update_updated_at_column();

-- Safe bootstrap: every supported class starts in shadow. This authorizes only
-- sanitized preflight evidence; it cannot release an outbox or send a message.
insert into public.orbit_remediation_class_approvals (
  empresa_id, incident_class, mode, approved
)
select tenant_id, incident_class, 'shadow', false
from (
  values
    ('4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18'::uuid),
    ('36f26579-66ad-4ef1-9788-141e4c727232'::uuid)
) as tenants(tenant_id)
cross join (
  values ('follow_up'), ('meeting_confirmation'),
         ('meeting_reminder'), ('edge_deploy_drift')
) as classes(incident_class)
on conflict (empresa_id, incident_class) do nothing;

create or replace function public.claim_orbit_remediation_incidents(
  _worker text,
  _batch integer default 20
)
returns setof public.orbit_remediation_incidents
language plpgsql
security definer
set search_path = public
as $$
begin
  if _worker is null or length(_worker) < 8 or length(_worker) > 120 then
    raise exception using errcode = '22023', message = 'INVALID_WORKER';
  end if;

  return query
  with picked as (
    select i.id
    from public.orbit_remediation_incidents i
    join public.orbit_remediation_class_approvals a
      on a.empresa_id = i.empresa_id
     and a.incident_class = i.incident_class
    where (
        (a.mode = 'shadow' and i.state = 'queued')
        or (
          a.mode = 'auto_release'
          and i.state in ('queued','prepared','ready','enqueued','verifying')
        )
      )
      and (i.lease_until is null or i.lease_until < now())
      and (
        a.mode = 'shadow'
        or (
          a.mode = 'auto_release'
          and a.approved = true
          and (a.expires_at is null or a.expires_at > now())
        )
      )
    order by i.release_at, i.created_at, i.id
    for update of i skip locked
    limit greatest(1, least(coalesce(_batch, 20), 100))
  )
  update public.orbit_remediation_incidents i
     set lease_owner = _worker,
         lease_until = now() + interval '60 seconds',
         attempts = i.attempts + 1
    from picked
   where i.id = picked.id
  returning i.*;
end;
$$;

revoke all on function public.claim_orbit_remediation_incidents(text, integer)
  from public, anon, authenticated;
grant execute on function public.claim_orbit_remediation_incidents(text, integer)
  to service_role;

comment on table public.orbit_remediation_incidents is
  'Sanitized incident handoff for the separate remediator; no raw message, phone or URL.';
comment on table public.orbit_remediation_class_approvals is
  'Tenant-scoped class activation. Shadow mode never authorizes a send.';
comment on function public.claim_orbit_remediation_incidents(text, integer) is
  'Service-role lease claim with SKIP LOCKED; does not enqueue or send.';
