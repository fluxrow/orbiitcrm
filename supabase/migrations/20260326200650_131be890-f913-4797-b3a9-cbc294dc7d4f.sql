
-- Delete related data first, then campaigns
DELETE FROM orbit_email_events WHERE recipient_id IN (
  SELECT id FROM orbit_campaign_recipients WHERE campaign_id IN (
    '3caf5484-fbbc-42e0-89ba-effe81cbc9d3',
    'df2e3e16-2b93-4863-bdb1-83ea54fe3955',
    'eb08928d-9413-40e9-a8bd-728aff8f3866',
    '6229bf24-bb23-471d-88c4-1740cb0be21f',
    'de9b2935-80ce-49b1-a312-023511de3f13',
    '2991703a-b7ff-47f5-8090-19c1cec71c46',
    '5686696e-5d28-47aa-92ec-9bf1caab5341',
    '7475e377-cc1a-4176-9f28-c43b90c8258f',
    '87b05c5f-55cd-49fd-a0cc-8790c7f5bf97',
    'a79e9290-0154-4705-8037-e4ce7cdd9a23',
    'ff661580-00a8-4bda-984c-f693241d7bd5',
    '04408d22-2c07-4afe-8f6c-b8e22274eab0',
    '406674e8-6341-43a1-8b58-9cb97f069d27',
    '4be1dc67-2364-467d-9aef-a668a88ad0b3',
    '9943a7ef-9b3b-4c9f-b749-b600848c2396',
    '4a2e26fb-0aed-4428-9a0b-e39a7348a69e'
  )
);

DELETE FROM orbit_campaign_recipients WHERE campaign_id IN (
  '3caf5484-fbbc-42e0-89ba-effe81cbc9d3',
  'df2e3e16-2b93-4863-bdb1-83ea54fe3955',
  'eb08928d-9413-40e9-a8bd-728aff8f3866',
  '6229bf24-bb23-471d-88c4-1740cb0be21f',
  'de9b2935-80ce-49b1-a312-023511de3f13',
  '2991703a-b7ff-47f5-8090-19c1cec71c46',
  '5686696e-5d28-47aa-92ec-9bf1caab5341',
  '7475e377-cc1a-4176-9f28-c43b90c8258f',
  '87b05c5f-55cd-49fd-a0cc-8790c7f5bf97',
  'a79e9290-0154-4705-8037-e4ce7cdd9a23',
  'ff661580-00a8-4bda-984c-f693241d7bd5',
  '04408d22-2c07-4afe-8f6c-b8e22274eab0',
  '406674e8-6341-43a1-8b58-9cb97f069d27',
  '4be1dc67-2364-467d-9aef-a668a88ad0b3',
  '9943a7ef-9b3b-4c9f-b749-b600848c2396',
  '4a2e26fb-0aed-4428-9a0b-e39a7348a69e'
);

DELETE FROM orbit_campaign_approvals WHERE campaign_id IN (
  '3caf5484-fbbc-42e0-89ba-effe81cbc9d3',
  'df2e3e16-2b93-4863-bdb1-83ea54fe3955',
  'eb08928d-9413-40e9-a8bd-728aff8f3866',
  '6229bf24-bb23-471d-88c4-1740cb0be21f',
  'de9b2935-80ce-49b1-a312-023511de3f13',
  '2991703a-b7ff-47f5-8090-19c1cec71c46',
  '5686696e-5d28-47aa-92ec-9bf1caab5341',
  '7475e377-cc1a-4176-9f28-c43b90c8258f',
  '87b05c5f-55cd-49fd-a0cc-8790c7f5bf97',
  'a79e9290-0154-4705-8037-e4ce7cdd9a23',
  'ff661580-00a8-4bda-984c-f693241d7bd5',
  '04408d22-2c07-4afe-8f6c-b8e22274eab0',
  '406674e8-6341-43a1-8b58-9cb97f069d27',
  '4be1dc67-2364-467d-9aef-a668a88ad0b3',
  '9943a7ef-9b3b-4c9f-b749-b600848c2396',
  '4a2e26fb-0aed-4428-9a0b-e39a7348a69e'
);

DELETE FROM orbit_mensagens WHERE campaign_id IN (
  '3caf5484-fbbc-42e0-89ba-effe81cbc9d3',
  'df2e3e16-2b93-4863-bdb1-83ea54fe3955',
  'eb08928d-9413-40e9-a8bd-728aff8f3866',
  '6229bf24-bb23-471d-88c4-1740cb0be21f',
  'de9b2935-80ce-49b1-a312-023511de3f13',
  '2991703a-b7ff-47f5-8090-19c1cec71c46',
  '5686696e-5d28-47aa-92ec-9bf1caab5341',
  '7475e377-cc1a-4176-9f28-c43b90c8258f',
  '87b05c5f-55cd-49fd-a0cc-8790c7f5bf97',
  'a79e9290-0154-4705-8037-e4ce7cdd9a23',
  'ff661580-00a8-4bda-984c-f693241d7bd5',
  '04408d22-2c07-4afe-8f6c-b8e22274eab0',
  '406674e8-6341-43a1-8b58-9cb97f069d27',
  '4be1dc67-2364-467d-9aef-a668a88ad0b3',
  '9943a7ef-9b3b-4c9f-b749-b600848c2396',
  '4a2e26fb-0aed-4428-9a0b-e39a7348a69e'
);

DELETE FROM orbit_campaigns WHERE id IN (
  '3caf5484-fbbc-42e0-89ba-effe81cbc9d3',
  'df2e3e16-2b93-4863-bdb1-83ea54fe3955',
  'eb08928d-9413-40e9-a8bd-728aff8f3866',
  '6229bf24-bb23-471d-88c4-1740cb0be21f',
  'de9b2935-80ce-49b1-a312-023511de3f13',
  '2991703a-b7ff-47f5-8090-19c1cec71c46',
  '5686696e-5d28-47aa-92ec-9bf1caab5341',
  '7475e377-cc1a-4176-9f28-c43b90c8258f',
  '87b05c5f-55cd-49fd-a0cc-8790c7f5bf97',
  'a79e9290-0154-4705-8037-e4ce7cdd9a23',
  'ff661580-00a8-4bda-984c-f693241d7bd5',
  '04408d22-2c07-4afe-8f6c-b8e22274eab0',
  '406674e8-6341-43a1-8b58-9cb97f069d27',
  '4be1dc67-2364-467d-9aef-a668a88ad0b3',
  '9943a7ef-9b3b-4c9f-b749-b600848c2396',
  '4a2e26fb-0aed-4428-9a0b-e39a7348a69e'
);
