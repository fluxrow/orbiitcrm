

# Funil Comercial Estruturado no Orbit

## Resumo

Substituir as etapas genéricas existentes (`orbit_pipeline_stages`) pelas 7 etapas comerciais solicitadas, melhorar os cards do Kanban com dados enriquecidos (telefone, responsável, última interação, valor), e adicionar automações por etapa (checklist de documentos, botões contextuais, auto-criação de follow-up).

## Banco de Dados

### 1. Atualizar etapas do pipeline

Deletar as 6 etapas atuais (não há deals) e inserir as 7 novas via insert tool:

| Ordem | Nome | cor | is_won | is_lost |
|---|---|---|---|---|
| 1 | Agendar Reunião | #6366f1 | false | false |
| 2 | Apresentação Institucional | #8b5cf6 | false | false |
| 3 | Preparar Proposta | #f59e0b | false | false |
| 4 | Defesa da Proposta | #f97316 | false | false |
| 5 | Follow-up Comercial | #3b82f6 | false | false |
| 6 | Recebimento de Documentos | #14b8a6 | false | false |
| 7 | Cliente Convertido | #22c55e | true | false |

### 2. Adicionar colunas ao `orbit_deals`

Migration para adicionar campos que faltam:

```sql
ALTER TABLE orbit_deals
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS ultima_interacao_at timestamptz,
  ADD COLUMN IF NOT EXISTS documentos_checklist jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS data_conversao timestamptz,
  ADD COLUMN IF NOT EXISTS moved_at timestamptz DEFAULT now();
```

### 3. Trigger de follow-up na "Defesa da Proposta"

O trigger `trg_deal_stage_followup` já existe (conforme memória). Verificar se funciona para as novas etapas -- se sim, nenhuma mudança necessária. Se preciso, ajustar para criar tarefa automaticamente ao mover para "Defesa da Proposta".

## Frontend

### `src/pages/orbit/FunilPage.tsx` — Reescrever completamente

**Cards enriquecidos**: Cada card exibe:
- Nome da empresa/contato (do prospect vinculado)
- Telefone/WhatsApp
- Responsável
- Última interação (data relativa)
- Valor da proposta

**Ações rápidas no card** (botões de ícone):
- Iniciar conversa (link para conversas)
- Criar tarefa
- Abrir perfil do prospect
- Registrar interação

**Drag and drop**: Já implementado, manter.

**Automações por etapa**:
- **Agendar Reunião**: Botão "Criar evento de reunião" no card (abre diálogo de tarefa com tipo "reuniao")
- **Recebimento de Documentos**: Exibir checklist de documentos no card (contrato assinado, CNPJ, dados de faturamento, documento do responsável) com checkboxes salvos em `documentos_checklist` jsonb
- **Cliente Convertido**: Ao mover para esta etapa, atualizar `status` do deal para `won`, atualizar `status_qualificacao` do prospect para `cliente`, registrar `data_conversao`

**Contagem e total por etapa**: Exibir contagem de deals e valor total no header de cada coluna.

### `src/hooks/useOrbitDeals.ts` — Enriquecer queries

Atualizar `useOrbitDealsGrouped` para incluir dados do prospect (telefone, whatsapp, email) e responsável (nome) nos joins. Adicionar mutation `useConvertDealToClient` que:
1. Atualiza deal com `status: 'won'`, `data_conversao: now()`
2. Atualiza prospect com `status_qualificacao: 'cliente'`
3. Registra evento em `prospect_events`

Adicionar mutation `useUpdateDealChecklist` para salvar o jsonb de documentos.

### `src/components/orbit/DealDialog.tsx` — Expandir formulário

Adicionar campos para os novos dados (documentos, etc.) quando relevante.

### Novo: `src/components/orbit/DealCard.tsx`

Componente de card rico para o Kanban com:
- Dados do prospect
- Ações rápidas (ícones)
- Checklist condicional (etapa "Recebimento de Documentos")
- Indicador visual de última interação

### `src/components/orbit/OrbitTaskDialog.tsx`

Reutilizar para criar tarefas/reuniões a partir do funil.

## Arquivos alterados

| Arquivo | Ação |
|---|---|
| `orbit_pipeline_stages` (dados) | Substituir etapas via insert tool |
| `orbit_deals` (schema) | Adicionar colunas status, documentos_checklist, etc. |
| `src/pages/orbit/FunilPage.tsx` | Reescrever com cards enriquecidos e automações |
| `src/hooks/useOrbitDeals.ts` | Enriquecer queries e adicionar mutations |
| `src/components/orbit/DealCard.tsx` | Novo componente de card rico |
| `src/components/orbit/DealDialog.tsx` | Expandir com novos campos |

