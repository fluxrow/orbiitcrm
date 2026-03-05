
CREATE TABLE public.orbit_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  prospect_id uuid REFERENCES public.orbit_prospects(id) ON DELETE SET NULL,
  deal_id uuid REFERENCES public.orbit_deals(id) ON DELETE SET NULL,
  assigned_to uuid,
  created_by uuid,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  titulo text NOT NULL,
  descricao text,
  status text NOT NULL DEFAULT 'pending',
  prioridade text NOT NULL DEFAULT 'medium',
  tipo_tarefa text NOT NULL DEFAULT 'task',
  due_date date,
  due_time time,
  notificar_responsavel boolean DEFAULT false
);

ALTER TABLE public.orbit_tasks ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_orbit_tasks_empresa ON public.orbit_tasks(empresa_id);
CREATE INDEX idx_orbit_tasks_prospect ON public.orbit_tasks(prospect_id);
CREATE INDEX idx_orbit_tasks_assigned ON public.orbit_tasks(assigned_to);
CREATE INDEX idx_orbit_tasks_due_date ON public.orbit_tasks(due_date);
CREATE INDEX idx_orbit_tasks_status ON public.orbit_tasks(status);

CREATE POLICY "Users can view own empresa tasks" ON public.orbit_tasks FOR SELECT USING (empresa_id = get_user_empresa_id(auth.uid()));
CREATE POLICY "PE members can insert own empresa tasks" ON public.orbit_tasks FOR INSERT WITH CHECK (empresa_id = get_user_empresa_id(auth.uid()) AND pe_user_is_orbit_member(auth.uid()));
CREATE POLICY "PE members can update own empresa tasks" ON public.orbit_tasks FOR UPDATE USING (empresa_id = get_user_empresa_id(auth.uid()) AND pe_user_is_orbit_member(auth.uid()));
CREATE POLICY "PE members can delete own empresa tasks" ON public.orbit_tasks FOR DELETE USING (empresa_id = get_user_empresa_id(auth.uid()) AND pe_user_is_orbit_member(auth.uid()));
CREATE POLICY "Super admin full access orbit_tasks" ON public.orbit_tasks FOR ALL USING (has_role(auth.uid(), 'super_admin'::app_role));
