-- Hotfix Etapa 4.1: adiciona FK orbit_tasks.assigned_to -> profiles.id
-- Resolve erro 400 "could not find relationship orbit_tasks_assigned_to_fkey"
-- Limpa órfãos antes de criar a constraint para evitar falha.
UPDATE public.orbit_tasks t
SET assigned_to = NULL
WHERE assigned_to IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = t.assigned_to);

ALTER TABLE public.orbit_tasks
  DROP CONSTRAINT IF EXISTS orbit_tasks_assigned_to_fkey;

ALTER TABLE public.orbit_tasks
  ADD CONSTRAINT orbit_tasks_assigned_to_fkey
  FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL;