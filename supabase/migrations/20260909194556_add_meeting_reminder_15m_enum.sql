-- Add the exact 15-minute reminder event used by Fernanda's group-class audio.
ALTER TYPE public.orbit_flow_trigger_type
  ADD VALUE IF NOT EXISTS 'meeting_reminder_15m';

ALTER TABLE public.orbit_remediation_incidents
  DROP CONSTRAINT IF EXISTS orbit_remediation_incidents_release_kind_check;
ALTER TABLE public.orbit_remediation_incidents
  ADD CONSTRAINT orbit_remediation_incidents_release_kind_check
  CHECK (release_kind IN (
    'meeting_confirmation',
    'meeting_reminder_24h',
    'meeting_reminder_1h',
    'meeting_reminder_15m',
    'meeting_reminder_5m',
    'weekly_reminder',
    'follow_up',
    'edge_deploy_drift'
  ));
