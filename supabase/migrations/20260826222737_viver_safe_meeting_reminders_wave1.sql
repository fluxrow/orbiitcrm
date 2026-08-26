-- Viver safe reminders wave 1: add the five-minute event contract and run
-- the scheduler frequently enough to hit its narrow, fail-closed window.
-- This migration does not create flows, enqueue messages or reprocess backlog.

ALTER TYPE public.orbit_flow_trigger_type
  ADD VALUE IF NOT EXISTS 'meeting_reminder_5m';

DO $cron$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id
  FROM cron.job
  WHERE jobname = 'orbit-meeting-scheduler';

  IF v_job_id IS NULL THEN
    RAISE EXCEPTION 'ORBIT_MEETING_SCHEDULER_JOB_NOT_FOUND';
  END IF;

  PERFORM cron.alter_job(v_job_id, schedule => '* * * * *');
END
$cron$;
