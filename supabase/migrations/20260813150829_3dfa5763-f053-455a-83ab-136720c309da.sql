-- Snapshot de segurança antes da mudança (rollback determinístico).
INSERT INTO public.orbit_quarantine_backups (empresa_id, batch_label, entity_type, entity_id, snapshot)
SELECT
  c.empresa_id,
  'bullink-identity-guard-2026-08-13',
  'orbit_ai_config',
  c.id,
  to_jsonb(c)
FROM public.orbit_ai_config c
WHERE c.empresa_id = '4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18';

-- Flag tenant-scoped: bloqueia falsa separação de identidade (especialista/consultor/equipe).
-- Default false preserva o comportamento de todos os outros tenants byte-for-byte.
ALTER TABLE public.orbit_ai_config
  ADD COLUMN IF NOT EXISTS block_identity_split boolean NOT NULL DEFAULT false;

-- Ativação exclusiva do tenant Bullink.
UPDATE public.orbit_ai_config
SET block_identity_split = true
WHERE empresa_id = '4f6b4a18-f3aa-4bfb-a13f-926e4a07ad18';