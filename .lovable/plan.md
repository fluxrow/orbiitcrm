
# Etapa 3I -- Paginacao / Load More em Interacoes

Implementar carregamento paginado nas interacoes para evitar renderizacao de centenas de registros de uma vez.

---

## Abordagem

Usar paginacao offset-based com `useInfiniteQuery` do TanStack Query. Supabase `.range()` simplifica a implementacao sem necessidade de cursor customizado no banco.

---

## Mudancas

### 1. Hook: `src/hooks/useInteracoes.ts`

**Nova funcao `useInteracoesPaginated`** (manter `useInteracoes` original intacta para outros consumidores):

- Usar `useInfiniteQuery` do TanStack Query
- Parametros: `{ oportunidade_id?, cliente_id?, pageSize = 50 }`
- Cada pagina usa `.range(offset, offset + pageSize - 1)` com `.order("data_interacao", { ascending: false })`
- Manter os mesmos JOINs: `pe_users:user_id(full_name), contatos(nome), clientes(razao_social)`
- `getNextPageParam`: se a pagina retornou `pageSize` registros, ha mais; caso contrario, `undefined`
- Retorna `data.pages.flatMap(p => p)` como lista achatada, mais `fetchNextPage`, `hasNextPage`, `isFetchingNextPage`

### 2. UI: `src/components/pe-admin/InteracoesTab.tsx`

- Substituir `useInteracoes` por `useInteracoesPaginated`
- Achatar paginas em array unico para renderizar timeline/lista
- Adicionar botao "Carregar mais" no final da lista quando `hasNextPage === true`
- Mostrar spinner no botao durante `isFetchingNextPage`
- Texto do botao: "Carregar mais interacoes"
- Apos criar nova interacao (dialog), invalidar query para recarregar primeira pagina

---

## Detalhes tecnicos

**Query com range:**
```text
supabase
  .from("interacoes")
  .select("*, pe_users:user_id(full_name), contatos(nome), clientes(razao_social)")
  .order("data_interacao", { ascending: false })
  .range(pageParam * pageSize, (pageParam + 1) * pageSize - 1)
  // + filtros de org, oportunidade_id, cliente_id
```

**useInfiniteQuery config:**
- `queryKey`: `["interacoes_paginated", orgId, filters]`
- `initialPageParam`: 0
- `getNextPageParam`: `(lastPage, allPages) => lastPage.length === pageSize ? allPages.length : undefined`

---

## Arquivos alterados

| Arquivo | Acao |
|---|---|
| `src/hooks/useInteracoes.ts` | Adicionar `useInteracoesPaginated` (manter hook original) |
| `src/components/pe-admin/InteracoesTab.tsx` | Usar novo hook + botao "Carregar mais" |

Nenhuma alteracao de banco necessaria.
