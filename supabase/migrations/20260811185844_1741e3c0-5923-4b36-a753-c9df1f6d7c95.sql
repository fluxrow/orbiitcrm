ALTER TABLE public.orbit_conversas
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS quarantine_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_orbit_conversas_archived_at
  ON public.orbit_conversas (empresa_id, archived_at);

CREATE TABLE IF NOT EXISTS public.orbit_quarantine_backups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL,
  batch_label TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  snapshot JSONB NOT NULL,
  restored_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_orbit_quarantine_backups_batch
  ON public.orbit_quarantine_backups (empresa_id, batch_label, entity_type);

GRANT SELECT ON public.orbit_quarantine_backups TO authenticated;
GRANT ALL ON public.orbit_quarantine_backups TO service_role;

ALTER TABLE public.orbit_quarantine_backups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant members can view their quarantine backups"
ON public.orbit_quarantine_backups
FOR SELECT
TO authenticated
USING (
  empresa_id = public.get_user_empresa_id(auth.uid())
  OR public.has_role(auth.uid(), 'super_admin')
);

CREATE TRIGGER update_orbit_quarantine_backups_updated_at
BEFORE UPDATE ON public.orbit_quarantine_backups
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();