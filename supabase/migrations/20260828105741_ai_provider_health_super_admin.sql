-- Global AI provider observability. This data belongs to the platform, not to a
-- tenant, and is deliberately visible only to authenticated super admins.

create table if not exists public.orbit_ai_provider_monitor_config (
  provider text primary key,
  enabled boolean not null default true,
  warning_days_remaining numeric(10,2) not null default 7,
  critical_days_remaining numeric(10,2) not null default 3,
  warning_balance_usd numeric(12,4) not null default 20,
  critical_balance_usd numeric(12,4) not null default 10,
  baseline_credit_usd numeric(12,4),
  baseline_recorded_at timestamptz,
  alert_email text not null default 'fbcfarias@icloud.com',
  alert_cooldown_minutes integer not null default 360,
  updated_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orbit_ai_provider_monitor_config_provider_check
    check (provider ~ '^[a-z0-9_-]+$'),
  constraint orbit_ai_provider_monitor_config_thresholds_check
    check (
      warning_days_remaining >= critical_days_remaining
      and critical_days_remaining >= 0
      and warning_balance_usd >= critical_balance_usd
      and critical_balance_usd >= 0
      and alert_cooldown_minutes between 15 and 10080
    ),
  constraint orbit_ai_provider_monitor_config_baseline_check
    check (
      (baseline_credit_usd is null and baseline_recorded_at is null)
      or (baseline_credit_usd >= 0 and baseline_recorded_at is not null)
    )
);

create table if not exists public.orbit_ai_provider_health (
  provider text primary key references public.orbit_ai_provider_monitor_config(provider) on delete cascade,
  status text not null default 'unknown',
  provider_ok boolean,
  admin_api_configured boolean not null default false,
  currency text not null default 'USD',
  cost_today_usd numeric(14,6),
  cost_7d_usd numeric(14,6),
  cost_30d_usd numeric(14,6),
  average_daily_cost_7d_usd numeric(14,6),
  estimated_balance_usd numeric(14,6),
  projected_days_remaining numeric(14,2),
  last_checked_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_error_code text,
  last_provider_status integer,
  consecutive_failures integer not null default 0,
  latency_ms integer,
  data_source text not null default 'none',
  details jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint orbit_ai_provider_health_status_check
    check (status in ('healthy', 'warning', 'critical', 'depleted', 'degraded', 'unknown')),
  constraint orbit_ai_provider_health_source_check
    check (data_source in ('admin_cost_api', 'live_probe', 'runtime', 'none')),
  constraint orbit_ai_provider_health_nonnegative_check
    check (
      coalesce(cost_today_usd, 0) >= 0
      and coalesce(cost_7d_usd, 0) >= 0
      and coalesce(cost_30d_usd, 0) >= 0
      and coalesce(average_daily_cost_7d_usd, 0) >= 0
      and coalesce(estimated_balance_usd, 0) >= 0
      and coalesce(projected_days_remaining, 0) >= 0
      and consecutive_failures >= 0
    )
);

create table if not exists public.orbit_ai_provider_alert_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null references public.orbit_ai_provider_monitor_config(provider) on delete cascade,
  severity text not null,
  event_type text not null,
  status text not null default 'open',
  dedupe_key text not null,
  message text not null,
  metrics jsonb not null default '{}'::jsonb,
  email_sent boolean not null default false,
  email_provider_id text,
  email_error text,
  last_notified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint orbit_ai_provider_alert_events_severity_check
    check (severity in ('info', 'warning', 'critical')),
  constraint orbit_ai_provider_alert_events_status_check
    check (status in ('open', 'recovered'))
);

create unique index if not exists orbit_ai_provider_alert_events_open_dedupe_idx
  on public.orbit_ai_provider_alert_events(provider, dedupe_key)
  where status = 'open';

create index if not exists orbit_ai_provider_alert_events_recent_idx
  on public.orbit_ai_provider_alert_events(provider, created_at desc);

alter table public.orbit_ai_provider_monitor_config enable row level security;
alter table public.orbit_ai_provider_health enable row level security;
alter table public.orbit_ai_provider_alert_events enable row level security;

drop policy if exists orbit_ai_provider_monitor_config_super_admin_select
  on public.orbit_ai_provider_monitor_config;
create policy orbit_ai_provider_monitor_config_super_admin_select
  on public.orbit_ai_provider_monitor_config
  for select to authenticated
  using (public.pe_is_super_admin((select auth.uid())));

drop policy if exists orbit_ai_provider_health_super_admin_select
  on public.orbit_ai_provider_health;
create policy orbit_ai_provider_health_super_admin_select
  on public.orbit_ai_provider_health
  for select to authenticated
  using (public.pe_is_super_admin((select auth.uid())));

drop policy if exists orbit_ai_provider_alert_events_super_admin_select
  on public.orbit_ai_provider_alert_events;
create policy orbit_ai_provider_alert_events_super_admin_select
  on public.orbit_ai_provider_alert_events
  for select to authenticated
  using (public.pe_is_super_admin((select auth.uid())));

revoke all on public.orbit_ai_provider_monitor_config from public, anon;
revoke all on public.orbit_ai_provider_health from public, anon;
revoke all on public.orbit_ai_provider_alert_events from public, anon;
grant select on public.orbit_ai_provider_monitor_config to authenticated;
grant select on public.orbit_ai_provider_health to authenticated;
grant select on public.orbit_ai_provider_alert_events to authenticated;

