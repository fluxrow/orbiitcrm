
UPDATE orbit_flow_scheduled_actions
SET status='canceled', canceled_reason='smoke_cleanup', updated_at=now()
WHERE prospect_id IN (
  '9ca297a1-58e0-4394-94b6-bc1edc62b85f',
  '048680ce-7007-48aa-b17b-507d6f985205',
  '899c2f4d-3367-4bd9-80bc-e0219a2f4885',
  '7a84cc45-f010-4ae0-b62c-67e76db5eaca'
) AND status='pending';

UPDATE orbit_prospects SET deleted_at=now(), updated_at=now()
WHERE id IN (
  '9ca297a1-58e0-4394-94b6-bc1edc62b85f',
  '048680ce-7007-48aa-b17b-507d6f985205',
  '899c2f4d-3367-4bd9-80bc-e0219a2f4885',
  '7a84cc45-f010-4ae0-b62c-67e76db5eaca'
);
