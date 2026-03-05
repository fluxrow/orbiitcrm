

# Módulo de Tarefas no Orbit CRM

O projeto já possui uma tabela `orbit_activities` e o hook `useOrbitActivities` que cobrem atividades genéricas. Porém, o pedido é um módulo de tarefas dedicado com Kanban, calendário e integração profunda com prospects. Vou criar uma nova tabela `orbit_tasks` (separada de `orbit_activities`) para ter campos específicos como `tipo_tarefa`, `due_time`, `priority`, e status Kanban.

## 1. Migration — Tabela `orbit_tasks`

```sql
CREATE TABLE public.orbit_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  prospect_id uuid REFERENCES orbit_prospects(id) ON DELETE SET NULL,
  deal_id uuid REFERENCES orbit_deals(id) ON DELETE SET NULL,
  assigned_to uuid,
  created_by uuid,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  titulo text NOT NULL,
  descricao text,
  status text NOT NULL DEFAULT 'pending',  -- pending, in_progress, completed, cancelled
  prioridade text NOT NULL DEFAULT 'medium', -- low, medium, high
  tipo_tarefa text NOT NULL DEFAULT 'task',  -- call, email, meeting, follow_up, task
  due_date date,
  due_time time,
  notificar_responsavel boolean DEFAULT false
);
-- RLS + index + policies (empresa_id based, same pattern as other orbit tables)
```

## 2. Novo hook — `src/hooks/useOrbitTasks.ts`

- `useOrbitTasks(filters?)` — lista tarefas com join em `profiles` (assigned) e `orbit_prospects` (nome)
- `useCreateOrbitTask()` — cria tarefa + registra `prospect_events` (task_created)
- `useUpdateOrbitTask()` — atualiza campos
- `useCompleteOrbitTask()` — marca como completed + registra `prospect_events` (task_completed)

## 3. Nova página — `src/pages/orbit/TarefasPage.tsx`

Layout com 3 áreas:

- **Barra superior**: busca (titulo, prospect, descrição), filtros (status, responsável, prioridade, data), botão "+ Nova Tarefa"
- **Visualização principal**: toggle entre Kanban / Lista / Calendário
  - **Kanban**: colunas Atrasadas, Hoje, Amanhã, Esta Semana, Concluídas — cards arrastáveis
  - **Lista**: tabela simples com sorting
  - **Calendário**: grid mensal com tarefas nos dias
- **Card de tarefa**: título, prospect relacionado, responsável, data, prioridade badge, ações rápidas (concluir, editar, abrir prospect, reagendar)

## 4. Componentes novos

| Componente | Responsabilidade |
|---|---|
| `OrbitTaskCard.tsx` | Card da tarefa com ações rápidas |
| `OrbitTaskDialog.tsx` | Modal de criação/edição com todos os campos |
| `OrbitTaskKanban.tsx` | Board Kanban com colunas temporais |

## 5. Integração na sidebar

Adicionar item "Tarefas" com ícone `CheckSquare` no `OrbitSidebar.tsx`, entre "Analytics" e "Configurações".

## 6. Rota

Adicionar `<Route path="tarefas" element={<TarefasPage />} />` no `OrbitRoutes` em `App.tsx`.

## 7. Integração com ProspectActionCard

O botão "Criar tarefa" no card do prospect já existe — conectar ao `OrbitTaskDialog` passando `prospect_id`.

## 8. Widget no Dashboard

Adicionar seção "Minhas Tarefas" no `OrbitDashboard.tsx` mostrando tarefas do dia e atrasadas.

## 9. Auto-registro em prospect_events

Ao criar/concluir tarefa vinculada a um prospect, inserir evento `task_created` / `task_completed` na tabela `prospect_events`.

## Arquivos

| Arquivo | Ação |
|---|---|
| Migration SQL | Criar tabela `orbit_tasks` |
| `src/hooks/useOrbitTasks.ts` | Novo |
| `src/pages/orbit/TarefasPage.tsx` | Novo |
| `src/components/orbit/OrbitTaskCard.tsx` | Novo |
| `src/components/orbit/OrbitTaskDialog.tsx` | Novo |
| `src/components/orbit/OrbitTaskKanban.tsx` | Novo |
| `src/components/orbit/OrbitSidebar.tsx` | Adicionar link Tarefas |
| `src/App.tsx` | Adicionar rota |
| `src/pages/orbit/OrbitDashboard.tsx` | Widget de tarefas |

