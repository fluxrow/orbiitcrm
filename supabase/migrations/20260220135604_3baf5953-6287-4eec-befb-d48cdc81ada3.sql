CREATE INDEX IF NOT EXISTS idx_tarefas_org_status_due
ON public.tarefas (organization_id, status, due_date);