
# Etapa 3J -- Indice Composto em tarefas

## Situacao atual

Existem 3 indices individuais na tabela `tarefas`:
- `idx_tarefas_org` (organization_id)
- `idx_tarefas_status` (status)
- `idx_tarefas_due` (due_date)

Nenhum indice composto cobrindo os tres campos juntos. O Postgres so pode usar um indice por scan, entao a query do Kanban enrichment (`WHERE organization_id = X AND status = 'open' AND due_date >= Y ORDER BY due_date`) nao esta otimizada.

## Alteracao

Uma unica migration SQL:

```text
CREATE INDEX idx_tarefas_org_status_due
ON public.tarefas (organization_id, status, due_date);
```

A ordem das colunas segue a seletividade da query:
1. `organization_id` -- filtro de igualdade (mais seletivo, isola tenant)
2. `status` -- filtro de igualdade ('open')
3. `due_date` -- range scan (>=) e ORDER BY

Este indice cobre completamente a query do hook `useOportunidadesProximaTarefa` e tambem beneficia a query de `useTarefas` quando filtrada por org + status.

## Indices individuais existentes

Os indices `idx_tarefas_org`, `idx_tarefas_status` e `idx_tarefas_due` continuam uteis para queries que filtram por apenas uma coluna, entao nao serao removidos.

## Resumo

| Acao | Detalhe |
|---|---|
| Migration SQL | `CREATE INDEX idx_tarefas_org_status_due ON public.tarefas (organization_id, status, due_date)` |
| Arquivos frontend | Nenhum |
| Risco | Zero -- apenas adiciona indice, nao altera dados nem schema |
