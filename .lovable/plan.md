

# Automação: Tarefa de Follow-up ao Mudar Etapa do Funil

## Abordagem

Criar um **trigger no banco de dados** que dispara automaticamente quando um deal muda de etapa (`orbit_deals.etapa_id` é atualizado). O trigger cria uma tarefa de follow-up na tabela `orbit_tasks` com prazo de 3 dias.

Essa abordagem é superior à client-side porque funciona independentemente de onde a mudança ocorra (drag-and-drop, edição manual, API).

## Migration SQL

```sql
CREATE OR REPLACE FUNCTION auto_create_followup_task()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  stage_name text;
BEGIN
  -- Only fire when etapa_id actually changes
  IF OLD.etapa_id IS DISTINCT FROM NEW.etapa_id THEN
    -- Get stage name
    SELECT nome INTO stage_name 
    FROM orbit_pipeline_stages WHERE id = NEW.etapa_id;

    -- Create follow-up task
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

    -- Register prospect event if prospect linked
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
```

## Resultado

- Quando um deal é arrastado no Kanban do funil ou editado manualmente, o trigger detecta a mudança de `etapa_id`
- Cria automaticamente uma tarefa de follow-up com prazo de 3 dias
- A tarefa aparece no Kanban de tarefas na coluna "Esta Semana"
- Se o deal tem prospect vinculado, registra evento na timeline

## Arquivo

| Arquivo | Acao |
|---|---|
| Migration SQL | Criar trigger `trg_deal_stage_followup` + function `auto_create_followup_task` |

Nenhuma alteração no frontend é necessária -- o trigger opera no banco.

