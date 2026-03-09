ALTER TABLE orbit_campaigns DROP CONSTRAINT orbit_campaigns_status_check;
ALTER TABLE orbit_campaigns ADD CONSTRAINT orbit_campaigns_status_check 
  CHECK (status = ANY (ARRAY[
    'rascunho', 'agendada', 'enviando', 'concluida', 'pausada', 'cancelada',
    'pendente_aprovacao', 'aprovada', 'reprovada',
    'em_revisao', 'aprovada_para_envio', 'pausada_por_limite'
  ]));