

# Painel de Detalhes do Prospect na Tela de Conversas

## Resumo

Ao clicar no nome do contato no cabeçalho da conversa, abrir um **Sheet (drawer lateral direito)** com os dados completos do prospect, ações rápidas e deals vinculados.

## Alterações

### 1. Criar `src/components/orbit/ConversaProspectDrawer.tsx`

Componente Sheet lateral direito contendo:

**Dados do prospect** (da relação `active.prospect`):
- Nome, empresa, cargo, email, telefone, WhatsApp, cidade/estado, segmento, origem, status, responsável, tags, data criação, observações

**Deals vinculados** — query `orbit_deals` por `prospect_id`:
- Etapa do funil, valor estimado, status

**Tarefas pendentes** — query `orbit_tasks` por `prospect_id` com status pending:
- Próximo follow-up

**Ações rápidas**:
- Copiar email / telefone (clipboard)
- Editar prospect (abrir `ProspectDialog` existente)
- Abrir cadastro completo (`/prospects?id=...`)
- Ver no funil (`/funil`)

**Estado vazio**: se `prospect_id` for null, mostrar mensagem "Nenhum contato vinculado"

### 2. Atualizar `src/pages/orbit/ConversasPage.tsx`

- Adicionar state `drawerProspectOpen`
- No header (linha ~294), tornar o nome do prospect clicável:
  - `cursor-pointer`, `hover:underline`, `hover:text-primary`
  - `onClick` abre o drawer
- Importar e renderizar `ConversaProspectDrawer`

### 3. Busca de dados do responsável

- Usar query simples para buscar `profiles` pelo `responsavel_id` do prospect para exibir nome do responsável

## Componentes reaproveitados

- `Sheet` / `SheetContent` do shadcn (já existe)
- `ProspectDialog` para edição
- Hooks `useOrbitDeals`, `useOrbitTasks` existentes

| Arquivo | Ação |
|---------|------|
| `src/components/orbit/ConversaProspectDrawer.tsx` | Criar drawer com dados, deals e ações rápidas |
| `src/pages/orbit/ConversasPage.tsx` | Nome clicável no header + renderizar drawer |

