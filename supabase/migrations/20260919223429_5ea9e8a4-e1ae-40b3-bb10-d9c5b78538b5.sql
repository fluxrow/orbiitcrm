-- Separate migration: PostgreSQL cannot use a newly added enum value in the
-- same transaction that adds it.
ALTER TYPE public.orbit_flow_trigger_type
  ADD VALUE IF NOT EXISTS 'meeting_reminder_morning';