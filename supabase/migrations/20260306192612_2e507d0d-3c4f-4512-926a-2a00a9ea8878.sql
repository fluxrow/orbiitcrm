
CREATE TABLE orbit_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid REFERENCES orbit_empresas(id),
  conversa_id uuid REFERENCES orbit_conversas(id) NOT NULL,
  prospect_id uuid REFERENCES orbit_prospects(id),
  vendedor_id uuid REFERENCES profiles(id),
  resumo text,
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE orbit_handoffs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Empresa members can view handoffs"
  ON orbit_handoffs FOR SELECT TO authenticated
  USING (empresa_id = get_user_empresa_id(auth.uid()));

CREATE POLICY "Super admin can manage all handoffs"
  ON orbit_handoffs FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role));

CREATE UNIQUE INDEX idx_handoffs_conversa_unique 
  ON orbit_handoffs (conversa_id) WHERE status IN ('sent', 'pending');

ALTER TABLE orbit_conversas
  ADD COLUMN IF NOT EXISTS handoff_sent_at timestamptz;
