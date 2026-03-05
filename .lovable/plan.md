

# Drag-and-Drop no Kanban de Tarefas

## Abordagem

Usar a **HTML5 Drag and Drop API nativa** (sem dependência extra) para permitir arrastar cards entre colunas do Kanban. Quando um card é solto em uma coluna diferente, a ação correspondente é executada:

- **Soltar em "Concluídas"** → chama `completeTask` (muda status para `completed`)
- **Soltar em "Hoje"** → atualiza `due_date` para hoje
- **Soltar em "Amanhã"** → atualiza `due_date` para amanhã
- **Soltar em "Esta Semana"** → atualiza `due_date` para próxima sexta
- **Soltar em "Atrasadas"** → não faz sentido mover para lá, ignora

## Alterações

### 1. `OrbitTaskKanban.tsx`
- Adicionar prop `onMoveTask(taskId, targetColumn)` 
- Cada coluna recebe `onDragOver` + `onDrop` handlers
- Highlight visual na coluna durante drag-over (borda colorida)
- Passar `taskId` via `dataTransfer.setData`

### 2. `OrbitTaskCard.tsx`
- Adicionar `draggable` ao card div
- `onDragStart` seta o `task.id` no dataTransfer
- Classe visual `opacity-50` durante drag

### 3. `TarefasPage.tsx`
- Implementar handler `handleMoveTask(taskId, targetColumn)` que:
  - Se target = "completed" → chama `completeTask.mutate()`
  - Se target = "today/tomorrow/thisWeek" → chama `updateTask.mutate()` com novo `due_date`
  - Toast de confirmação

## Arquivos editados

| Arquivo | Ação |
|---|---|
| `src/components/orbit/OrbitTaskCard.tsx` | Adicionar draggable + onDragStart |
| `src/components/orbit/OrbitTaskKanban.tsx` | Adicionar drop zones nas colunas |
| `src/pages/orbit/TarefasPage.tsx` | Handler de move + integrar mutations |

