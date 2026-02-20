

# Etapa 3A -- Pipeline de Turismo Corporativo (Pacote + Itens) -- ATUALIZADO

## Alteracao nesta revisao

Tabela `produtos` agora inclui campo `categoria` (TRANSPORTE, HOSPEDAGEM, PROTECAO, EVENTOS, SERVICOS) e seed expandido com 7 tipos de servico.

---

## Fase 1 -- Migration SQL

Uma migration criando 6 tabelas + funcao auxiliar + RLS + indices.

### Funcao auxiliar

`pe_user_is_sales_or_sdr(p_user_id uuid)` -- retorna true se role = ORG_SALES ou ORG_SDR.

### Tabelas

1. **produtos** -- tipos de servico com categoria.
   - Campos: id, organization_id, nome, codigo, **categoria** (text, not null), is_active, created_at, updated_at
   - Constraints: `unique(organization_id, codigo)`
   - Indices: `index(organization_id)`, `index(organization_id, categoria)`
   - Seed (7 registros por org):
     - AEREO / Aereo / TRANSPORTE
     - RODOVIARIO / Rodoviario / TRANSPORTE
     - LOCACAO_VEICULO / Locacao de Veiculo / TRANSPORTE
     - TRANSFER / Transfer / TRANSPORTE
     - HOSPEDAGEM / Hospedagem / HOSPEDAGEM
     - SEGURO / Seguro Viagem / PROTECAO
     - EVENTOS / Eventos / EVENTOS
   - Nota: seeds serao criados via UI (botao "Criar Produtos Padrao") pois dependem de organization_id.

2. **funil_etapas** -- etapas do funil da org (SEM produto_id). `unique(organization_id, ordem)`, `unique(organization_id, nome)`. Tipo: open/won/lost.

3. **oportunidades** -- pacote/viagem vinculado a cliente + etapa. Campos de viagem: `destino`, `data_ida`, `data_volta`, `viajantes_qtd`. FK owner/created_by para pe_users. CHECK status, probabilidade.

4. **oportunidade_itens** -- servicos dentro do pacote. FK para oportunidade + produto. Campos: descricao, quantidade, valor_unitario, valor_total, status (open/confirmed/canceled), fornecedor.

5. **interacoes** -- registros de contato (call, whatsapp, email, meeting, note). FK para cliente, oportunidade (opcional), contato (opcional), user.

6. **tarefas** -- to-dos com prioridade/status/due_date. FK para cliente, oportunidade (opcional), contato (opcional), assigned_to, created_by.

### RLS (mesmo padrao para todas)

- **SUPER_ADMIN**: ALL (bypass global)
- **Org members**: SELECT na propria org
- **Writers (admin/manager)**: INSERT, UPDATE, DELETE na propria org
- **Sales/SDR** (oportunidades): INSERT + UPDATE/DELETE apenas onde `owner_user_id = auth.uid()`
- **Sales/SDR** (interacoes): INSERT + UPDATE/DELETE apenas onde `user_id = auth.uid()`
- **Sales/SDR** (tarefas): INSERT + UPDATE/DELETE apenas onde `assigned_to_user_id = auth.uid()`
- **produtos e funil_etapas**: somente writers (admin/manager) podem modificar

---

## Fase 2 -- Hooks React (6 arquivos)

| Arquivo | Conteudo |
|---|---|
| `src/hooks/useProdutos.ts` | CRUD produtos (inclui campo `categoria`), filtro por org e por categoria, funcao `createDefaultProducts` para seed |
| `src/hooks/useFunilEtapas.ts` | CRUD etapas, reordenacao, funcao `createDefaultStages` |
| `src/hooks/useOportunidades.ts` | Lista com filtros (etapa, status, owner, cliente, destino), create, update, mover etapa (auto-status + closed_at) |
| `src/hooks/useOportunidadeItens.ts` | CRUD itens, calculo valor_total do item, recalculo valor_total_estimado da oportunidade |
| `src/hooks/useInteracoes.ts` | Lista por oportunidade/cliente, create |
| `src/hooks/useTarefas.ts` | Lista com filtros, create, update, marcar done |

### Logica de negocio

- **Mover oportunidade**: auto-status won/lost/open + closed_at conforme tipo da etapa
- **Itens**: valor_total = quantidade * valor_unitario; recalculo da soma na oportunidade
- **Audit log** em todos os hooks

---

## Fase 3 -- Paginas e Componentes

### Novas paginas (7)

| Rota | Arquivo | Descricao |
|---|---|---|
| `/pe-admin/produtos` | `ProdutosPage.tsx` | CRUD produtos em tabela, agrupados por categoria, botao "Criar Produtos Padrao" |
| `/pe-admin/funil` | `FunilEtapasPage.tsx` | Gerenciar etapas do funil |
| `/pe-admin/oportunidades` | `OportunidadesPage.tsx` | Lista/filtros de oportunidades |
| `/pe-admin/oportunidades/kanban` | `OportunidadesKanbanPage.tsx` | Visao kanban |
| `/pe-admin/oportunidades/:id` | `OportunidadeDetailPage.tsx` | Detalhes + abas Itens, Interacoes, Tarefas |
| `/pe-admin/tarefas` | `TarefasPage.tsx` | Lista de tarefas |
| (componente) | `OportunidadeItensTab.tsx` | Aba de itens dentro do detalhe |

### Componentes de suporte (5)

OportunidadeDialog, ItemDialog, InteracaoDialog, TarefaDialog, MotivoPerda

### Arquivos editados (2)

- **PeAdminLayout.tsx** -- nav items: Produtos, Funil, Oportunidades, Tarefas
- **App.tsx** -- 7 novas rotas

---

## Detalhes Tecnicos

### Permissoes por Role

| Acao | SUPER_ADMIN | ORG_ADMIN | ORG_MANAGER | ORG_SALES/SDR | ORG_VIEWER |
|---|---|---|---|---|---|
| Produtos/Funil (CRUD) | Sim | Sim | Sim | Nao | Nao |
| Oportunidades (leitura) | Todas orgs | Propria org | Propria org | Propria org | Propria org |
| Oportunidades (escrita) | Sim | Sim | Sim | Somente proprias | Nao |
| Itens/Interacoes/Tarefas | Sim | Sim | Sim | Somente proprias | Nao |

### Ordem de implementacao

1. Migration SQL (fase 1)
2. Hooks (fase 2)
3. Paginas + componentes + rotas (fase 3)

