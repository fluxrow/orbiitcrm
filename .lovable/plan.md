

# Etapa 3E -- Upgrade Kanban

Melhorar `/pe-admin/oportunidades/kanban` com filtros por responsavel e cards enriquecidos (badges de servicos + proxima tarefa).

---

## Abordagem Tecnica

Para evitar N+1 queries e nao precisar criar views no banco, usaremos **3 queries paralelas** no Kanban:

1. **Oportunidades** (existente, com filtro owner_user_id)
2. **Itens + Produtos** (todos os itens da org, agrupados client-side por oportunidade_id)
3. **Proximas Tarefas** (tarefas open com due_date >= hoje, agrupadas por oportunidade_id)

Todas rodam em paralelo via React Query. O merge e feito no componente.

---

## Fase 1 -- Filtro por Owner

### Arquivo: `src/pages/pe-admin/OportunidadesKanbanPage.tsx`

- Adicionar estado `ownerFilter` com valores: `"mine"` | `"all"` | `uuid`
- Importar `usePeAuth` para obter `peUser`, `roleCode`, `orgId`
- Importar `useOrgUsers` para listar usuarios da org (dropdown para admin/manager)
- Passar `owner_user_id` como filtro ao `useOportunidades`:
  - `"mine"` => `owner_user_id: peUser.id`
  - `"all"` => sem filtro
  - uuid => `owner_user_id: uuid`
- Renderizar um `Select` com:
  - "Meus" (sempre visivel)
  - "Todos" (apenas se roleCode in `['ORG_ADMIN', 'ORG_MANAGER']` ou isSuperAdmin)
  - Lista de usuarios da org (apenas admin/manager/superadmin)

O hook `useOportunidades` ja suporta `owner_user_id` como filtro -- nao precisa alterar.

---

## Fase 2 -- Badges de Servicos

### Novo hook: `src/hooks/useKanbanEnrichment.ts`

Criar hook `useOportunidadesProdutos(orgId)`:

```text
SELECT oportunidade_id, produtos.nome, produtos.categoria
FROM oportunidade_itens
JOIN produtos ON produtos.id = oportunidade_itens.produto_id
WHERE oportunidade_itens.organization_id = orgId
```

Retorna um `Map<oportunidade_id, string[]>` com nomes de produtos distintos.

### No Kanban

- Consultar o Map para cada oportunidade
- Renderizar badges coloridas (ex: "Aereo", "Hospedagem", "Seguro") abaixo do cliente

---

## Fase 3 -- Proxima Tarefa

### Mesmo hook: `useKanbanEnrichment.ts`

Criar hook `useOportunidadesProximaTarefa(orgId)`:

```text
SELECT oportunidade_id, titulo, due_date
FROM tarefas
WHERE organization_id = orgId
  AND status = 'open'
  AND due_date >= CURRENT_DATE
ORDER BY due_date ASC
```

Client-side: agrupar por `oportunidade_id`, pegar apenas a primeira (menor due_date).

Retorna um `Map<oportunidade_id, { titulo: string, due_date: string }>`.

### No Kanban

- Exibir no card: `"Proxima: dd/mm - Titulo"` em texto pequeno
- Se nao houver tarefa, nao exibir nada

---

## Fase 4 -- UI do Card Enriquecido

Layout do card atualizado:

```text
+----------------------------------+
| Titulo                      [Eye]|
| Cliente                          |
| Destino                          |
| [Aereo] [Hotel] [Seguro]        |
| Proxima: 25/02 - Ligar cliente  |
| R$ 15.000,00              80%   |
+----------------------------------+
```

- Badges usam `<Badge variant="secondary">` com texto xs
- Proxima tarefa usa icone de calendario + texto muted xs
- Maximo 3 badges visiveis + "+N" se houver mais

---

## Resumo de Arquivos

| Arquivo | Acao |
|---|---|
| `src/hooks/useKanbanEnrichment.ts` | **Novo** -- 2 hooks: produtos por oportunidade + proxima tarefa |
| `src/pages/pe-admin/OportunidadesKanbanPage.tsx` | **Editar** -- filtro owner + cards enriquecidos |

Nenhuma alteracao de banco necessaria. Todas as tabelas e RLS ja existem.

