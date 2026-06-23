
-- Generate slug for Fluxrow if missing
UPDATE public.orbit_empresas
SET slug = public.generate_unique_slug(nome)
WHERE id = '4de0ed22-0fe5-40ef-aaed-703dd3070291'
  AND (slug IS NULL OR slug = '');

-- Link user fbcfarias@icloud.com as admin of Fluxrow
INSERT INTO public.user_empresa_memberships (user_id, empresa_id, role)
VALUES (
  'a37f7f1b-3a75-41df-81c1-aaf07fab2cba',
  '4de0ed22-0fe5-40ef-aaed-703dd3070291',
  'admin'
)
ON CONFLICT (user_id, empresa_id) DO NOTHING;
