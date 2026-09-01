-- Start the separate remediator in shadow mode only. The command reuses the
-- already-provisioned scheduler credential without exposing or duplicating it.
-- All class approvals must still be shadow/unapproved when this migration runs.

do $remediation_cron$
declare
  v_source_command text;
  v_shadow_count integer;
  v_auto_count integer;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron')
     or not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise exception 'REMEDIATION_CRON_DEPENDENCIES_MISSING';
  end if;

  select
    count(*) filter (where mode = 'shadow' and approved = false),
    count(*) filter (where mode = 'auto_release' or approved = true)
    into v_shadow_count, v_auto_count
  from public.orbit_remediation_class_approvals;

  if v_shadow_count <> 8 or v_auto_count <> 0 then
    raise exception 'REMEDIATION_SHADOW_BASELINE_MISMATCH';
  end if;

  select command into v_source_command
  from cron.job
  where jobname = 'orbit-flow-scheduler-tick-1min';

  if v_source_command is null then
    raise exception 'SOURCE_SCHEDULER_JOB_NOT_FOUND';
  end if;

  v_source_command := replace(
    v_source_command,
    'orbit-flow-scheduler-tick',
    'orbit-remediation-tick'
  );
  if v_source_command not ilike '%orbit-remediation-tick%' then
    raise exception 'REMEDIATION_ENDPOINT_REWRITE_FAILED';
  end if;

  if exists (
    select 1 from cron.job where jobname = 'orbit-remediation-shadow-1min'
  ) then
    perform cron.unschedule('orbit-remediation-shadow-1min');
  end if;

  perform cron.schedule(
    'orbit-remediation-shadow-1min',
    '* * * * *',
    v_source_command
  );
end
$remediation_cron$;