insert into public.orbit_ai_provider_monitor_config (provider)
values ('anthropic')
on conflict (provider) do nothing;

insert into public.orbit_ai_provider_health (provider)
values ('anthropic')
on conflict (provider) do nothing;

create or replace function public.orbit_get_ai_provider_health()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null or not public.pe_is_super_admin(v_uid) then
    raise exception 'SUPER_ADMIN_REQUIRED' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'config', to_jsonb(c),
    'health', to_jsonb(h),
    'recent_alerts', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.created_at desc)
      from (
        select id, provider, severity, event_type, status, message, metrics,
               email_sent, email_error, last_notified_at, created_at, resolved_at
        from public.orbit_ai_provider_alert_events
        where provider = c.provider
        order by created_at desc
        limit 20
      ) a
    ), '[]'::jsonb)
  ) into v_result
  from public.orbit_ai_provider_monitor_config c
  left join public.orbit_ai_provider_health h on h.provider = c.provider
  where c.provider = 'anthropic';

  return coalesce(v_result, '{}'::jsonb);
end;
$$;

revoke all on function public.orbit_get_ai_provider_health() from public, anon;
grant execute on function public.orbit_get_ai_provider_health() to authenticated;

create or replace function public.orbit_update_ai_provider_monitor_config(
  p_warning_days_remaining numeric default null,
  p_critical_days_remaining numeric default null,
  p_warning_balance_usd numeric default null,
  p_critical_balance_usd numeric default null,
  p_baseline_credit_usd numeric default null,
  p_baseline_recorded_at timestamptz default null,
  p_alert_email text default null,
  p_enabled boolean default null,
  p_clear_baseline boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.orbit_ai_provider_monitor_config%rowtype;
begin
  if v_uid is null or not public.pe_is_super_admin(v_uid) then
    raise exception 'SUPER_ADMIN_REQUIRED' using errcode = '42501';
  end if;

  if p_alert_email is not null and p_alert_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'INVALID_ALERT_EMAIL' using errcode = '22023';
  end if;

  update public.orbit_ai_provider_monitor_config
  set warning_days_remaining = coalesce(p_warning_days_remaining, warning_days_remaining),
      critical_days_remaining = coalesce(p_critical_days_remaining, critical_days_remaining),
      warning_balance_usd = coalesce(p_warning_balance_usd, warning_balance_usd),
      critical_balance_usd = coalesce(p_critical_balance_usd, critical_balance_usd),
      baseline_credit_usd = case
        when p_clear_baseline then null
        else coalesce(p_baseline_credit_usd, baseline_credit_usd)
      end,
      baseline_recorded_at = case
        when p_clear_baseline then null
        when p_baseline_credit_usd is not null then coalesce(p_baseline_recorded_at, now())
        else baseline_recorded_at
      end,
      alert_email = coalesce(nullif(trim(p_alert_email), ''), alert_email),
      enabled = coalesce(p_enabled, enabled),
      updated_by = v_uid,
      updated_at = now()
  where provider = 'anthropic'
  returning * into v_row;

  insert into public.orbit_audit_log (empresa_id, user_id, acao, entidade, detalhes)
  values (
    null,
    v_uid,
    'ai_provider_monitor_config_updated',
    'orbit_ai_provider_monitor_config',
    jsonb_build_object(
      'provider', 'anthropic',
      'enabled', v_row.enabled,
      'warning_days_remaining', v_row.warning_days_remaining,
      'critical_days_remaining', v_row.critical_days_remaining,
      'warning_balance_usd', v_row.warning_balance_usd,
      'critical_balance_usd', v_row.critical_balance_usd,
      'baseline_configured', v_row.baseline_credit_usd is not null,
      'alert_email_domain', split_part(v_row.alert_email, '@', 2)
    )
  );

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.orbit_update_ai_provider_monitor_config(
  numeric, numeric, numeric, numeric, numeric, timestamptz, text, boolean, boolean
) from public, anon;
grant execute on function public.orbit_update_ai_provider_monitor_config(
  numeric, numeric, numeric, numeric, numeric, timestamptz, text, boolean, boolean
) to authenticated;

comment on table public.orbit_ai_provider_health is
  'Global provider health snapshot. Never stores API keys, prompts, completions or tenant PII.';
comment on column public.orbit_ai_provider_health.estimated_balance_usd is
  'Estimate derived from a manually recorded prepaid baseline minus official Anthropic cost report; not an exact provider balance.';

-- Verificação horária de baixo custo: um probe de no máximo 1 token por hora.
-- A função continua protegida por service role e pode ser desativada pela
-- configuração global sem remover o job.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron')
     and exists (select 1 from pg_extension where extname = 'pg_net') then
    if exists (select 1 from cron.job where jobname = 'orbit-ai-provider-health-hourly') then
      perform cron.unschedule('orbit-ai-provider-health-hourly');
    end if;
    perform cron.schedule(
      'orbit-ai-provider-health-hourly',
      '17 * * * *',
      $job$
        select net.http_post(
          url := 'https://oqsnzwkiwgqwopuaugxj.supabase.co/functions/v1/orbit-ai-provider-health',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
          ),
          body := '{"action":"refresh","source":"cron"}'::jsonb
        );
      $job$
    );
  end if;
end;
$$;
