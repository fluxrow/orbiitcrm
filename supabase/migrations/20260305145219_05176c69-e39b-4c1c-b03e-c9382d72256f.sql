CREATE OR REPLACE FUNCTION auto_create_followup_task()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stage_name text;
BEGIN
  IF OLD.etapa_id IS DISTINCT FROM NEW.etapa_id THEN
    SELECT nome INTO stage_name 
    FROM orbit_pipeline_stages WHERE id = NEW.etapa_id;

    INSERT INTO orbit_tasks (
      empresa_id, prospect_id, deal_id, 
      assigned_to, created_by,
      titulo, descricao, 
      tipo_tarefa, prioridade, status,
      due_date
    ) VALUES (
      NEW.empresa_id, NEW.prospect_id, NEW.id,
      NEW.responsavel_id, NEW.responsavel_id,
      'Follow-up: ' || NEW.titulo,
      'Tarefa automática - Deal movido para etapa "' || COALESCE(stage_name, '?') || '"',
      'follow_up', 'medium', 'pending',
      CURRENT_DATE + INTERVAL '3 days'
    );

    IF NEW.prospect_id IS NOT NULL THEN
      INSERT INTO prospect_events (
        empresa_id, prospect_id, actor_user_id,
        event_type, titulo, descricao
      ) VALUES (
        NEW.empresa_id, NEW.prospect_id, NEW.responsavel_id,
        'task_created', 'Follow-up automático criado',
        'Tarefa criada ao mover deal para "' || COALESCE(stage_name, '?') || '"'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_deal_stage_followup
  AFTER UPDATE ON orbit_deals
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_followup_task();