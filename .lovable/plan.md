

# Fix: Contador de leads mostrando 1000 (limite do Supabase)

## Problema

O hook `useOrbitProspects()` faz um `select(*)` sem paginação. O Supabase tem um **limite padrão de 1000 linhas** por query. Então, mesmo que existam menos registros, ou se existirem mais, o resultado sempre será truncado em 1000 — e o contador na linha 229 do `RecipientSelector` exibe `filteredProspects.length`, que reflete esse limite.

## Correção

### 1. `src/hooks/useOrbitProspects.ts` — Buscar todos os registros

Adicionar paginação automática no hook para buscar **todos** os prospects (não apenas os primeiros 1000). Implementar um loop que faz `range(from, from+999)` até que retorne menos que o `pageSize`.

Alternativamente (mais simples e performático para o caso de uso do selector): usar a query com `count: 'exact'` e aumentar o range para cobrir todos os registros.

A solução mais limpa: no `useOrbitProspects`, adicionar `.range(0, 4999)` para cobrir até 5000 registros (ou usar paginação server-side no futuro).

### 2. `src/components/orbit/RecipientSelector.tsx` — Usar contagem real

Na linha 229, usar `useOrbitProspectsCount()` para exibir o total real **antes dos filtros client-side**, e manter `filteredProspects.length` como contagem filtrada.

### Alterações concretas

**`src/hooks/useOrbitProspects.ts`**: Na query principal, fazer fetch paginado (loop com `range`) para garantir que todos os registros sejam retornados, não apenas os primeiros 1000.

**`src/components/orbit/RecipientSelector.tsx`**: Importar `useOrbitProspectsCount` e exibir o total real de prospects na UI, além do total filtrado.

