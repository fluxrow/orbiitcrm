DELETE FROM public.orbit_mensagens WHERE conversa_id IN ('ddcfe3e9-d785-44b1-b157-df91bd26037c','1a88e0f3-e0bd-48a6-8893-aca89c81cc07');
DELETE FROM public.orbit_conversas WHERE id IN ('ddcfe3e9-d785-44b1-b157-df91bd26037c','1a88e0f3-e0bd-48a6-8893-aca89c81cc07');
DELETE FROM public.orbit_tasks WHERE id IN ('09a6eea5-b52b-4459-81f5-be2c004dd901','70351ee2-7651-4692-bab4-3e5949673a50');
UPDATE public.orbit_prospects SET deleted_at=now() WHERE id IN ('44444444-5555-6666-7777-888888880001','44444444-5555-6666-7777-888888880002');