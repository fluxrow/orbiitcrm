
UPDATE orbit_flow_scheduled_actions
SET status='canceled', canceled_reason='smoke_cleanup', updated_at=now()
WHERE prospect_id IN (
  '64c4bc75-131e-4725-91a2-25f622396fab',
  '22f9fa9a-ed4a-4f61-8ac2-81c3eed8da24',
  '95525e9d-7f82-4bcd-9eda-5e7d51a6ba2c',
  '6ef2a725-24be-445b-a9e8-2c7b3ac4c56f',
  '4c771920-11c4-422b-985f-cc35a8f8bb9d',
  '69519be3-8615-4510-bf98-600331ac123a'
) AND status='pending';

UPDATE orbit_prospects
SET deleted_at=now(), updated_at=now()
WHERE id IN (
  '64c4bc75-131e-4725-91a2-25f622396fab',
  '22f9fa9a-ed4a-4f61-8ac2-81c3eed8da24',
  '95525e9d-7f82-4bcd-9eda-5e7d51a6ba2c',
  '6ef2a725-24be-445b-a9e8-2c7b3ac4c56f',
  '4c771920-11c4-422b-985f-cc35a8f8bb9d',
  '69519be3-8615-4510-bf98-600331ac123a'
);
