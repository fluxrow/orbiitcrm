
CREATE TABLE public.orbit_send_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  nome text NOT NULL,
  descricao text,
  prospect_ids uuid[] NOT NULL DEFAULT '{}',
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.orbit_send_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own empresa groups" ON public.orbit_send_groups
  FOR SELECT TO authenticated
  USING (empresa_id = get_user_empresa_id(auth.uid()));

CREATE POLICY "PE members can manage own empresa groups" ON public.orbit_send_groups
  FOR ALL TO authenticated
  USING (empresa_id = get_user_empresa_id(auth.uid()) AND pe_user_is_orbit_member(auth.uid()))
  WITH CHECK (empresa_id = get_user_empresa_id(auth.uid()) AND pe_user_is_orbit_member(auth.uid()));

CREATE POLICY "Super admin full access groups" ON public.orbit_send_groups
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'))
  WITH CHECK (has_role(auth.uid(), 'super_admin'));
