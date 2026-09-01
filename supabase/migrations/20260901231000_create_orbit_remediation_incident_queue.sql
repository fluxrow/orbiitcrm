create table if not exists public.orbit_remediation_incidents (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null,
  entity_id text not null,
  event_id text not null,
  incident_class text not null check (incident_class in ('follow_up','meeting_confirmation','meeting_reminder','edge_deploy_drift')),
  descriptor jsonb not null,
  idempotency_key text not null unique,
  state text not null default 'queued' check (state in ('queued','leased','remediating','ready','released','expired','canceled','needs_approval','failed')),
  lease_owner text,
  lease_until timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists orbit_remediation_incidents_ready_idx on public.orbit_remediation_incidents (state, lease_until);
alter table public.orbit_remediation_incidents enable row level security;
revoke all on public.orbit_remediation_incidents from anon;
grant select on public.orbit_remediation_incidents to authenticated;
grant all on public.orbit_remediation_incidents to service_role;
create table if not exists public.orbit_remediation_class_approvals (
  incident_class text primary key check (incident_class in ('follow_up','meeting_confirmation','meeting_reminder','edge_deploy_drift')),
  approved boolean not null default false, approved_by uuid, approved_at timestamptz, canary_run_id text, expires_at timestamptz
);
alter table public.orbit_remediation_class_approvals enable row level security;
revoke all on public.orbit_remediation_class_approvals from anon, authenticated;
grant all on public.orbit_remediation_class_approvals to service_role;
comment on table public.orbit_remediation_incidents is 'Persistent handoff from read-only monitor; business data remains writer-isolated.';
